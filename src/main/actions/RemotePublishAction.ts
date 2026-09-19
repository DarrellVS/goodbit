import FormData from 'form-data';
import { publisherBaseUrl, publisherAuthHeaders, NO_PUBLISHER } from '../services/publisherConfig.js';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { BaseAction } from './BaseAction.js';
import type { PublishedGoodBit } from '@shared/index.js';

export interface RemotePublishInput {
  filePath: string;
  displayName?: string;
  game?: string;
  /**
   * The clip's marks, for the embed page's scrubber.
   *
   * A text field on the same multipart request rather than a second call, and
   * the poster's argument for being its own call does not apply: multer
   * refuses an unexpected *file*, not an unexpected field, so a publisher too
   * old to know about this reads the clip and the name as it always did and
   * ignores this one.
   */
  goodBits?: PublishedGoodBit[];
  /** 0-1 of the bytes sent, when the size is known. */
  onProgress?: (fraction: number) => void;
}

export interface RemotePublishOutput {
  filename: string;
  url: string;
}

/**
 * What the server said, rather than what axios said about it.
 *
 * A publisher that refuses an upload says why: no token configured, wrong
 * token, file too large. Reported as "Request failed with status code 401"
 * that is useless to the person who has to fix it.
 */
function explain(error: unknown): Error {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })
    .response;
  const said = response?.data?.message;
  if (said) return new Error(said);
  if (response?.status === 401) {
    return new Error('The publisher rejected the publish token. Check it in Settings.');
  }
  if (response?.status === 413) {
    return new Error(
      'The server refused the upload as too large. Raise the proxy body limit, ' +
        'or point GoodBit at the address the publisher has on your own network.',
    );
  }
  return error instanceof Error ? error : new Error(String(error));
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
    // JSON in a form field: a multipart part is bytes with a name, and
    // form-data has no notion of a nested array.
    if (input.goodBits?.length) form.append('goodBits', JSON.stringify(input.goodBits));
    const url = `${baseUrl}/api/publish`;
    try {
      return await this.send(url, form, input);
    } catch (error) {
      throw explain(error);
    }
  }

  private async send(
    url: string,
    form: FormData,
    input: RemotePublishInput,
  ): Promise<RemotePublishOutput> {
    const res = await axios.post(url, form, {
      headers: { ...form.getHeaders(), ...publisherAuthHeaders() },
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


