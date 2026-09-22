import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';
import { parseGoodBits, sameGoodBits, type PublishedGoodBit } from '../utils/goodBits.js';
import { writeJsonAtomic } from '../utils/writeJsonAtomic.js';

export interface UpdateMetadataInput {
  filename: string;
  displayName: string;
  game: string;
  /**
   * The clip's marks as they stand in the library now.
   *
   * Left out, whatever the sidecar already holds is kept, which is what an app
   * older than the chaptered player sends and what a rename by any app sends
   * when it has nothing to say about marks. An empty array is not the same
   * thing: it says every mark was removed, and the bands go with them.
   */
  goodBits?: PublishedGoodBit[];
}

export interface UpdateMetadataOutput {
  success: boolean;
}

export class UpdateMetadataAction extends BaseAction<UpdateMetadataInput, UpdateMetadataOutput> {
  async execute(input: UpdateMetadataInput): Promise<UpdateMetadataOutput> {
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
    const metaPath = path.join(uploadDir, `${input.filename}.meta.json`);
    
    try {
      // Check if metadata has changed
      let hasChanged = true;
      /*
       * The marks the sidecar already holds, which are both the fallback when
       * this request says nothing about them and the thing a request that does
       * is compared against. Read before the write, because a metadata sync
       * runs over every published clip at once and a purge per clip that has
       * not changed is a Cloudflare rate limit somebody hits on a library of
       * two hundred.
       */
      let goodBits: PublishedGoodBit[] = input.goodBits ?? [];
      try {
        const existingContent = await fs.readFile(metaPath, 'utf-8');
        const existingMeta = JSON.parse(existingContent);
        const existingGoodBits = parseGoodBits(existingMeta.goodBits) ?? [];
        if (input.goodBits === undefined) goodBits = existingGoodBits;

        // Compare only the fields we care about (ignore publishedAt)
        hasChanged = existingMeta.displayName !== input.displayName ||
                     existingMeta.game !== input.game ||
                     !sameGoodBits(existingGoodBits, goodBits);
      } catch (err) {
        // File doesn't exist or can't be read, assume changed
        hasChanged = true;
      }

      const newMeta = {
        displayName: input.displayName,
        game: input.game,
        publishedAt: new Date().toISOString(),
        goodBits,
      };
      
      // Only update and purge if changed
      if (hasChanged) {
        // Atomic, so a crash mid-write cannot leave a sidecar the reader
        // silently treats as a clip with no name and no marks.
        await writeJsonAtomic(metaPath, newMeta);
        
        // Purge Cloudflare cache for both the page and media URLs
        const base = process.env.PUBLIC_BASE_URL || '';
        if (base) {
          try {
            const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(input.filename)}`;
            await new PurgeCloudflareCacheAction().execute({
              urls: [
                url,
                `${base}/media/${encodeURIComponent(input.filename)}`,
              ]
            });
          } catch (err) {
            console.error('Failed to purge Cloudflare cache:', err);
            // Don't fail the whole operation if cache purge fails
          }
        }
      }
      
      return { success: true };
    } catch (err) {
      console.error('Failed to update metadata:', err);
      throw err;
    }
  }
}

