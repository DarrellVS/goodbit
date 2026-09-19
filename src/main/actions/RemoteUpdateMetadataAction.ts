import axios from 'axios';
import { publisherBaseUrl, publisherAuthHeaders, NO_PUBLISHER } from '../services/publisherConfig.js';
import { BaseAction } from './BaseAction.js';
import type { PublishedGoodBit } from '@shared/index.js';

export interface RemoteUpdateMetadataInput {
  filename: string;
  displayName: string;
  game: string;
  /**
   * The clip's marks as they stand now, sent every time rather than only when
   * they changed.
   *
   * Left out, the publisher keeps what the sidecar already holds, which is how
   * an app older than this feature leaves a published clip's chapters alone.
   * An empty array is therefore a statement: every mark was removed, and the
   * bands must go with them.
   */
  goodBits?: PublishedGoodBit[];
}

export interface RemoteUpdateMetadataOutput {
  success: boolean;
}

export class RemoteUpdateMetadataAction extends BaseAction<RemoteUpdateMetadataInput, RemoteUpdateMetadataOutput> {
  async execute(input: RemoteUpdateMetadataInput): Promise<RemoteUpdateMetadataOutput> {
    const baseUrl = publisherBaseUrl();
    if (!baseUrl) throw new Error(NO_PUBLISHER);
    
    const url = `${baseUrl}/api/publish/${encodeURIComponent(input.filename)}/metadata`;
    
    const { data } = await axios.patch<RemoteUpdateMetadataOutput>(
      url,
      { displayName: input.displayName, game: input.game, goodBits: input.goodBits },
      { headers: publisherAuthHeaders() },
    );
    
    return data;
  }
}


