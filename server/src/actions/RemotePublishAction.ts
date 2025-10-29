import FormData from 'form-data';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import axios from 'axios';
import { BaseAction } from './BaseAction.js';
import { CompressVideoAction } from './CompressVideoAction.js';
import { GetVideoMetadataAction } from './GetVideoMetadataAction.js';

export interface RemotePublishInput {
  filePath: string;
  displayName?: string;
  game?: string;
}

export interface RemotePublishOutput {
  filename: string;
  url: string;
}

export class RemotePublishAction extends BaseAction<RemotePublishInput, RemotePublishOutput> {
  async execute(input: RemotePublishInput): Promise<RemotePublishOutput> {
    const baseUrl = (process.env.PUBLISHER_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('PUBLISHER_BASE_URL is not set');
    
    const filename = path.basename(input.filePath);
    let fileToUpload = input.filePath;
    let tempFile: string | null = null;

    try {
      // Try to compress the video for Discord embeds (≤30MB)
      const metadata = await new GetVideoMetadataAction().execute({ filePath: input.filePath });
      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, `compress_${Date.now()}_${filename}`);
      
      const compressionResult = await new CompressVideoAction().execute({
        inputPath: input.filePath,
        outputPath: tempPath,
        durationSec: metadata.durationSec,
      });

      if (compressionResult.compressed) {
        fileToUpload = tempPath;
        tempFile = tempPath;
      } else if (await fsPromises.access(tempPath).then(() => true).catch(() => false)) {
        // If compression wasn't used but temp file exists, clean it up
        await fsPromises.unlink(tempPath).catch(() => {});
      }
    } catch (error) {
      console.error('   ⚠️  Compression failed, uploading original:', error instanceof Error ? error.message : String(error));
      // Continue with original file
    }

    // Upload the file (compressed or original)
    const form = new FormData();
    form.append('file', fs.createReadStream(fileToUpload), filename);
    if (input.displayName) form.append('displayName', input.displayName);
    if (input.game) form.append('game', input.game);
    
    const url = `${baseUrl}/api/publish`;
    
    try {
      const res = await axios.post(url, form, { headers: form.getHeaders() });
      return res.data as RemotePublishOutput;
    } finally {
      // Clean up temp file if it was created
      if (tempFile) {
        await fsPromises.unlink(tempFile).catch(() => {});
      }
    }
  }
}


