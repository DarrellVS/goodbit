import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { withTimeout } from '../utils/withTimeout.js';

export type TrimVideoInput = { inputPath: string; startSec: number; endSec: number; outputPath: string };

export class TrimVideoAction extends BaseAction<TrimVideoInput, void> {
  async execute({ inputPath, startSec, endSec, outputPath }: TrimVideoInput): Promise<void> {
    const duration = Math.max(0, endSec - startSec);
    await withTimeout(new Promise<void>((resolve, reject) => {
      ffmpegConfigured(inputPath)
        .setStartTime(startSec)
        .setDuration(duration)
        .outputOptions([
          '-c:v libx264',
          '-preset medium',
          '-crf 18',
          '-profile:v main',
          '-level 4.0',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          // audio for widest Windows compatibility
          '-c:a aac',
          '-b:a 256k',
          '-ac 2',
          '-ar 48000',
          '-y',
        ])
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (e: any) => reject(e));
    }), 10 * 60_000);
  }
}


