import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { publisherService } from '../services/publisherService.js';

export interface SyncPublishedClipsMetadataOutput {
  synced: number;
  errors: number;
}

/**
 * Syncs all published clips' metadata with current game display names
 * Only updates metadata files, does not re-upload video files
 */
export class SyncPublishedClipsMetadataAction extends BaseAction<void, SyncPublishedClipsMetadataOutput> {
  async execute(): Promise<SyncPublishedClipsMetadataOutput> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const gameRepo = AppDataSource.getRepository(Game);

    // Get all published clips
    const publishedClips = await clipRepo.find({
      where: { published: true },
    });

    // Get all games for display name lookup
    const games = await gameRepo.find();
    const gameDisplayNameMap = new Map(games.map(g => [g.name, g.displayName || g.name]));

    let synced = 0;
    let errors = 0;

    for (const clip of publishedClips) {
      try {
        const gameDisplayName = gameDisplayNameMap.get(clip.game) || clip.game;
        
        // Update only the metadata file
        await publisherService.updateMetadata(
          clip.filename,
          clip.displayName || clip.filename,
          gameDisplayName
        );
        
        synced++;
      } catch (error) {
        console.error(`Failed to sync metadata for clip ${clip.id}:`, error instanceof Error ? error.message : String(error));
        errors++;
      }
    }

    return { synced, errors };
  }
}

