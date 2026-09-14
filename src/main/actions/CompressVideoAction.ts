import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { runFfmpeg } from '../services/ffmpegRun.js';
import {
  decodeArgs,
  detectEncoders,
  probeVideo,
  shareEncoderArgs,
  TONEMAP_FILTER,
} from '../services/encoders.js';

export type CompressVideoInput = {
  inputPath: string;
  outputPath: string;
  /** Cut while compressing. Both or neither; the whole file when absent. */
  startSec?: number;
  endSec?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
};

export interface CompressVideoOutput {
  sizeBytes: number;
  durationSec: number;
}

/**
 * Re-encode a clip to the size a shared file should be.
 *
 * One pass, GPU decode when the machine has it, tone mapped when the recording
 * is HDR. The same pipeline as an exact trim, at the share preset instead of
 * the edit one. Used for the trim that replaces a recording and for the copy
 * that goes to the publisher; the caller decides which file it lands on.
 */
export class CompressVideoAction extends BaseAction<CompressVideoInput, CompressVideoOutput> {
  async execute(input: CompressVideoInput): Promise<CompressVideoOutput> {
    const { inputPath, outputPath, signal, onProgress } = input;
    const [encoders, info] = await Promise.all([detectEncoders(), probeVideo(inputPath)]);

    const startSec = input.startSec ?? 0;
    const endSec = input.endSec ?? info.durationSec;
    const duration = Math.max(0.05, endSec - startSec);

    let command = ffmpegConfigured(inputPath).inputOptions([...(await decodeArgs(encoders, inputPath))]);
    // Only seek when asked: `-ss 0 -t <whole file>` on a stream whose duration
    // is rounded can drop the last frame.
    if (input.startSec !== undefined || input.endSec !== undefined) {
      command = command
        .inputOptions([`-ss ${startSec.toFixed(3)}`])
        .outputOptions([`-t ${duration.toFixed(3)}`]);
    }
    // An HDR source read as if it were sRGB is what made exports look grey.
    if (info.isHdr) command = command.outputOptions([`-vf ${TONEMAP_FILTER}`]);

    await runFfmpeg(
      command
        .outputOptions([
          ...shareEncoderArgs(encoders, info),
          '-map 0:v:0',
          // First audio track only: OBS writes six identical copies.
          '-map 0:a:0?',
          '-c:a aac',
          '-b:a 192k',
          '-ac 2',
          '-ar 48000',
          '-y',
        ])
        .output(outputPath),
      { signal, onProgress, durationSec: duration, timeoutMs: 30 * 60_000 },
    );

    const st = await fsPromises.stat(outputPath);
    return { sizeBytes: st.size, durationSec: duration };
  }
}
