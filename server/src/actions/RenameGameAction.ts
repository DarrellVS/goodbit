import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { cleanupEmptyFolders } from '../utils/cleanupEmptyFolders.js';
import { RemoteUpdateGameMetadataAction } from './RemoteUpdateGameMetadataAction.js';

export interface RenameGameInput {
  oldName: string;
  newName: string;
}

export interface RenameGameOutput {
  success: boolean;
  clipsUpdated: number;
}

export class RenameGameAction extends BaseAction<RenameGameInput, RenameGameOutput> {
  async execute(input: RenameGameInput): Promise<RenameGameOutput> {
    const { oldName, newName } = input;

    if (!oldName || !newName) {
      throw new Error('Both oldName and newName are required');
    }

    if (oldName === newName) {
      return { success: true, clipsUpdated: 0 };
    }

    const repo = AppDataSource.getRepository(Clip);

    // Get all clips with the old game name
    const clips = await repo.find({ where: { game: oldName } });

    if (clips.length === 0) {
      throw new Error(`No clips found for game: ${oldName}`);
    }

    // Check if target directory already exists
    const oldDir = path.join(VIDEOS_ROOT, oldName);
    const newDir = path.join(VIDEOS_ROOT, newName);

    const oldDirExists = await this.dirExists(oldDir);
    const newDirExists = await this.dirExists(newDir);

    if (!oldDirExists) {
      throw new Error(`Source directory does not exist: ${oldName}`);
    }

    if (newDirExists) {
      throw new Error(`Target directory already exists: ${newName}`);
    }

    // Rename the directory
    await fs.rename(oldDir, newDir);

    // Update all clips in database
    for (const clip of clips) {
      const filename = clip.filename;
      const newPath = path.normalize(path.resolve(path.join(newDir, filename)));
      const newRelPath = path.relative(VIDEOS_ROOT, newPath);

      // Use update() to only modify path-related columns, preserving all user-set fields
      // (displayName, notes, starred, tags, published, publishedUrl)
      await repo.update(clip.id, {
        filePath: newPath,
        relPath: newRelPath,
        game: newName,
      });
    }

    // Update publisher metadata files for published clips via API
    const publishedClips = clips.filter(c => c.published);
    if (publishedClips.length > 0) {
      await this.updatePublisherMetadata(publishedClips, newName);
    }

    // Clean up any remaining empty folders
    cleanupEmptyFolders(VIDEOS_ROOT).catch((err) => {
      console.error('Failed to cleanup empty folders after rename:', err);
    });

    return {
      success: true,
      clipsUpdated: clips.length,
    };
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private async updatePublisherMetadata(clips: Clip[], newGameName: string): Promise<void> {
    try {
      const filenames = clips.map(c => c.filename);
      const action = new RemoteUpdateGameMetadataAction();
      const result = await action.execute({ filenames, newGame: newGameName });
      
      console.log(`Publisher metadata update: ${result.updated} succeeded, ${result.failed} failed`);
      if (result.cachePurged) {
        console.log('Cloudflare cache purged successfully');
      } else {
        console.log('Cloudflare cache not purged (may not be configured)');
      }
    } catch (err) {
      console.error('Failed to update publisher metadata:', err);
    }
  }
}

