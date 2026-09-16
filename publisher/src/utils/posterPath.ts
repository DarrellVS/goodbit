import path from 'node:path';

/**
 * Where a clip's poster frame lives, and what it is called.
 *
 * One place, because four bits of this server have an opinion about it: the
 * upload stores it, the embed page decides whether to name it, unpublishing
 * deletes it, and both of those purge it from the CDN. The name is also not
 * ours to change: every clip published since long before the desktop started
 * sending the picture has a `<clip>.thumb.jpg` sitting in the upload
 * directory, and a different suffix would orphan all of them at once.
 *
 * `path.basename` on the way in. The filename reaches both of these off the
 * network, and one of them ends in a `path.join`.
 */
export function posterPathFor(uploadDir: string, filename: string): string {
  return path.join(uploadDir, `${path.basename(filename)}.thumb.jpg`);
}

/**
 * The public address of that same file.
 *
 * `/media/`, which is the only route that serves this directory. It asked for
 * `/thumb/<clip>` in one place for a while, a route this server has never had,
 * so the purge came back successful and the edge went on serving the poster of
 * a clip that had been taken down.
 *
 * The suffix stays outside the encoding, so the URL still ends in `.jpg` and
 * anything reading the extension, a CDN included, sees an image.
 */
export function posterUrlFor(baseUrl: string, filename: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/media/${encodeURIComponent(path.basename(filename))}.thumb.jpg`;
}
