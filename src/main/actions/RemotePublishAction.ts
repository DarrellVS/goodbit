import FormData from 'form-data';
import { publisherBaseUrl, NO_PUBLISHER } from '../services/publisherConfig.js';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { BaseAction } from './BaseAction.js';

export interface RemotePublishInput {
  filePath: string;
  displayName?: string;
  game?: string;
  /** 0-1 of the bytes sent, when the size is known. */
  onProgress?: (fraction: number) => void;
}

export interface RemotePublishOutput {
  filename: string;
  url: string;
}

export class RemotePublishAction extends BaseAction<RemotePublishInput, RemotePublishOutput> {
  async execute(input: RemotePublishInput): Promise<RemotePublishOutput> {
    const baseUrl = publisherBaseUrl();
    if (!baseUrl) throw new Error(NO_PUBLISHER);
    const filename = path.basename(input.filePath);
    const form = new FormData();
    form.append('file', fs.createReadStream(input.filePath), filename);
    if (input.displayName) form.append('displayName', input.displayName);
    if (input.game) form.append('game', input.game);
    const url = `${baseUrl}/api/publish`;
    const res = await axios.post(url, form, {
      headers: form.getHeaders(),
      // A clip is tens or hundreds of megabytes; without these the default
      // limits reject it long before the server sees it.
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: input.onProgress
        ? (event) => {
            if (!event.total) return;
            input.onProgress?.(Math.min(1, event.loaded / event.total));
          }
        : undefined,
    });
    return res.data as RemotePublishOutput;
  }
}


