import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { publisherService, publishedGoodBitsFor } from './publisherService.js';

/**
 * Tell the publisher what a clip says about itself now.
 *
 * The sidecar beside a published clip holds a name, a game and, since the
 * chaptered player, the clip's marks. All three are metadata, so all three can
 * change long after the upload, and none of them is worth re-sending a few
 * hundred megabytes of video over. `PATCH /:filename/metadata` is the endpoint
 * that exists for exactly that, and this is the one place that decides what to
 * put in it, so renaming a clip and marking one cannot send different pictures
 * of the same row.
 *
 * Nothing happens for a clip that was never published, which is most of them.
 *
 * It never throws. A mark that did not reach the publisher leaves an embed
 * page a band short; a mark that failed to save because of it would lose the
 * thing somebody had just written down.
 */
export async function pushPublishedMetadata(clip: Clip): Promise<void> {
  if (!clip.published) return;

  try {
    const game = await AppDataSource.getRepository(Game).findOne({ where: { name: clip.game } });
    await publisherService.updateMetadata(
      clip.filename,
      clip.displayName || clip.filename,
      game?.displayName || clip.game,
      await publishedGoodBitsFor(clip.id),
    );
  } catch (error) {
    console.error(
      `Failed to update published metadata for ${clip.filename}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * The same, for a caller holding a clip id rather than a row.
 *
 * The GoodBit routes are all of them: they answer with the mark they just
 * wrote and never load the clip, and a clip that has gone between the write
 * and this call is a publish that no longer matters.
 *
 * It swallows the lookup too, because its callers run it *after* they have
 * answered: a throw there reaches the error handler, which would write a
 * status onto a response that has already been sent.
 */
export async function pushPublishedMetadataFor(clipId: number): Promise<void> {
  try {
    const clip = await AppDataSource.getRepository(Clip).findOneBy({ id: clipId });
    if (clip) await pushPublishedMetadata(clip);
  } catch (error) {
    console.error(
      `Failed to update published metadata for clip ${clipId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
