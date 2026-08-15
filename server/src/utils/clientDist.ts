import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locate the built client bundle so the API server can also serve the UI.
 *
 * Serving the app from this origin is what makes local streaming possible:
 * an HTTPS page cannot pull media from a plain-HTTP LAN address (mixed
 * content), but a page served *by* this server is same-origin with the media.
 *
 * The compiled server lives at server/dist/server/src and the dev server at
 * server/src, so walk up looking for the marker rather than hardcoding depth.
 */
export function resolveClientDist(): string | null {
  const override = process.env.CLIENT_DIST;
  if (override) {
    return fs.existsSync(path.join(override, 'index.html')) ? path.resolve(override) : null;
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'client', 'dist');
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
