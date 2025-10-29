import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';

export interface UpdateGameMetadataInput {
  filenames: string[];
  newGame: string;
}

export interface UpdateGameMetadataOutput {
  updated: number;
  failed: number;
}

export class UpdateGameMetadataAction extends BaseAction<UpdateGameMetadataInput, UpdateGameMetadataOutput> {
  async execute(input: UpdateGameMetadataInput): Promise<UpdateGameMetadataOutput> {
    const { filenames, newGame } = input;
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');

    let updated = 0;
    let failed = 0;

    for (const filename of filenames) {
      const metaPath = path.join(uploadDir, `${filename}.meta.json`);

      try {
        // Check if meta file exists
        const metaExists = await this.fileExists(metaPath);
        if (!metaExists) {
          console.log(`Meta file not found for ${filename}, skipping`);
          continue;
        }

        // Read current metadata
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);

        // Update game field
        meta.game = newGame;

        // Write back
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        updated++;
      } catch (err) {
        console.error(`Failed to update metadata for ${filename}:`, err);
        failed++;
      }
    }

    return { updated, failed };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

