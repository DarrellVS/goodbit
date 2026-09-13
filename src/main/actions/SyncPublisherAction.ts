import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { publisherService } from '../services/publisherService.js';

export interface SyncPublisherOutput {
  uploaded: number;
  removed: number;
  updatedFlags: number;
}

export class SyncPublisherAction extends BaseAction<void, SyncPublisherOutput> {
  async execute(): Promise<SyncPublisherOutput> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const gameRepo = AppDataSource.getRepository(Game);
    
    const allClips = await clipRepo.find();
    const remoteFiles = new Set(await publisherService.listPublished());

    // Get all games for display name lookup
    const games = await gameRepo.find();
    const gameDisplayNameMap = new Map(games.map(g => [g.name, g.displayName || g.name]));

    let uploaded = 0;
    let removed = 0;
    let updatedFlags = 0;

    const publicBase = (process.env.PUBLISHER_PUBLIC_BASE_URL || '').replace(/\/$/, '');

    // Upload any clips marked published but missing remotely
    for (const clip of allClips.filter(c => c.published && !remoteFiles.has(c.filename))) {
      const gameDisplayName = gameDisplayNameMap.get(clip.game) || clip.game;
      const result = await publisherService.publish(
        clip.filePath, 
        clip.displayName || clip.filename,
        gameDisplayName
      );
      clip.published = true;
      clip.publishedUrl = result.url || (publicBase ? `${publicBase}/${encodeURIComponent(clip.filename)}` : null);
      await clipRepo.save(clip);
      uploaded += 1;
    }

    // Remove any clips not marked published but present remotely
    for (const clip of allClips.filter(c => !c.published && remoteFiles.has(c.filename))) {
      await publisherService.unpublish(clip.filename);
      removed += 1;
    }

    // Ensure publishedUrl is set for items present remotely
    for (const clip of allClips.filter(c => c.published && remoteFiles.has(c.filename) && !c.publishedUrl)) {
      clip.publishedUrl = publicBase ? `${publicBase}/${encodeURIComponent(clip.filename)}` : null;
      await clipRepo.save(clip);
      updatedFlags += 1;
    }

    return { uploaded, removed, updatedFlags };
  }
}


