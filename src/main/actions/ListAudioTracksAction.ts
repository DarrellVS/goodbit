import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AudioTrackDTO } from '@shared/index.js';
import {
  editorAudioDir,
  ensureAudioDir,
  isAudioFile,
  probeDurationSec,
} from '../services/audioLibrary.js';

export class ListAudioTracksAction extends BaseAction<void, { items: AudioTrackDTO[] }> {
  async execute(): Promise<{ items: AudioTrackDTO[] }> {
    await ensureAudioDir();

    const entries = await fs.readdir(editorAudioDir(), { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && isAudioFile(entry.name));

    const items = await Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(editorAudioDir(), entry.name);
        const stat = await fs.stat(filePath);
        const durationSec = await probeDurationSec(
          filePath,
          `${entry.name}:${stat.mtimeMs}:${stat.size}`
        );

        return AudioTrackDTO.fromFile({
          filename: entry.name,
          extension: path.extname(entry.name).slice(1),
          sizeBytes: stat.size,
          durationSec,
          modifiedAt: stat.mtime,
        });
      })
    );

    items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return { items };
  }
}
