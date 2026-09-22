import { BaseAction } from './BaseAction.js';
import { AppDataSource, AUDIO_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { ffmpegCommand, runFfmpeg } from '../services/ffmpegProcess.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface ExportAudioInput {
  clipId: number;
}

export interface ExportAudioOutput {
  audioPath: string;
  filename: string;
}

export class ExportAudioAction extends BaseAction<ExportAudioInput, ExportAudioOutput> {
  async execute(input: ExportAudioInput): Promise<ExportAudioOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: input.clipId });

    // Create Audio/Clips directory if it doesn't exist
    const audioClipsDir = path.join(AUDIO_ROOT, 'Clips');
    await fs.mkdir(audioClipsDir, { recursive: true });

    // Generate output filename
    const clipBaseName = path.basename(clip.filename, path.extname(clip.filename));
    const outputFilename = `${clipBaseName}.mp3`;
    const outputPath = path.join(audioClipsDir, outputFilename);

    // Extract audio using ffmpeg
    await this.extractAudio(clip.filePath, outputPath);

    return {
      audioPath: outputPath,
      filename: outputFilename,
    };
  }

  private async extractAudio(inputPath: string, outputPath: string): Promise<void> {
    try {
      await runFfmpeg(
        ffmpegCommand(inputPath)
          .outputOptions([
            '-vn',                    // No video
            '-acodec libmp3lame',     // MP3 codec
            '-q:a 2',                 // High quality (0-9, lower is better)
          ])
          .output(outputPath),
        { timeoutMs: 30 * 60_000 },
      );
    } catch (error) {
      throw new Error(`Failed to extract audio: ${(error as Error).message}`);
    }
  }
}

