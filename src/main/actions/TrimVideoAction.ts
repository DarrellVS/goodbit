import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { FFPROBE_PATH } from '../services/binaries.js';
import { BaseAction } from './BaseAction.js';
import { CompressVideoAction } from './CompressVideoAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { runFfmpeg } from '../services/ffmpegRun.js';
import {
  detectEncoders,
  decodeArgs,
  encoderArgs,
  probeVideo,
  TONEMAP_FILTER,
} from '../services/encoders.js';
import { execFileAsync } from '../utils/execFileAsync.js';

const FFPROBE = FFPROBE_PATH;

/**
 * `lossless` copies the streams and snaps the start back to a keyframe;
 * `exact` re-encodes at edit quality to land on the frame asked for;
 * `compressed` re-encodes at share size, see `CompressVideoAction`.
 */
export type TrimMode = 'lossless' | 'exact' | 'compressed';

export type TrimVideoInput = {
  inputPath: string;
  startSec: number;
  endSec: number;
  outputPath: string;
  /**
   * See `TrimMode`. Defaults to a lossless copy.
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
 * result back over the original, so every trim was a generation loss on the
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

      // Round the seek point *down* to the millisecond rather than to the
      // nearest one. ffmpeg seeks to the keyframe at or before `-ss`, so a
      // value a hair above the keyframe makes it treat that keyframe as
      // pre-roll, and the frames after it then reference a picture the next
      // step is about to remove.
      const seek = Math.floor(snapped * 1000) / 1000;

      // Written beside the output and swept up below. The dot matters: the
      // folder watcher ignores dotfiles, so a half-written cut is never
      // mistaken for a new recording.
      const staged = path.join(
        path.dirname(outputPath),
        `.${path.basename(outputPath, path.extname(outputPath))}.preroll${path.extname(outputPath) || '.mp4'}`,
      );

      try {
        await runFfmpeg(
          ffmpegConfigured(inputPath)
            .inputOptions([`-ss ${seek.toFixed(3)}`])
            .outputOptions([
              `-t ${(duration + lead).toFixed(3)}`,
              '-c copy',
              // Keep only the first audio track: OBS writes six identical copies
              // here, and carrying all of them multiplies the file for nothing.
              '-map 0:v:0',
              '-map 0:a:0?',
              // No `-avoid_negative_ts make_zero` here. It rewrites the
              // timestamps that `-t` is measured against, which silently
              // stretched a three second cut into nearly five.
              '-y',
            ])
            .output(staged),
          { signal, onProgress, durationSec: duration + lead, timeoutMs: 10 * 60_000 },
        );

        await this.dropPreroll(staged, outputPath, signal);
      } finally {
        await fsPromises.rm(staged, { force: true }).catch(() => {});
      }

      // Report what the copy actually produced, not what was asked for: a
      // stream copy ends on a packet boundary, so both edges can move.
      const actual = await probeVideo(outputPath).catch(() => null);
      const actualDuration = actual?.durationSec || duration + lead;
      return { actualStartSec: snapped, actualEndSec: snapped + actualDuration, mode };
    }

    if (mode === 'compressed') {
      await new CompressVideoAction().execute({
        inputPath, outputPath, startSec, endSec, signal, onProgress,
      });
      return { actualStartSec: startSec, actualEndSec: endSec, mode };
    }

    const [encoders, info] = await Promise.all([detectEncoders(), probeVideo(inputPath)]);
    const filters: string[] = [];
    // An HDR source read as if it were sRGB is what made exports look grey.
    if (info.isHdr) filters.push(TONEMAP_FILTER);

    let command = ffmpegConfigured(inputPath)
      .inputOptions([...(await decodeArgs(encoders, inputPath)), `-ss ${startSec.toFixed(3)}`])
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
   * Copy the streams once more, leaving the pre-roll behind.
   *
   * A stream copy cannot begin in the middle of a group of pictures, so ffmpeg
   * copies from the keyframe before the cut and, rather than leaving the
   * frames ahead of the cut out, writes them flagged discardable and stamped
   * at time zero. Players disagree about what that means. ffmpeg and Chrome's
   * software decoder skip them; NVDEC decodes them, and since they lean on a
   * keyframe that is not in the file, the result was four seconds of solid
   * green at the head of a trimmed clip and audio running a group of pictures
   * ahead of the picture.
   *
   * Reading the file back and writing it out drops them, because by then they
   * carry the flag that says so. It is a second stream copy and costs about a
   * tenth of a second on a cut this size, against a first pass that costs the
   * same, so a trim is twice as long and still imperceptible.
   */
  private async dropPreroll(staged: string, outputPath: string, signal?: AbortSignal): Promise<void> {
    await runFfmpeg(
      ffmpegConfigured(staged)
        .outputOptions([
          '-c copy',
          '-map 0:v:0',
          '-map 0:a:0?',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath),
      { signal, timeoutMs: 10 * 60_000 },
    );
  }

  /**
   * The last keyframe at or before `t`.
   *
   * Reading packet flags only up to `t` keeps this cheap even on a long file.
   * Falls back to `t` itself when the index says nothing useful, the copy then
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
