import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';

export interface PublishClipInput {
  filePath: string;
  originalName: string;
  displayName?: string;
}

export interface PublishClipOutput {
  filename: string;
  url: string;
}

export class PublishClipAction extends BaseAction<PublishClipInput, PublishClipOutput> {
  async execute(input: PublishClipInput): Promise<PublishClipOutput> {
    const filename = path.basename(input.filePath);
    const base = process.env.PUBLIC_BASE_URL || '';
    const url = base ? `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}` : `/${encodeURIComponent(filename)}`;

    if (base) {
      try { await new PurgeCloudflareCacheAction().execute({ urls: [url] }); } catch {}
    }

    return { filename, url };
  }
}


