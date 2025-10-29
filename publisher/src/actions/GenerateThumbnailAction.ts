import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { withTimeout } from '../utils/withTimeout.js';

export type GenerateThumbnailInput = { inputPath: string; outputPath: string; seekSec?: number; quality?: number };

export class GenerateThumbnailAction extends BaseAction<GenerateThumbnailInput, void> {
  async execute({ inputPath, outputPath, seekSec = 1, quality = 4 }: GenerateThumbnailInput): Promise<void> {
    await withTimeout(new Promise<void>((resolve, reject) => {
      ffmpegConfigured(inputPath)
        .frames(1)
        .seekInput(seekSec)
        .outputOptions([`-q:v ${quality}`])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (e: any) => reject(e))
        .run();
    }));
  }
}

