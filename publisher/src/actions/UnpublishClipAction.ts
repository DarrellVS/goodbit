import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';

export interface UnpublishClipInput {
  filePath: string;
}

export interface UnpublishClipOutput {
  removed: boolean;
}

export class UnpublishClipAction extends BaseAction<UnpublishClipInput, UnpublishClipOutput> {
  async execute(input: UnpublishClipInput): Promise<UnpublishClipOutput> {
    try {
      await fs.unlink(input.filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }

    const filename = path.basename(input.filePath);
    const base = process.env.PUBLIC_BASE_URL || '';
    const url = base ? `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}` : `/${encodeURIComponent(filename)}`;
    if (base) {
      try { await new PurgeCloudflareCacheAction().execute({ urls: [url] }); } catch {}
    }
    return { removed: true };
  }
}


