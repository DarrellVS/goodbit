import axios from 'axios';
import { publisherBaseUrl, publisherAuthHeaders, NO_PUBLISHER } from '../services/publisherConfig.js';
import { BaseAction } from './BaseAction.js';

export interface RemoteUnpublishInput {
  filename: string;
}

export interface RemoteUnpublishOutput {
  removed: boolean;
}

export class RemoteUnpublishAction extends BaseAction<RemoteUnpublishInput, RemoteUnpublishOutput> {
  async execute(input: RemoteUnpublishInput): Promise<RemoteUnpublishOutput> {
    const baseUrl = publisherBaseUrl();
    if (!baseUrl) throw new Error(NO_PUBLISHER);
    const url = `${baseUrl}/api/publish/${encodeURIComponent(input.filename)}`;
    const res = await axios.delete(url, { headers: publisherAuthHeaders() });
    return res.data as RemoteUnpublishOutput;
  }
}


