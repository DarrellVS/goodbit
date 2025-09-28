import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { withTimeout } from '../utils/withTimeout.js';

export type GenerateFrameStripInput = { inputPath: string; outputPath: string; frames?: number; scale?: number };

export class GenerateFrameStripAction extends BaseAction<GenerateFrameStripInput, void> {
  async execute({ inputPath, outputPath, frames = 10, scale = 320 }: GenerateFrameStripInput): Promise<void> {
    await withTimeout(new Promise<void>((resolve, reject) => {
      ffmpegConfigured(inputPath)
        .outputOptions([
          '-frames:v', '1',
          '-vf', `fps=1,scale=${scale}:-1,tile=${frames}x1:padding=2:color=black`
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (e: any) => reject(e))
        .run();
    }));
  }
}


