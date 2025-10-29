import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';

export interface UnpublishClipInput {
  filePath: string;
}

export interface UnpublishClipOutput {
  removed: boolean;
}

export class UnpublishClipAction extends BaseAction<UnpublishClipInput, UnpublishClipOutput> {
  async execute(input: UnpublishClipInput): Promise<UnpublishClipOutput> {
    const filename = path.basename(input.filePath);
    const uploadDir = path.dirname(input.filePath);
    
    // Delete the main video file
    try {
      await fs.unlink(input.filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }

    // Delete the thumbnail file (.thumb.jpg)
    const thumbPath = path.join(uploadDir, `${filename}.thumb.jpg`);
    try {
      await fs.unlink(thumbPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn(`Failed to delete thumbnail ${thumbPath}:`, err.message);
      }
    }

    // Delete the metadata file (.meta.json)
    const metaPath = path.join(uploadDir, `${filename}.meta.json`);
    try {
      await fs.unlink(metaPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn(`Failed to delete metadata ${metaPath}:`, err.message);
      }
    }

    // Purge Cloudflare cache for all related URLs
    const base = process.env.PUBLIC_BASE_URL || '';
    if (base) {
      const baseClean = base.replace(/\/$/, '');
      const urlsToPurge = [
        `${baseClean}/${encodeURIComponent(filename)}`, // Main page
        `${baseClean}/media/${encodeURIComponent(filename)}`, // Video file
        `${baseClean}/thumb/${encodeURIComponent(filename)}`, // Thumbnail
      ];
      try { 
        await new PurgeCloudflareCacheAction().execute({ urls: urlsToPurge }); 
      } catch (err) {
        console.warn('Failed to purge Cloudflare cache:', err instanceof Error ? err.message : String(err));
      }
    }
    
    return { removed: true };
  }
}


