import { spawn } from 'node:child_process';
import { FFMPEG_PATH, FFPROBE_PATH } from '../../binaries.js';
import { resolveRegion, type Rect, type Region } from './geometry.js';
import type { Sampled } from './pixels.js';
import { execFileAsync } from '../../../utils/execFileAsync.js';

/**
 * Reading a clip's HUD, a few times a second, as cheaply as this can be done.
 *
 * Three things keep the cost down, and the third one is the whole trick:
 *
 * 1. The GPU decodes, which on these 3440x1440 AV1 recordings is the
 *    difference between four times realtime and a third of it.
 * 2. Only a few frames a second are wanted; a HUD element that matters stays
 *    up for seconds.
 * 3. **Frames stay on the GPU until after they have been thrown away.**
 *    `-hwaccel cuda` alone copies every decoded frame into system memory and
 *    only then lets the `fps` filter drop nine tenths of them, eleven
 *    gigabytes of transfer for a half-minute clip. Adding
 *    `-hwaccel_output_format cuda` moves the drop in front of the copy and
 *    halves the wall time.
 *
 * What is deliberately *not* done is scaling the frame down before cropping.
 * It is tempting, and it ruins the measurement: at a quarter size the HUD
 * blurs into the scenery it is supposed to stand out from, and a signal that
 * read 0 then 6128 collapsed into noise between 145 and 1162. The crop happens
 * at full resolution and only the crop is scaled.
 */

const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

export interface VideoShape {
  width: number;
  height: number;
  durationSec: number;
  isHdr: boolean;
  /** The software pixel format the GPU's frames download into. */
  swFormat: 'nv12' | 'p010le';
}

export async function readShape(filePath: string): Promise<VideoShape | null> {
  try {
    const { stdout } = await execFileAsync(
      FFPROBE_PATH,
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,color_transfer,pix_fmt:format=duration',
        '-of', 'json',
        filePath,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number; color_transfer?: string; pix_fmt?: string }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream?.height) return null;
    const transfer = stream.color_transfer ?? '';
    return {
      width: stream.width,
      height: stream.height,
      durationSec: Number(parsed.format?.duration) || 0,
      isHdr: transfer === 'smpte2084' || transfer === 'arib-std-b67',
      // Naming the wrong one is a hard error from `hwdownload`, and a library
      // holds both 8-bit SDR and 10-bit HDR recordings.
      swFormat: /10|12/.test(stream.pix_fmt ?? '') ? 'p010le' : 'nv12',
    };
  } catch {
    return null;
  }
}

export interface SampledRegion extends Sampled {
  /** Where this box sat on the source frame. */
  rect: Rect;
  /** One entry per sample, in order. */
  frames: Sampled[];
}

export interface SampleOptions {
  filePath: string;
  regions: Record<string, Region>;
  fps: number;
  shape: VideoShape;
  signal?: AbortSignal;
}

/**
 * One decode, however many boxes were asked for.
 *
 * It used to be one ffmpeg per region, on the grounds that raw video cannot
 * share a pipe. That part is true and the conclusion did not follow: the boxes
 * can be stacked into one taller picture inside the filter graph and sliced
 * apart again here, so a second box costs a crop and a scale rather than a
 * second pass over the file. Decoding is nearly the whole cost: reading
 * Battlefield's two death cues as well as its kill banner took a real library
 * from 0.173 to 0.196 seconds per second of footage, three boxes for the price
 * of a little over one, where three ffmpegs would have been three times.
 *
 * **The tone map stays in front of the crop**, and that is deliberate rather
 * than left alone. Running it on the small crops instead is a quarter faster,
 * 0.174 seconds per second of footage against 0.133, and it is not the same
 * picture: the source is 4:2:0, so `zscale`'s chroma upsampling reads
 * neighbouring pixels, and cropping first changes both the neighbours at the
 * edge and the chroma phase. Measured over 40 real recordings it moved every
 * score by about five thousandths, which flipped four clips across the bar in
 * both directions: two kills lost, two found. Same count, different clips.
 * A quarter off a cached measurement is not worth quietly changing which
 * moments the app finds; in the shared head it runs once for every box anyway.
 *
 * The GPU path is tried first and a machine without one falls back to
 * software, which is slower and still finishes.
 */
interface Plan {
  name: string;
  region: Region;
  rect: Rect;
  outWidth: number;
  outHeight: number;
  /** Where this box's rows start in the stacked frame. */
  offsetY: number;
}

function planRegions(
  regions: Record<string, Region>,
  shape: VideoShape,
): { plans: Plan[]; stackWidth: number; stackHeight: number } {
  const plans: Plan[] = [];
  let offsetY = 0;
  let stackWidth = 0;
  for (const [name, region] of Object.entries(regions)) {
    const rect = resolveRegion(region, shape.width, shape.height);
    const [outWidth, outHeight] = region.out;
    plans.push({ name, region, rect, outWidth, outHeight, offsetY });
    offsetY += outHeight;
    stackWidth = Math.max(stackWidth, outWidth);
  }
  return { plans, stackWidth, stackHeight: offsetY };
}

/**
 * The filter graph for every box at once.
 *
 * `vstack` wants its inputs the same width, so a narrower box is padded on the
 * right and the padding is dropped again when the rows are sliced apart. One
 * box skips the split and the stack entirely, which keeps the single-region
 * case exactly the chain it has always been.
 */
function buildFilter(
  plans: Plan[],
  stackWidth: number,
  fps: number,
  shape: VideoShape,
  hardware: boolean,
): string {
  const head = [
    `fps=${fps}`,
    ...(hardware ? ['hwdownload', `format=${shape.swFormat}`] : []),
    ...(shape.isHdr ? [TONEMAP] : []),
  ].join(',');

  const branch = (plan: Plan): string =>
    [
      `crop=${plan.rect.w}:${plan.rect.h}:${plan.rect.x}:${plan.rect.y}`,
      `scale=${plan.outWidth}:${plan.outHeight}`,
      'format=rgb24',
      ...(plan.outWidth < stackWidth
        ? [`pad=${stackWidth}:${plan.outHeight}:0:0`]
        : []),
    ].join(',');

  if (plans.length === 1) return `${head},${branch(plans[0])}`;

  const labels = plans.map((_, i) => `r${i}`);
  return [
    `[0:v]${head},split=${plans.length}${labels.map((l) => `[${l}]`).join('')}`,
    ...plans.map((plan, i) => `[${labels[i]}]${branch(plan)}[o${i}]`),
    `${plans.map((_, i) => `[o${i}]`).join('')}vstack=inputs=${plans.length}[out]`,
  ].join(';');
}

function runFfmpeg(
  filePath: string,
  filter: string,
  hardware: boolean,
  complex: boolean,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner', '-v', 'error', '-nostdin',
      ...(hardware ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'] : []),
      '-i', filePath,
      '-an', '-sn',
      ...(complex ? ['-filter_complex', filter, '-map', '[out]'] : ['-vf', filter]),
      '-f', 'rawvideo', 'pipe:1',
    ];
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let bytes = 0;

    const abort = (): void => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    };
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      bytes += chunk.length;
    });
    child.on('error', () => {
      signal?.removeEventListener('abort', abort);
      resolve(null);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      resolve(code === 0 && bytes > 0 ? Buffer.concat(chunks, bytes) : null);
    });
  });
}

/**
 * One region's frames, out of the stacked picture.
 *
 * A box as wide as the stack is already contiguous and is handed out without
 * copying; a padded one is copied row by row, which is a memcpy per frame and
 * does not show up beside the decode.
 */
function sliceRegion(
  bytes: Buffer,
  plan: Plan,
  stackWidth: number,
  stackHeight: number,
  count: number,
): SampledRegion {
  const frameStride = stackWidth * stackHeight * 3;
  const rowStride = stackWidth * 3;
  const outRowStride = plan.outWidth * 3;
  const frames: Sampled[] = [];

  for (let i = 0; i < count; i++) {
    const top = i * frameStride + plan.offsetY * rowStride;
    if (plan.outWidth === stackWidth) {
      frames.push({
        width: plan.outWidth,
        height: plan.outHeight,
        data: new Uint8Array(bytes.buffer, bytes.byteOffset + top, plan.outHeight * rowStride),
      });
      continue;
    }
    const data = new Uint8Array(plan.outHeight * outRowStride);
    for (let row = 0; row < plan.outHeight; row++) {
      const from = bytes.byteOffset + top + row * rowStride;
      data.set(new Uint8Array(bytes.buffer, from, outRowStride), row * outRowStride);
    }
    frames.push({ width: plan.outWidth, height: plan.outHeight, data });
  }

  return {
    width: plan.outWidth,
    height: plan.outHeight,
    data: new Uint8Array(0),
    rect: plan.rect,
    frames,
  };
}

/** Sample every region a module asked for, in one pass over the file. */
export async function sampleRegions({
  filePath,
  regions,
  fps,
  shape,
  signal,
}: SampleOptions): Promise<Record<string, SampledRegion>> {
  const { plans, stackWidth, stackHeight } = planRegions(regions, shape);
  if (!plans.length || signal?.aborted) return {};

  const complex = plans.length > 1;
  const bytes =
    (await runFfmpeg(filePath, buildFilter(plans, stackWidth, fps, shape, true), true, complex, signal)) ??
    (await runFfmpeg(filePath, buildFilter(plans, stackWidth, fps, shape, false), false, complex, signal));
  if (!bytes) return {};

  const count = Math.floor(bytes.length / (stackWidth * stackHeight * 3));
  if (!count) return {};

  const out: Record<string, SampledRegion> = {};
  for (const plan of plans) {
    out[plan.name] = sliceRegion(bytes, plan, stackWidth, stackHeight, count);
  }
  return out;
}
