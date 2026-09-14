import { execFile } from 'node:child_process';
import { FFMPEG_PATH, FFPROBE_PATH } from './binaries.js';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FFMPEG = FFMPEG_PATH;
const FFPROBE = FFPROBE_PATH;

/**
 * What this machine can do, decided once.
 *
 * OBS writes AV1 here, and software AV1 decoding of a 3440x1440 clip runs at
 * 0.44x realtime — a thirty second clip costs over a minute before a single
 * frame is encoded. With `-hwaccel cuda` the same decode takes nine seconds.
 * Detection is a real encode of a tiny synthetic clip, because a build can
 * list an encoder the GPU will refuse at runtime.
 */
export interface EncoderInfo {
  ffmpegVersion: string;
  /** Best available H.264 encoder. H.264 and not HEVC: the exports go to Discord and browsers. */
  h264: string;
  /** True when the encoder is a GPU one, so the caller can pick GPU-shaped options. */
  hardware: boolean;
  /** Decoder acceleration flag, or null when only software decoding is available. */
  hwaccel: string | null;
}

let cached: EncoderInfo | null = null;
let inFlight: Promise<EncoderInfo> | null = null;

async function works(args: string[]): Promise<boolean> {
  try {
    await execFileAsync(FFMPEG, args, { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

/** Can this encoder actually encode, on this GPU, right now? */
function encoderWorks(name: string): Promise<boolean> {
  return works([
    '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=256x256:rate=30',
    '-t', '0.2', '-c:v', name, '-f', 'null', '-',
  ]);
}

function hwaccelWorks(name: string): Promise<boolean> {
  return works([
    '-hide_banner', '-v', 'error', '-hwaccel', name,
    '-f', 'lavfi', '-i', 'testsrc=size=256x256:rate=30',
    '-t', '0.2', '-f', 'null', '-',
  ]);
}

/** The best encoder and decoder this machine offers, probed once per process. */
export async function detectEncoders(): Promise<EncoderInfo> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let version = 'unknown';
    try {
      const { stdout } = await execFileAsync(FFMPEG, ['-hide_banner', '-version']);
      version = /ffmpeg version (\S+)/.exec(stdout)?.[1] ?? 'unknown';
    } catch {
      /* a missing version string is not worth failing over */
    }

    let h264 = 'libx264';
    let hardware = false;
    for (const candidate of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
      if (await encoderWorks(candidate)) {
        h264 = candidate;
        hardware = true;
        break;
      }
    }

    let hwaccel: string | null = null;
    // Pair the decoder with the vendor that won the encoder probe where we can.
    const order = h264 === 'h264_qsv' ? ['qsv', 'd3d11va', 'cuda'] : ['cuda', 'd3d11va', 'qsv'];
    for (const candidate of order) {
      if (await hwaccelWorks(candidate)) {
        hwaccel = candidate;
        break;
      }
    }

    cached = { ffmpegVersion: version, h264, hardware, hwaccel };
    console.log(`[encoders] ffmpeg ${version} · encode ${h264} · decode ${hwaccel ?? 'software'}`);
    return cached;
  })();

  return inFlight;
}

/** The detected info if the probe already ran, else null. Never blocks. */
export function encodersIfKnown(): EncoderInfo | null {
  return cached;
}

export interface ProbeInfo {
  durationSec: number;
  width: number;
  height: number;
  kbps: number | null;
  videoCodec: string | null;
  pixFmt: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  audioStreams: number;
  /** PQ or HLG: the picture needs tone mapping before it can become an SDR mp4. */
  isHdr: boolean;
}

/** Everything the export rules need to know about a source file. */
export async function probeVideo(filePath: string): Promise<ProbeInfo> {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audioStreams = streams.filter((s) => s.codec_type === 'audio').length;

  const transfer = (video?.color_transfer as string) ?? null;
  const primaries = (video?.color_primaries as string) ?? null;
  const bitRate = Number(data.format?.bit_rate ?? video?.bit_rate ?? 0);

  return {
    durationSec: Number(data.format?.duration ?? 0) || 0,
    width: Number(video?.width ?? 0) || 0,
    height: Number(video?.height ?? 0) || 0,
    kbps: bitRate > 0 ? Math.round(bitRate / 1000) : null,
    videoCodec: (video?.codec_name as string) ?? null,
    pixFmt: (video?.pix_fmt as string) ?? null,
    colorTransfer: transfer,
    colorPrimaries: primaries,
    audioStreams,
    isHdr: transfer === 'smpte2084' || transfer === 'arib-std-b67',
  };
}

/**
 * Turn an HDR picture into an SDR one that looks like what was on screen.
 *
 * Without this the PQ curve is read as if it were sRGB and everything comes out
 * grey and flat — which is exactly what the exports looked like before. Hable
 * keeps the highlights instead of clipping them.
 */
export const TONEMAP_FILTER =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/**
 * Encoder arguments for one output.
 *
 * `targetKbps` caps the bitrate near the source's own rate scaled by the pixels
 * that survive a crop, so a cut never balloons past what it came from.
 */
export function encoderArgs(
  info: EncoderInfo,
  opts: { quality?: number; targetKbps?: number | null } = {},
): string[] {
  const quality = opts.quality ?? 21;
  const cap = opts.targetKbps
    ? [`-maxrate ${Math.round(opts.targetKbps * 1.3)}k`, `-bufsize ${Math.round(opts.targetKbps * 2.6)}k`]
    : [];

  switch (info.h264) {
    case 'h264_nvenc':
      return [
        '-c:v h264_nvenc', '-preset p5', '-tune hq', '-profile:v high',
        '-rc vbr', `-cq ${quality}`, '-b:v 0', ...cap,
        '-spatial-aq 1', '-temporal-aq 1', '-rc-lookahead 32', '-bf 3',
        '-pix_fmt yuv420p', '-movflags +faststart',
      ];
    case 'h264_qsv':
      return [
        '-c:v h264_qsv', '-preset veryslow', `-global_quality ${quality}`,
        '-look_ahead 1', ...cap, '-pix_fmt yuv420p', '-movflags +faststart',
      ];
    case 'h264_amf':
      return [
        '-c:v h264_amf', '-quality quality', '-rc cqp',
        `-qp_i ${quality}`, `-qp_p ${quality}`, ...cap,
        '-pix_fmt yuv420p', '-movflags +faststart',
      ];
    default:
      return [
        '-c:v libx264', '-preset medium', `-crf ${quality}`,
        '-profile:v high', ...cap, '-pix_fmt yuv420p', '-movflags +faststart',
      ];
  }
}

/** Input options for reading a source: GPU decode when the machine has it. */
export function decodeArgs(info: EncoderInfo): string[] {
  return info.hwaccel ? [`-hwaccel ${info.hwaccel}`] : [];
}

/**
 * The size a clip is squeezed to when it is meant to be sent somewhere rather
 * than edited: a trim that replaces the recording, or the copy that goes to the
 * publisher.
 *
 * The recording is what OBS wrote — 80–100 Mbit/s AV1 or HEVC at 3440x1440 —
 * and a ten second cut of it is over a hundred megabytes, which is the wrong
 * size for a file whose whole purpose is being shared. Quality 23 H.264 with a
 * bitrate ceiling scaled by pixel count lands a 1440p ultrawide clip around
 * 20 Mbit/s and 1080p around 8, which looks fine on a phone and in Discord and
 * is about a fifth of the recording.
 */
export const SHARE_QUALITY = 23;
const SHARE_KBPS_PER_MEGAPIXEL = 4000;

/** Encoder arguments for a share-sized copy of `info`. */
export function shareEncoderArgs(encoders: EncoderInfo, info: ProbeInfo): string[] {
  const megapixels = (info.width * info.height) / 1_000_000;
  const budget = megapixels > 0 ? Math.round(megapixels * SHARE_KBPS_PER_MEGAPIXEL) : null;
  // Never cap above what the source already is — that would only add a ceiling
  // the picture never reaches, and never below the budget the picture needs.
  const targetKbps = budget && info.kbps ? Math.min(budget, info.kbps) : budget ?? info.kbps;
  return encoderArgs(encoders, { quality: SHARE_QUALITY, targetKbps });
}
