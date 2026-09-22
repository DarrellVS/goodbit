import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';
import { posterPathFor, posterUrlFor } from '../utils/posterPath.js';
import { forgetViews } from '../services/viewCounter.js';
import { noteUnpublished } from '../services/discordWebhook.js';

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

    // Read before the sidecar is deleted below, so the takedown message can
    // name the clip the way the channel saw it named.
    const displayName = await fs
      .readFile(path.join(uploadDir, `${filename}.meta.json`), 'utf-8')
      .then((raw) => (JSON.parse(raw)?.displayName as string) || null)
      .catch(() => null);
    
    // Delete the main video file
    try {
      await fs.unlink(input.filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }

    // Delete the thumbnail file (.thumb.jpg)
    const thumbPath = posterPathFor(uploadDir, filename);
    try {
      await fs.unlink(thumbPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        // The path carries the uploaded filename, so it goes in as an argument:
        // as the first one, a `%s` in a filename would be read as a directive.
        console.warn('Failed to delete thumbnail %s: %s', thumbPath, err.message);
      }
    }

    // Delete the metadata file (.meta.json)
    const metaPath = path.join(uploadDir, `${filename}.meta.json`);
    try {
      await fs.unlink(metaPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn('Failed to delete metadata %s: %s', metaPath, err.message);
      }
    }

    /*
     * And its view count, which is about a clip that no longer exists.
     *
     * Kept would be worse than useless: re-publishing under the same filename,
     * which a trim does, would inherit a stranger's count from whatever used to
     * be at that name.
     */
    forgetViews(filename);

    // Held for a grace period, because a trim unpublishes and re-publishes
    // under the same name within seconds. See `services/discordWebhook.ts`.
    noteUnpublished(filename, displayName);

    // Purge Cloudflare cache for all related URLs
    const base = process.env.PUBLIC_BASE_URL || '';
    if (base) {
      const baseClean = base.replace(/\/$/, '');
      const urlsToPurge = [
        `${baseClean}/${encodeURIComponent(filename)}`, // Main page
        `${baseClean}/media/${encodeURIComponent(filename)}`, // Video file
        // The poster, at the address it is actually served from. This asked
        // for `/thumb/<clip>` for a while, which is not a route this server
        // has ever had, so the purge came back successful and the frame of a
        // clip that had just been taken down went on being served from the
        // edge. See `utils/posterPath.ts`.
        posterUrlFor(baseClean, filename),
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


