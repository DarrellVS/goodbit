import axios from 'axios';
import { publisherBaseUrl, NO_PUBLISHER } from '../services/publisherConfig.js';
import { BaseAction } from './BaseAction.js';

export interface RemoteListPublishedOutput {
  files: string[];
}

export class RemoteListPublishedAction extends BaseAction<void, RemoteListPublishedOutput> {
  async execute(): Promise<RemoteListPublishedOutput> {
    const baseUrl = publisherBaseUrl();
    if (!baseUrl) throw new Error(NO_PUBLISHER);
    const url = `${baseUrl}/api/publish`;
    const res = await axios.get(url);
    return res.data as RemoteListPublishedOutput;
  }
}


