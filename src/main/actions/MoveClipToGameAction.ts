import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { cleanupEmptyFolders } from '../utils/cleanupEmptyFolders.js';
import { gameFolderPath } from '../services/gameFolder.js';

export interface MoveClipToGameInput {
  clipId: number;
  targetGame: string;
}

export interface MoveClipToGameOutput {
  clip: Clip;
}

export class MoveClipToGameAction extends BaseAction<MoveClipToGameInput, MoveClipToGameOutput> {
  async execute(input: MoveClipToGameInput): Promise<MoveClipToGameOutput> {
    const { clipId, targetGame } = input;
    const repo = AppDataSource.getRepository(Clip);

    // Find the clip
    const clip = await repo.findOneByOrFail({ id: clipId });

    // If already in target game, no-op
    if (clip.game === targetGame) {
      return { clip };
    }

    const oldPath = clip.filePath;
    const filename = clip.filename;
    
    // Refused before anything touches the disk, since a name holding a
    // separator is a path and this moves somebody's recording to it.
    const targetDir = gameFolderPath(VIDEOS_ROOT, targetGame);
    await fs.mkdir(targetDir, { recursive: true });

    // The filename comes from the database, which the scan filled from disk,
    // but a basename of it costs nothing and keeps the file in that folder.
    let newPath = path.join(targetDir, path.basename(filename));
    let counter = 1;

    // Handle filename conflicts
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);

    while (await this.fileExists(newPath)) {
      const newFilename = `${basename}_${counter}${ext}`;
      newPath = path.join(targetDir, newFilename);
      counter++;
    }

    // Store old directory for cleanup
    const oldDir = path.dirname(oldPath);

    // Move the physical file
    await fs.rename(oldPath, newPath);

    // Update clip in database
    const newRelPath = path.relative(VIDEOS_ROOT, newPath);
    const newFilename = path.basename(newPath);
    
    clip.filePath = newPath;
    clip.relPath = newRelPath;
    clip.game = targetGame;
    clip.filename = newFilename;

    const savedClip = await repo.save(clip);

    // Clean up empty folders in the old directory (async, don't wait)
    cleanupEmptyFolders(VIDEOS_ROOT).catch((err) => {
      console.error('Failed to cleanup empty folders after move:', err instanceof Error ? err.message : String(err));
    });

    return { clip: savedClip };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

