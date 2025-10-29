import axios from 'axios';
import { BaseAction } from './BaseAction.js';

export interface RemoteUpdateMetadataInput {
  filename: string;
  displayName: string;
  game: string;
}

export interface RemoteUpdateMetadataOutput {
  success: boolean;
}

export class RemoteUpdateMetadataAction extends BaseAction<RemoteUpdateMetadataInput, RemoteUpdateMetadataOutput> {
  async execute(input: RemoteUpdateMetadataInput): Promise<RemoteUpdateMetadataOutput> {
    const baseUrl = (process.env.PUBLISHER_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('PUBLISHER_BASE_URL is not set');
    
    const url = `${baseUrl}/api/publish/${encodeURIComponent(input.filename)}/metadata`;
    
    const { data } = await axios.patch<RemoteUpdateMetadataOutput>(url, {
      displayName: input.displayName,
      game: input.game,
    });
    
    return data;
  }
}


