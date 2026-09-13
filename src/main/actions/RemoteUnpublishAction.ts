import axios from 'axios';
import { BaseAction } from './BaseAction.js';

export interface RemoteUnpublishInput {
  filename: string;
}

export interface RemoteUnpublishOutput {
  removed: boolean;
}

export class RemoteUnpublishAction extends BaseAction<RemoteUnpublishInput, RemoteUnpublishOutput> {
  async execute(input: RemoteUnpublishInput): Promise<RemoteUnpublishOutput> {
    const baseUrl = (process.env.PUBLISHER_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('PUBLISHER_BASE_URL is not set');
    const url = `${baseUrl}/api/publish/${encodeURIComponent(input.filename)}`;
    const res = await axios.delete(url);
    return res.data as RemoteUnpublishOutput;
  }
}


