import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { ClipDTO } from '@shared/index.js';

export interface FindUnreviewedClipsInput {
  /** How old a clip has to be before it counts as abandoned. Days. */
  olderThanDays?: number;
}

export interface UnreviewedGroup {
  game: string;
  clips: ClipDTO[];
  /** What deleting the whole group would give back. */
  reclaimableBytes: number;
}

export interface FindUnreviewedClipsOutput {
  groups: UnreviewedGroup[];
  totalClips: number;
  totalBytes: number;
  /** The whole library, so the screen can say what share of it this is. */
  libraryClips: number;
  libraryBytes: number;
}

/** A month is long enough that "I will get to it" has stopped being true. */
export const DEFAULT_UNREVIEWED_DAYS = 30;

/**
 * The clips nobody ever did anything with.
 *
 * Never opened, never starred, never tagged, never marked, and old enough that
 * it is not going to happen. Each of those is a column on `clip` or a join that
 * is already indexed, so this is one query rather than a sweep over the disk.
 *
 * **`openCount = 0` is the load-bearing one**, and the only reason this screen
 * can exist: it has been collecting since 2.0, doing nothing, precisely so that
 * a retention screen shipped later would have something honest to go on. Built
 * without it, the best available signal is "untagged and unstarred", which
 * confidently recommends deleting clips that have been watched twenty times.
 *
 * **Tags count as review**, and in this app that is sound. Smart tag patterns
 * only ever *suggest*: `useClipTags` computes suggestions and somebody presses
 * one to apply it, and nothing anywhere applies a pattern on its own. So every
 * row in `clip_tags_tag` was put there by a person. If that ever changes, this
 * query has to change with it, or the graveyard becomes permanently empty for
 * anybody using smart tags.
 *
 * **A null `recordedAt` is not old, it is unknown.** It falls back to
 * `fileModifiedAt`, which is NOT NULL, rather than being treated as the epoch
 * and swept into the oldest group.
 */
export class FindUnreviewedClipsAction extends BaseAction<
  FindUnreviewedClipsInput,
  FindUnreviewedClipsOutput
> {
  async execute(input: FindUnreviewedClipsInput): Promise<FindUnreviewedClipsOutput> {
    const days = Math.max(0, input.olderThanDays ?? DEFAULT_UNREVIEWED_DAYS);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const repo = AppDataSource.getRepository(Clip);

    const rows = await repo
      .createQueryBuilder('clip')
      .where('clip.openCount = 0')
      .andWhere('clip.starred = 0')
      /*
       * A clip somebody gave a title to, or wrote a note on, is never offered
       * up. Naming a clip is the most deliberate thing anyone does with one,
       * and it is the one part the Recycle Bin cannot give back: the file can
       * be fetched again, the row with its name cannot. Same rule as the
       * Stream Deck's discard key (`discardableFromAKey`).
       */
      .andWhere("TRIM(COALESCE(clip.displayName, '')) = ''")
      .andWhere("TRIM(COALESCE(clip.notes, '')) = ''")
      .andWhere('COALESCE(clip.recordedAt, clip.fileModifiedAt) < :cutoff', { cutoff })
      /*
       * Marked by hand counts as review; found by the detector does not.
       *
       * The sweep that runs when a game closes writes no GoodBits, but the
       * Trim page does write detected ones when somebody keeps a suggestion,
       * and `source` is what tells those apart. A clip whose only marks came
       * off the screen is still a clip nobody has looked at.
       */
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM good_bit
           WHERE good_bit.clipId = clip.id AND good_bit.source = 'manual'
         )`,
      )
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM clip_tags_tag
           WHERE clip_tags_tag.clipId = clip.id
         )`,
      )
      // Oldest first inside each group, because the oldest is the easiest
      // thing to agree to lose.
      .orderBy('COALESCE(clip.recordedAt, clip.fileModifiedAt)', 'ASC')
      .getMany();

    const byGame = new Map<string, Clip[]>();
    for (const clip of rows) {
      const list = byGame.get(clip.game);
      if (list) list.push(clip);
      else byGame.set(clip.game, [clip]);
    }

    const groups: UnreviewedGroup[] = [...byGame.entries()]
      .map(([game, clips]) => ({
        game,
        clips: clips.map((clip) => ClipDTO.fromEntity(clip)),
        reclaimableBytes: clips.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0),
      }))
      // Most to gain first: the screen is opened by somebody who has just been
      // told they are low on disk space.
      .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);

    const totalBytes = groups.reduce((sum, group) => sum + group.reclaimableBytes, 0);

    /*
     * The library's own totals, so a number has something to be a share of.
     *
     * "48 GB" means nothing on its own. "48 GB, a third of your library" is the
     * sentence somebody can act on, and it is also the one that stops this
     * screen overstating itself on a small library.
     */
    const library = await repo
      .createQueryBuilder('clip')
      .select('COUNT(1)', 'count')
      .addSelect('COALESCE(SUM(clip.sizeBytes), 0)', 'bytes')
      .getRawOne<{ count: number; bytes: number }>();

    return {
      groups,
      totalClips: rows.length,
      totalBytes,
      libraryClips: Number(library?.count ?? 0),
      libraryBytes: Number(library?.bytes ?? 0),
    };
  }
}
