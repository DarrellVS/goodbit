import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { FFMPEG_PATH, FFPROBE_PATH } from '../../binaries.js';
import { resolveRegion, type Rect, type Region } from './geometry.js';
import type { Sampled } from './pixels.js';

const execFileAsync = promisify(execFile);

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
 * Grab one region's frames.
 *
 * One ffmpeg per region rather than one with several outputs: raw video cannot
 * share a pipe, and a module asks for two boxes at most. The GPU path is tried
 * first and a machine without one falls back to software, which is slower but
 * still finishes.
 */
async function sampleRegion(
  filePath: string,
  region: Region,
  fps: number,
  shape: VideoShape,
  signal?: AbortSignal,
): Promise<SampledRegion | null> {
  const rect = resolveRegion(region, shape.width, shape.height);
  const [outWidth, outHeight] = region.out;

  const filters = (hardware: boolean): string =>
    [
      `fps=${fps}`,
      ...(hardware ? ['hwdownload', `format=${shape.swFormat}`] : []),
      ...(shape.isHdr ? [TONEMAP] : []),
      `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`,
      `scale=${outWidth}:${outHeight}`,
      'format=rgb24',
    ].join(',');

  const run = (hardware: boolean): Promise<Buffer | null> =>
    new Promise((resolve) => {
      const args = [
        '-hide_banner', '-v', 'error', '-nostdin',
        ...(hardware ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'] : []),
        '-i', filePath,
        '-an', '-sn',
        '-vf', filters(hardware),
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

  const bytes = (await run(true)) ?? (await run(false));
  if (!bytes) return null;

  const stride = outWidth * outHeight * 3;
  const count = Math.floor(bytes.length / stride);
  const frames: Sampled[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({
      width: outWidth,
      height: outHeight,
      data: new Uint8Array(bytes.buffer, bytes.byteOffset + i * stride, stride),
    });
  }
  return { width: outWidth, height: outHeight, data: new Uint8Array(0), rect, frames };
}

/** Sample every region a module asked for. */
export async function sampleRegions({
  filePath,
  regions,
  fps,
  shape,
  signal,
}: SampleOptions): Promise<Record<string, SampledRegion>> {
  const out: Record<string, SampledRegion> = {};
  for (const [name, region] of Object.entries(regions)) {
    if (signal?.aborted) break;
    const sampled = await sampleRegion(filePath, region, fps, shape, signal);
    if (sampled) out[name] = sampled;
  }
  return out;
}
