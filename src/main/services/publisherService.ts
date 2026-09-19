import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { EnsureThumbnailAction } from '../actions/EnsureThumbnailAction.js';
import { RemotePublishAction } from '../actions/RemotePublishAction.js';
import { RemotePublishThumbnailAction } from '../actions/RemotePublishThumbnailAction.js';
import { RemoteUnpublishAction } from '../actions/RemoteUnpublishAction.js';
import { RemoteListPublishedAction } from '../actions/RemoteListPublishedAction.js';
import { RemoteUpdateMetadataAction } from '../actions/RemoteUpdateMetadataAction.js';
import { ListGoodBitsAction } from '../actions/ListGoodBitsAction.js';
import { toPublishedGoodBits, type PublishedGoodBit } from '@shared/index.js';

class PublisherService {
  /**
   * @param posterPath The JPEG the embed page should use as its poster. Left
   * out, it is looked up from the clip that owns `filePath`, which is what
   * every caller publishing a clip straight out of the library wants. Passed
   * explicitly by the one caller that uploads something else: a compressed
   * copy in a scratch folder has no row of its own, and the poster still has
   * to be the library's.
   * @param goodBits The clip's marks, which the embed page draws on its
   * scrubber. The same argument as the poster applies to a compressed copy:
   * the file being uploaded has no row, and the marks belong to the clip it
   * was made from. They still line up, because compressing re-encodes the
   * whole recording rather than cutting any of it.
   */
  async publish(
    filePath: string,
    displayName?: string,
    game?: string,
    onProgress?: (fraction: number) => void,
    posterPath?: string,
    goodBits?: PublishedGoodBit[],
  ): Promise<{ filename: string; url: string; }>
  {
    const action = new RemotePublishAction();
    const result = await action.execute({ filePath, displayName, game, onProgress, goodBits });
    await this.sendPoster(result.filename, posterPath ?? (await posterForFile(filePath)));
    return result;
  }

  async unpublish(filename: string): Promise<{ removed: boolean; }>
  {
    const action = new RemoteUnpublishAction();
    return await action.execute({ filename });
  }

  async listPublished(): Promise<string[]> {
    const action = new RemoteListPublishedAction();
    const { files } = await action.execute();
    return files;
  }

  async updateMetadata(
    filename: string,
    displayName: string,
    game: string,
    goodBits?: PublishedGoodBit[],
  ): Promise<{ success: boolean; }>
  {
    const action = new RemoteUpdateMetadataAction();
    return await action.execute({ filename, displayName, game, goodBits });
  }

  /**
   * The poster follows the clip, and its failure is not the clip's.
   *
   * The publisher no longer carries ffmpeg to cut one, so this is where an
   * embed's picture comes from. It is still the smaller half of the job: the
   * clip is up, the link works and the page reads correctly without a poster,
   * and a publisher too old to have the endpoint answers 404 and draws its own
   * as it always did. So a failure here is logged and nothing more. Throwing
   * would undo a publish that worked over a thumbnail that did not.
   */
  private async sendPoster(filename: string, posterPath: string | undefined): Promise<void> {
    if (!posterPath) return;
    try {
      await new RemotePublishThumbnailAction().execute({ filename, posterPath });
    } catch (error) {
      console.warn(`Published ${filename} without a poster frame:`, whyNoPoster(error));
    }
  }
}

/**
 * Why a poster did not land, in words that name the fix.
 *
 * A 404 here is the one interesting answer: the publisher is older than the
 * endpoint, which is a container to update rather than anything wrong. It also
 * costs nothing, since a publisher that old still has the ffmpeg to cut its
 * own frame. Everything else is reported as it arrived.
 */
function whyNoPoster(error: unknown): string {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404) {
    return 'this publisher has no poster endpoint, so it is drawing its own. Update the container to send the library\'s picture instead.';
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The clip's own cached thumbnail, which is what the embed page shows.
 *
 * Normally a cache hit: the library card drew this picture the moment the clip
 * was indexed, 1280 wide and tone mapped. It regenerates after a trim, which
 * is the point, since a re-published cut must not carry the frame it had
 * before.
 *
 * Never throws. A publish that worked is not undone by a poster that did not.
 */
export async function posterForClip(clip: Clip): Promise<string | undefined> {
  try {
    const thumbPath = await new EnsureThumbnailAction().execute({ clip });
    // Made, but not necessarily still there: the cache lives beside the clips
    // and anything may have cleared it between these two lines.
    await fsPromises.access(thumbPath);
    return thumbPath;
  } catch (error) {
    console.warn(
      `No poster frame for ${path.basename(clip.filePath)}:`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/**
 * The same, for a caller that has a path and not a row.
 *
 * Matched on `Clip.filePath`, which is that column's unique key, and every
 * caller passes a `clip.filePath` straight off the row it just read, so the
 * comparison is exact rather than hopeful. A path that belongs to no row is
 * not an error: it is a compressed copy in a scratch directory, and that
 * caller passes its poster in by hand.
 */
async function posterForFile(filePath: string): Promise<string | undefined> {
  try {
    const clip = await AppDataSource.getRepository(Clip).findOneBy({ filePath });
    return clip ? await posterForClip(clip) : undefined;
  } catch (error) {
    console.warn(
      `No poster frame for ${path.basename(filePath)}:`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/**
 * The marks on a clip, in the shape the publisher stores.
 *
 * Never throws, for the same reason the poster lookup does not: a publish that
 * worked is not undone because the chapter list could not be read, and a clip
 * whose marks failed to go up is a plain player rather than a broken one. The
 * caller logs and carries on.
 */
export async function publishedGoodBitsFor(clipId: number): Promise<PublishedGoodBit[]> {
  try {
    const { goodBits } = await new ListGoodBitsAction().execute({ clipId });
    return toPublishedGoodBits(goodBits);
  } catch (error) {
    console.warn(
      `No chapter marks for clip ${clipId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

export const publisherService = new PublisherService();
