import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { publisherService } from '../services/publisherService.js';

export interface SyncPublisherOutput {
  uploaded: number;
  removed: number;
  updatedFlags: number;
}

export class SyncPublisherAction extends BaseAction<void, SyncPublisherOutput> {
  async execute(): Promise<SyncPublisherOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const allClips = await repo.find();
    const remoteFiles = new Set(await publisherService.listPublished());

    let uploaded = 0;
    let removed = 0;
    let updatedFlags = 0;

    const publicBase = (process.env.PUBLISHER_PUBLIC_BASE_URL || '').replace(/\/$/, '');

    // Upload any clips marked published but missing remotely
    for (const clip of allClips.filter(c => c.published && !remoteFiles.has(c.filename))) {
      const result = await publisherService.publish(clip.filePath, clip.displayName || clip.filename);
      clip.published = true;
      clip.publishedUrl = result.url || (publicBase ? `${publicBase}/${encodeURIComponent(clip.filename)}` : null);
      await repo.save(clip);
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
      await repo.save(clip);
      updatedFlags += 1;
    }

    return { uploaded, removed, updatedFlags };
  }
}


