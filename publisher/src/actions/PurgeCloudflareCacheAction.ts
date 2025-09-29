import { BaseAction } from './BaseAction.js';

export interface PurgeCloudflareCacheInput {
  urls: string[];
}

export interface PurgeCloudflareCacheOutput {
  success: boolean;
}

export class PurgeCloudflareCacheAction extends BaseAction<PurgeCloudflareCacheInput, PurgeCloudflareCacheOutput> {
  async execute(input: PurgeCloudflareCacheInput): Promise<PurgeCloudflareCacheOutput> {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!zoneId || !token || input.urls.length === 0) return { success: false };
    const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: input.urls })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Cloudflare purge failed: ${res.status} ${res.statusText} ${text}`);
    }
    return { success: true };
  }
}


