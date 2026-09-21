import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';
import { posterPathFor, posterUrlFor } from '../utils/posterPath.js';
import { prewarmPoster } from '../services/cachePrewarm.js';

export interface StoreThumbnailInput {
  /** The clip this is a picture of, under the name it was uploaded with. */
  filename: string;
  jpeg: Buffer;
}

export interface StoreThumbnailOutput {
  stored: boolean;
}

/**
 * The poster frame, made by the desktop and sent here.
 *
 * This server used to derive it: `ffmpeg-static`, `ffprobe-static` and
 * `fluent-ffmpeg` were in the image, and two per-architecture binaries were
 * downloaded under emulation at build time, for one JPEG per upload. The
 * desktop has already made that exact picture for its own library card
 * (`EnsureThumbnailAction`, 1280 wide, tone mapped, cached beside the clip),
 * so it sends it and the publisher stores bytes.
 *
 * Written as `<clip>.thumb.jpg`, the name the embed page and
 * `UnpublishClipAction` have always used, so nothing already published has to
 * move and nothing already published loses its poster.
 */
export class StoreThumbnailAction extends BaseAction<StoreThumbnailInput, StoreThumbnailOutput> {
  async execute(input: StoreThumbnailInput): Promise<StoreThumbnailOutput> {
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
    const filename = path.basename(input.filename);
    const thumbPath = posterPathFor(uploadDir, filename);

    /*
     * Written beside its name and moved onto it, never written in place.
     *
     * This directory is served straight to the public, so the name is
     * readable the instant it exists: a request that arrives halfway through
     * the write gets half a JPEG, and a CDN in front of it caches that half.
     * A rename within one directory is atomic.
     */
    const partial = `${thumbPath}.part`;
    try {
      await fs.writeFile(partial, input.jpeg);
      await fs.rename(partial, thumbPath);
    } catch (err) {
      await fs.unlink(partial).catch(() => {});
      throw err;
    }

    /*
     * And purged, which publishing the clip does not do for this URL.
     *
     * `PublishClipAction` purges the page and the video. The poster was never
     * in that list, and it is the one URL a re-publish reliably changes: a
     * trimmed clip is re-uploaded under its own filename, so the CDN is asked
     * for a name it already has an answer for, and that answer is a frame from
     * before the cut.
     */
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    if (base) {
      try {
        await new PurgeCloudflareCacheAction().execute({ urls: [posterUrlFor(base, filename)] });
      } catch (err) {
        console.warn(
          'Failed to purge the poster from Cloudflare:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    /*
     * The poster is warmed here and nowhere else, because here is the first
     * moment the file exists.
     *
     * `PublishClipAction` runs before this request and warms the page and the
     * video; asking for the poster from there would fetch a 404 and teach the
     * edge to serve one. A clip published by a desktop too old to send a
     * picture never reaches this action, which is right: there is nothing to
     * warm and the page does not name one.
     */
    prewarmPoster(filename);

    return { stored: true };
  }
}
