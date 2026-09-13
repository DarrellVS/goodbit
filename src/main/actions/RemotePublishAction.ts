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
    const res = await axios.post(url, form, { headers: form.getHeaders() });
    return res.data as RemotePublishOutput;
  }
}


