import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AudioTrackDTO } from '../../../shared/index.js';
import {
  AUDIO_EXTENSIONS,
  EDITOR_AUDIO_DIR,
  ensureAudioDir,
  probeDurationSec,
  uniqueAudioFilename,
} from '../services/audioLibrary.js';

export interface ImportAudioFilesInput {
  files: Array<{ name: string; data: Buffer }>;
}

export interface ImportAudioFilesOutput {
  imported: number;
  failed: number;
  tracks: AudioTrackDTO[];
  errors?: string[];
}

export class ImportAudioFilesAction extends BaseAction<
  ImportAudioFilesInput,
  ImportAudioFilesOutput
> {
  async execute(input: ImportAudioFilesInput): Promise<ImportAudioFilesOutput> {
    await ensureAudioDir();

    const tracks: AudioTrackDTO[] = [];
    const errors: string[] = [];
    let failed = 0;

    for (const file of input.files) {
      try {
        const extension = path.extname(file.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(extension)) {
          errors.push(`${file.name}: unsupported audio format (${extension || 'none'})`);
          failed++;
          continue;
        }

        const filename = await uniqueAudioFilename(file.name);
        const targetPath = path.join(EDITOR_AUDIO_DIR, filename);
        await fs.writeFile(targetPath, file.data);

        const stat = await fs.stat(targetPath);
        const durationSec = await probeDurationSec(
          targetPath,
          `${filename}:${stat.mtimeMs}:${stat.size}`
        );

        tracks.push(
          AudioTrackDTO.fromFile({
            filename,
            extension: extension.slice(1),
            sizeBytes: stat.size,
            durationSec,
            modifiedAt: stat.mtime,
          })
        );
      } catch (error) {
        failed++;
        errors.push(`${file.name}: ${(error as Error).message}`);
      }
    }

    return {
      imported: tracks.length,
      failed,
      tracks,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
