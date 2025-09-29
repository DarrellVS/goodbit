import axios from 'axios';
import { BaseAction } from './BaseAction.js';

export interface RemoteListPublishedOutput {
  files: string[];
}

export class RemoteListPublishedAction extends BaseAction<void, RemoteListPublishedOutput> {
  async execute(): Promise<RemoteListPublishedOutput> {
    const baseUrl = (process.env.PUBLISHER_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('PUBLISHER_BASE_URL is not set');
    const url = `${baseUrl}/api/publish`;
    const res = await axios.get(url);
    return res.data as RemoteListPublishedOutput;
  }
}


