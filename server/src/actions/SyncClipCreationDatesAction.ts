import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';

export interface SyncClipCreationDatesOutput {
  synced: number;
  skipped: number;
  errors: number;
}

/**
 * Syncs the createdAt timestamp from file birth time to database
 * This ensures the database reflects when the file was actually created on disk
 */
export class SyncClipCreationDatesAction extends BaseAction<void, SyncClipCreationDatesOutput> {
  async execute(): Promise<SyncClipCreationDatesOutput> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const clips = await clipRepo.find();

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const clip of clips) {
      try {
        // Check if file exists
        const stats = await fs.stat(clip.filePath);
        
        // Get file birth time (creation time) - falls back to mtime if birthtime not available
        const fileCreationTime = stats.birthtime || stats.mtime;
        const currentCreatedAt = new Date(clip.createdAt);

        // Only update if the dates are different (allow 1 second difference for precision)
        const timeDifference = Math.abs(fileCreationTime.getTime() - currentCreatedAt.getTime());
        
        if (timeDifference > 1000) {
          // Update createdAt to match file birth time
          await clipRepo
            .createQueryBuilder()
            .update(Clip)
            .set({ createdAt: fileCreationTime })
            .where('id = :id', { id: clip.id })
            .execute();
          
          synced++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Failed to sync creation date for clip ${clip.id}:`, error instanceof Error ? error.message : String(error));
        errors++;
      }
    }

    return { synced, skipped, errors };
  }
}

