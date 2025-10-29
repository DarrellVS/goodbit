import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';

export interface UpdateMetadataInput {
  filename: string;
  displayName: string;
  game: string;
}

export interface UpdateMetadataOutput {
  success: boolean;
}

export class UpdateMetadataAction extends BaseAction<UpdateMetadataInput, UpdateMetadataOutput> {
  async execute(input: UpdateMetadataInput): Promise<UpdateMetadataOutput> {
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
    const metaPath = path.join(uploadDir, `${input.filename}.meta.json`);
    
    const newMeta = {
      displayName: input.displayName,
      game: input.game,
      publishedAt: new Date().toISOString(),
    };
    
    try {
      // Check if metadata has changed
      let hasChanged = true;
      try {
        const existingContent = await fs.readFile(metaPath, 'utf-8');
        const existingMeta = JSON.parse(existingContent);
        
        // Compare only the fields we care about (ignore publishedAt)
        hasChanged = existingMeta.displayName !== newMeta.displayName || 
                     existingMeta.game !== newMeta.game;
      } catch (err) {
        // File doesn't exist or can't be read, assume changed
        hasChanged = true;
      }
      
      // Only update and purge if changed
      if (hasChanged) {
        await fs.writeFile(metaPath, JSON.stringify(newMeta, null, 2), 'utf-8');
        
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

