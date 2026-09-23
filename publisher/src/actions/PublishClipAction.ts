import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { PurgeCloudflareCacheAction } from './PurgeCloudflareCacheAction.js';
import { prewarmClip } from '../services/cachePrewarm.js';
import type { PublishedGoodBit } from '../utils/goodBits.js';
import { writeJsonAtomic } from '../utils/writeJsonAtomic.js';
import { notePublished } from '../services/discordWebhook.js';

export interface PublishClipInput {
  filePath: string;
  originalName: string;
  displayName?: string;
  game?: string;
  /**
   * The clip's marks, which the embed page draws on the scrubber and lists as
   * chips under the player. Absent from an upload by a desktop older than the
   * chaptered player, which is a plain player and not a broken one.
   */
  goodBits?: PublishedGoodBit[];
  /**
   * False for an upload that puts back a clip the publisher lost, rather than
   * one somebody just published. The desktop re-uploads every clip it holds as
   * published but the server does not have, which is what happens once to a
   * fresh or moved container, and every one of those looks like a first
   * publish here: a Discord channel got one post per clip in the library.
   */
  announce?: boolean;
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

    /*
     * No poster is made here.
     *
     * This used to run one ffmpeg per upload to cut a frame for the Discord
     * embed, which is why the image carried `ffmpeg-static`, `ffprobe-static`
     * and `fluent-ffmpeg`. The desktop had already made that picture for its
     * own library card before anybody pressed Publish, so it sends it, at
     * `PUT /api/publish/:filename/thumbnail`, and `StoreThumbnailAction`
     * writes it.
     *
     * Three cases, and all three are fine:
     * a poster arrives and is stored; a clip published by an older desktop
     * sends none and the embed page leaves the poster out rather than pointing
     * at a file that is not there; a clip published before any of this keeps
     * the `.thumb.jpg` already on disk, because nothing here deletes one.
     */

    // Save metadata for Discord embed
    const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
    const metaPath = path.join(uploadDir, `${filename}.meta.json`);
    const meta = {
      displayName: input.displayName || filename,
      game: input.game || '',
      publishedAt: new Date().toISOString(),
      goodBits: input.goodBits ?? [],
    };

    /*
     * Whether this clip has been here before, read before the sidecar is
     * written over.
     *
     * A re-publish under the same filename happens on every trim of a
     * published clip and every "shrink the published copy". Only a first
     * publish is news to a Discord channel; the others would teach it to mute
     * the bot.
     */
    const hadSidecar = await fs.stat(metaPath).then(() => true, () => false);

    try {
      // Through a temporary file and a rename: a crash mid-write used to leave
      // truncated JSON, and the reader falls back silently, so the clip simply
      // appeared to have no display name and no marks.
      await writeJsonAtomic(metaPath, meta);
    } catch (err) {
      console.error('Failed to save metadata:', err);
    }

    // Purge Cloudflare cache
    if (base) {
      try {
        await new PurgeCloudflareCacheAction().execute({ urls: [
          url,
          `${base}/media/${encodeURIComponent(filename)}`,
        ] });
      } catch {}
    }

    /*
     * And warmed, after the purge rather than instead of it.
     *
     * The clip, its sidecar and the purge are all done by this point, so the
     * URLs answer the same thing a viewer would get. Not awaited and
     * incapable of throwing: the upload is finished, and the caller is a
     * desktop waiting on this response with a several-hundred-megabyte POST
     * behind it. See `services/cachePrewarm.ts`.
     */
    prewarmClip(filename);

    // Announced when the poster lands, or after a grace period without one,
    // and only if this is news. See `services/discordWebhook.ts`.
    if (input.announce !== false) notePublished(filename, hadSidecar);

    return { filename, url };
  }
}
