import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobePath from 'ffprobe-static';
import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { runFfmpeg } from '../services/ffmpegRun.js';
import {
  detectEncoders,
  decodeArgs,
  encoderArgs,
  probeVideo,
  TONEMAP_FILTER,
} from '../services/encoders.js';

const execFileAsync = promisify(execFile);
const FFPROBE = ffprobePath?.path ?? 'ffprobe';

export type TrimMode = 'lossless' | 'exact';

export type TrimVideoInput = {
  inputPath: string;
  startSec: number;
  endSec: number;
  outputPath: string;
  /**
   * `lossless` copies the streams and snaps the start to the nearest earlier
   * keyframe; `exact` re-encodes to land on the frame asked for.
   */
  mode?: TrimMode;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
};

export interface TrimVideoOutput {
  /** Where the cut actually starts, which for a lossless trim is a keyframe. */
  actualStartSec: number;
  actualEndSec: number;
  mode: TrimMode;
}

/**
 * Cut a piece out of a clip.
 *
 * This used to always re-encode at crf 18, and `TrimAndSwapClipAction` puts the
 * result back over the original — so every trim was a generation loss on the
 * only copy of that moment that exists. Lossless is now the default: the
 * streams are copied and the start is snapped back to the nearest keyframe, so
 * the picture is the recorded bytes. `exact` stays available for when the cut
 * has to land on a precise frame.
 */
export class TrimVideoAction extends BaseAction<TrimVideoInput, TrimVideoOutput> {
  async execute(input: TrimVideoInput): Promise<TrimVideoOutput> {
    const { inputPath, startSec, endSec, outputPath, mode = 'lossless', signal, onProgress } = input;
    const duration = Math.max(0.05, endSec - startSec);

    if (mode === 'lossless') {
      const snapped = await this.nearestKeyframeAtOrBefore(inputPath, startSec);
      // Copying cannot start mid-GOP, so the cut begins at the keyframe and the
      // length grows by however far back that was.
      const lead = Math.max(0, startSec - snapped);

      await runFfmpeg(
        ffmpegConfigured(inputPath)
          .inputOptions([`-ss ${snapped.toFixed(3)}`])
          .outputOptions([
            `-t ${(duration + lead).toFixed(3)}`,
            '-c copy',
            // Keep only the first audio track: OBS writes six identical copies
            // here, and carrying all of them multiplies the file for nothing.
            '-map 0:v:0',
            '-map 0:a:0?',
            '-movflags +faststart',
            // No `-avoid_negative_ts make_zero` here. It rewrites the
            // timestamps that `-t` is measured against, which silently
            // stretched a three second cut into nearly five.
            '-y',
          ])
          .output(outputPath),
        { signal, onProgress, durationSec: duration + lead, timeoutMs: 10 * 60_000 },
      );

      // Report what the copy actually produced, not what was asked for: a
      // stream copy ends on a packet boundary, so both edges can move.
      const actual = await probeVideo(outputPath).catch(() => null);
      const actualDuration = actual?.durationSec || duration + lead;
      return { actualStartSec: snapped, actualEndSec: snapped + actualDuration, mode };
    }

    const [encoders, info] = await Promise.all([detectEncoders(), probeVideo(inputPath)]);
    const filters: string[] = [];
    // An HDR source read as if it were sRGB is what made exports look grey.
    if (info.isHdr) filters.push(TONEMAP_FILTER);

    let command = ffmpegConfigured(inputPath)
      .inputOptions([...decodeArgs(encoders), `-ss ${startSec.toFixed(3)}`])
      .outputOptions([`-t ${duration.toFixed(3)}`]);

    if (filters.length) command = command.outputOptions([`-vf ${filters.join(',')}`]);

    await runFfmpeg(
      command
        .outputOptions([
          ...encoderArgs(encoders, { quality: 19, targetKbps: info.kbps }),
          '-map 0:v:0',
          '-map 0:a:0?',
          '-c:a aac',
          '-b:a 256k',
          '-ac 2',
          '-ar 48000',
          '-y',
        ])
        .output(outputPath),
      { signal, onProgress, durationSec: duration, timeoutMs: 30 * 60_000 },
    );

    return { actualStartSec: startSec, actualEndSec: endSec, mode };
  }

  /**
   * The last keyframe at or before `t`.
   *
   * Reading packet flags only up to `t` keeps this cheap even on a long file.
   * Falls back to `t` itself when the index says nothing useful — the copy then
   * starts a little late rather than failing.
   */
  async nearestKeyframeAtOrBefore(filePath: string, t: number): Promise<number> {
    if (t <= 0) return 0;
    try {
      const { stdout } = await execFileAsync(
        FFPROBE,
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'packet=pts_time,flags',
          '-read_intervals', `%${(t + 0.5).toFixed(3)}`,
          '-of', 'csv=p=0',
          filePath,
        ],
        { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
      );

      let best = 0;
      for (const line of stdout.split(/\r?\n/)) {
        const [time, flags] = line.split(',');
        if (!time || !flags?.includes('K')) continue;
        const value = Number(time);
        if (Number.isFinite(value) && value <= t + 0.001 && value > best) best = value;
      }
      return best;
    } catch {
      return t;
    }
  }

  /** Every keyframe up to `until`, so the UI can show where a lossless cut would land. */
  async keyframesUpTo(filePath: string, until: number): Promise<number[]> {
    try {
      const { stdout } = await execFileAsync(
        FFPROBE,
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'packet=pts_time,flags',
          '-read_intervals', `%${(until + 1).toFixed(3)}`,
          '-of', 'csv=p=0',
          filePath,
        ],
        { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
      );
      const out: number[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const [time, flags] = line.split(',');
        if (!time || !flags?.includes('K')) continue;
        const value = Number(time);
        if (Number.isFinite(value)) out.push(value);
      }
      return out.sort((a, b) => a - b);
    } catch {
      return [];
    }
  }
}
