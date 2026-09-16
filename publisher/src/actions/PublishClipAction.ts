import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';

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

    /*
     * No poster is made here.
     *
     * This used to run one ffmpeg per upload to cut a frame for the Discord
     * embed, which is why the image carried `ffmpeg-static`, `ffprobe-static`
     * and `fluent-ffmpeg`. The desktop had already made that picture for its
     * own library card before anybody pressed Publish, so it sends it, at
     * `PUT /api/publish/:filename/thumbnail`, and `StoreThumbnailAction`
     * writes it.
     *
     * Three cases, and all three are fine:
     * a poster arrives and is stored; a clip published by an older desktop
     * sends none and the embed page leaves the poster out rather than pointing
     * at a file that is not there; a clip published before any of this keeps
     * the `.thumb.jpg` already on disk, because nothing here deletes one.
     */

    // Save metadata for Discord embed
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
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
