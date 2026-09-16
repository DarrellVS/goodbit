import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';

/**
 * Remember that somebody opened a clip.
 *
 * `clip.lastOpenedAt` and `clip.openCount` landed with the 2.0 migration and
 * nothing was writing them, which makes them worse than useless: a column that
 * exists and is empty reads like a column that means "never opened".
 *
 * **This cannot be backfilled.** Every day it is not collecting is a day the
 * retention screen will never be able to describe, which is why it is wired up
 * in 2.0 even though nothing reads it until 2.1. The screen wants to say
 * something like *"74 GB across 280 clips. 190 have never been opened, never
 * starred, never tagged, and have no confident suggestion."* and "never opened"
 * is the most useful of those four and the only one the app was not recording.
 *
 * Shipping that screen without it would leave only "untagged and unstarred" to
 * go on, and it would confidently recommend deleting clips that had been
 * watched twenty times.
 */
export interface RecordClipOpenedInput {
  clipId: number;
}

export interface RecordClipOpenedOutput {
  /** False when the open was inside the quiet window and was not counted. */
  counted: boolean;
  openCount: number;
  lastOpenedAt: Date | null;
}

/**
 * How long before opening the same clip again counts as a second view.
 *
 * Without this the count measures navigation rather than interest. Closing the
 * panel and reopening it, or the modal remounting because a trim finished, are
 * each one clip being looked at once. Two minutes is longer than any of those
 * and shorter than the shortest recording anybody would rewatch on purpose.
 *
 * `lastOpenedAt` is still moved forward inside the window, because "when did I
 * last look at this" has a right answer even when the count should not move.
 */
const QUIET_WINDOW_MS = 2 * 60 * 1000;

export class RecordClipOpenedAction extends BaseAction<
  RecordClipOpenedInput,
  RecordClipOpenedOutput
> {
  async execute({ clipId }: RecordClipOpenedInput): Promise<RecordClipOpenedOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });

    const now = new Date();
    const previous = clip.lastOpenedAt ? new Date(clip.lastOpenedAt) : null;
    const counted = !previous || now.getTime() - previous.getTime() > QUIET_WINDOW_MS;

    /*
     * A raw UPDATE, because two columns has to mean two columns.
     *
     * `save` on a loaded entity was never an option: it writes every column it
     * holds, so a view would UPDATE the clip's tags, notes, display name and
     * stars. But `repo.update()` is not enough either, which took a test to
     * find out. **TypeORM applies `@UpdateDateColumn` to `update()` as well**,
     * so `clip.updatedAt` moved every time somebody watched something.
     *
     * Two consequences, and the second is the one that matters. `updatedAt`
     * stops meaning "last edited" and starts meaning "last touched", which is
     * a different and less useful fact. And the FTS triggers in the
     * `ClipSearch` migration fire on **any** update to `clip`, so opening a
     * clip retired and rewrote its four indexed columns for no reason.
     *
     * Parameterised, and the column list is a literal in this file rather than
     * anything derived from input.
     */
    await AppDataSource.query(
      counted
        ? 'UPDATE clip SET lastOpenedAt = ?, openCount = openCount + 1 WHERE id = ?'
        : 'UPDATE clip SET lastOpenedAt = ? WHERE id = ?',
      [now.toISOString(), clipId],
    );

    return {
      counted,
      openCount: (clip.openCount ?? 0) + (counted ? 1 : 0),
      lastOpenedAt: now,
    };
  }
}
