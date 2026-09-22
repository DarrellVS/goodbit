import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { PublishClipAction } from './PublishClipAction.js';

export interface CompressPublishedClipInput {
  clipId: number;
}

export interface CompressPublishedClipOutput {
  url: string | null;
  /** What the public copy weighed before, read off the origin. Null if unknown. */
  beforeBytes: number | null;
  afterBytes: number | null;
  /**
   * Whether the edge is serving the new bytes.
   *
   * `cf-cache-status: MISS` right after a purge is the proof, and `null` means
   * the question could not be asked: no Cloudflare in front, or the request
   * failed. A purge that did not happen is not an upload that did not happen,
   * so this is reported rather than thrown.
   */
  purged: boolean | null;
}

/**
 * Compress the copy behind the public link, and leave the recording alone.
 *
 * `compressPublished` is on by default, so a clip published today already went
 * up share-sized. This is for the ones published before that setting existed,
 * or published with it off: their public copy is the full recording, eighty
 * megabits a second of it, coming off a home uplink every time somebody opens
 * the link.
 *
 * **It replaces only the published copy.** The file on disk is untouched, and
 * the UI says so, because somebody who runs this expecting disk space back and
 * gets none has been misled. Replacing the local file is `CompressClipAction`,
 * a separate verb behind a separate button.
 *
 * **It re-publishes through the ordinary publish path**, deliberately, and not
 * through a direct write to the origin. Since 3.4.3 `/media` answers
 * `s-maxage=31536000`, a year at the edge, and that is only honest because
 * every write in the publisher purges the URL it changed. `PublishClipAction`
 * on the publisher purges the page and the media URL and then pre-warms them;
 * a shortcut that put the bytes there some other way would serve the old clip
 * for a year, and no reload would fix it, because the browser is not the one
 * holding the copy.
 *
 * Which is why this action is almost nothing: `PublishClipAction` with
 * `compress: true` already compresses to a scratch copy under the clip's own
 * filename and uploads it, multer's disk storage overwrites by name, and the
 * publisher purges and warms by itself. What is added here is refusing to run
 * on an unpublished clip, and reading the origin before and after so the
 * answer is measured rather than assumed.
 */
export class CompressPublishedClipAction extends BaseAction<
  CompressPublishedClipInput,
  CompressPublishedClipOutput
> {
  async execute({ clipId }: CompressPublishedClipInput): Promise<CompressPublishedClipOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });

    if (!clip.published || !clip.publishedUrl) {
      throw new Error('That clip is not published, so there is no public copy to compress.');
    }

    const mediaUrl = mediaUrlFor(clip.publishedUrl);
    const beforeBytes = mediaUrl ? await remoteSize(mediaUrl) : null;

    // The whole feature, reached rather than reimplemented. `compress: true`
    // overrides the setting for this one upload, which is exactly what this is.
    const { clip: updated } = await new PublishClipAction().execute({ id: clipId, compress: true });

    const afterUrl = mediaUrlFor(updated.publishedUrl);
    const afterBytes = afterUrl ? await remoteSize(afterUrl) : null;
    const purged = afterUrl ? await edgeMissed(afterUrl) : null;

    console.log(
      `[compress] published copy of ${clip.filename}: ` +
        `${describe(beforeBytes)} to ${describe(afterBytes)}, edge ${purged === null ? 'unknown' : purged ? 'purged' : 'STILL SERVING THE OLD FILE'}`,
    );

    return { url: updated.publishedUrl, beforeBytes, afterBytes, purged };
  }
}

/**
 * The `/media` URL for a clip, from the page URL the row carries.
 *
 * `publishedUrl` is the embed page, which is `no-store` and says nothing about
 * the file. The bytes are at `/media/<filename>`, which is the URL with the
 * year-long edge cache on it and therefore the one worth measuring.
 */
function mediaUrlFor(publishedUrl: string | null): string | null {
  if (!publishedUrl) return null;
  try {
    const url = new URL(publishedUrl);
    const filename = url.pathname.split('/').filter(Boolean).pop();
    if (!filename) return null;
    return `${url.origin}/media/${filename}`;
  } catch {
    return null;
  }
}

/**
 * How big the file at a URL is, without downloading it.
 *
 * A range request rather than a HEAD: some edges answer a HEAD from a
 * different code path, and this is the same one-byte request `cachePrewarm`
 * already uses for the same reason. Never throws: this is a number for a
 * sentence, and failing to get it must not fail a re-publish that worked.
 */
async function remoteSize(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    // `content-range: bytes 0-0/123456` is the total; `content-length` on a
    // 206 is 1, which is not the answer.
    const range = response.headers.get('content-range');
    const total = range?.split('/')[1];
    const size = Number(total);
    return Number.isFinite(size) && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/**
 * Whether the edge is serving the file fresh.
 *
 * Right after a purge this should be a `MISS`: the edge has thrown its copy
 * away and gone back to the origin. A `HIT` here means the purge did not
 * happen, which is the failure this whole PR has to be careful about, because
 * the symptom otherwise is a viewer saying "it looks the same" a day later.
 *
 * Null when there is no Cloudflare in front of the origin, which is a
 * perfectly ordinary way to run the publisher and not something to report as
 * a problem.
 */
async function edgeMissed(url: string): Promise<boolean | null> {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const status = response.headers.get('cf-cache-status');
    if (!status) return null;
    return status.toUpperCase() !== 'HIT';
  } catch {
    return null;
  }
}

const describe = (bytes: number | null): string =>
  bytes === null ? 'unknown' : `${(bytes / 1e6).toFixed(1)} MB`;
