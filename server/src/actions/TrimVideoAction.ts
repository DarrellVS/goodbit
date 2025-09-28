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
        .outputOptions(['-c:v libx264', '-c:a aac', '-preset veryfast', '-y'])
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (e: any) => reject(e));
    }), 10 * 60_000);
  }
}


