import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';
import { GenerateThumbnailAction } from './GenerateThumbnailAction.js';

export interface PublishClipInput {
  filePath: string;
  originalName: string;
  displayName?: string;
  game?: string;
}

export interface PublishClipOutput {
  filename: string;
  url: string;
}

export class PublishClipAction extends BaseAction<PublishClipInput, PublishClipOutput> {
  async execute(input: PublishClipInput): Promise<PublishClipOutput> {
    const filename = path.basename(input.filePath);
    const base = process.env.PUBLIC_BASE_URL || '';
    const url = base ? `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}` : `/${encodeURIComponent(filename)}`;

    // Generate thumbnail for Discord embed
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
    const thumbPath = path.join(uploadDir, `${filename}.thumb.jpg`);
    
    try {
      await new GenerateThumbnailAction().execute({ 
        inputPath: input.filePath, 
        outputPath: thumbPath, 
        seekSec: 1, 
        quality: 4 
      });
    } catch (err) {
      console.error('Failed to generate thumbnail:', err);
    }

    // Save metadata for Discord embed
    const metaPath = path.join(uploadDir, `${filename}.meta.json`);
    const meta = {
      displayName: input.displayName || filename,
      game: input.game || '',
      publishedAt: new Date().toISOString(),
    };
    
    try {
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save metadata:', err);
    }

    // Purge Cloudflare cache
    if (base) {
      try { 
        await new PurgeCloudflareCacheAction().execute({ urls: [
          url,
          `${base}/media/${encodeURIComponent(filename)}`,
        ] }); 
      } catch {}
    }

    return { filename, url };
  }
}


