import axios from 'axios';
import { BaseAction } from './BaseAction.js';

export interface RemoteUpdateGameMetadataInput {
  filenames: string[];
  newGame: string;
}

export interface RemoteUpdateGameMetadataOutput {
  updated: number;
  failed: number;
  cachePurged?: boolean;
}

export class RemoteUpdateGameMetadataAction extends BaseAction<RemoteUpdateGameMetadataInput, RemoteUpdateGameMetadataOutput> {
  async execute(input: RemoteUpdateGameMetadataInput): Promise<RemoteUpdateGameMetadataOutput> {
    const baseUrl = (process.env.PUBLISHER_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) {
      console.warn('PUBLISHER_BASE_URL not set, skipping publisher metadata update');
      return { updated: 0, failed: 0 };
    }

    const apiKey = process.env.PUBLISHER_API_KEY || '';

    try {
      const url = `${baseUrl}/api/publish/update-game-metadata`;
      const headers = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
      
      const res = await axios.post(url, {
        filenames: input.filenames,
        newGame: input.newGame,
      }, { headers });
      
      const result = res.data as RemoteUpdateGameMetadataOutput;
      return result;
    } catch (err) {
      console.error('Failed to update publisher metadata:', err);
      return { updated: 0, failed: input.filenames.length, cachePurged: false };
    }
  }
}

