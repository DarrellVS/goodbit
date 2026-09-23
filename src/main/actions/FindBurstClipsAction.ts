import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { ClipDTO } from '@shared/index.js';
import { DEFAULT_BURST_WINDOW_SEC, findBursts } from '../services/bursts.js';

export interface FindBurstClipsInput {
  /** Seconds between consecutive saves for them to be one moment. */
  windowSec?: number;
}

export interface BurstClusterDTO {
  game: string;
  clips: ClipDTO[];
  spanSec: number;
  reclaimableBytes: number;
  /** The longest clip. A suggestion the screen shows as one. */
  suggestedKeeperId: number;
}

export interface FindBurstClipsOutput {
  clusters: BurstClusterDTO[];
  totalClips: number;
  /** What keeping one clip per cluster would give back. */
  reclaimableBytes: number;
}

/**
 * The same moment, saved three times.
 *
 * The replay buffer holds the last thirty seconds, so pressing the key twice
 * ten seconds apart writes two files with twenty seconds of the same footage in
 * both. It happens because the first press did not obviously work, or because
 * the thing kept being good, and what lands is three copies of one play at a
 * few hundred megabytes each.
 *
 * The row filter is here; the grouping is `services/bursts.ts`, which is a pure
 * function over timestamps with a unit test. Deliberately not a SQL self-join:
 * that gives *pairs*, and three clips sixty seconds apart produce two pairs
 * that both have to become one cluster of three. A wrongly split cluster looks
 * exactly like two real bursts, which is a bad thing to be wrong about on a
 * screen whose verb is delete.
 *
 * Clips with no date are excluded rather than guessed at, and clips already
 * published carry their badge into the cluster, so nobody deletes the one with
 * a live link by accident.
 */
export class FindBurstClipsAction extends BaseAction<FindBurstClipsInput, FindBurstClipsOutput> {
  async execute(input: FindBurstClipsInput): Promise<FindBurstClipsOutput> {
    const windowSec = Math.max(1, input.windowSec ?? DEFAULT_BURST_WINDOW_SEC);

    const rows = await AppDataSource.getRepository(Clip)
      .createQueryBuilder('clip')
      /*
       * An export is not a burst.
       *
       * Two montages rendered a minute apart are two deliberate acts and
       * neither is a copy of the other, but they land in the game's own folder
       * now and so appear in the library beside the recordings they were cut
       * from. Without this, rendering three versions of one edit would be
       * offered up as duplicate footage to delete.
       */
      .where('clip.isExport = 0')
      /*
       * A clip somebody gave a title to, or wrote a note on, is never offered
       * up. Naming a clip is the most deliberate thing anyone does with one,
       * and it is the one part the Recycle Bin cannot give back: the file can
       * be fetched again, the row with its name cannot. Same rule as the
       * Stream Deck's discard key (`discardableFromAKey`). Left out before
       * clustering, so a named save is never in a burst, and the unnamed
       * saves around it are still offered as each other's duplicates.
       */
      .andWhere("TRIM(COALESCE(clip.displayName, '')) = ''")
      .andWhere("TRIM(COALESCE(clip.notes, '')) = ''")
      .orderBy('COALESCE(clip.recordedAt, clip.fileModifiedAt)', 'ASC')
      .getMany();

    const byId = new Map(rows.map((clip) => [clip.id, clip]));

    const clusters = findBursts(
      rows.map((clip) => ({
        id: clip.id,
        game: clip.game,
        // The recording's own date, and `fileModifiedAt` only as a fallback.
        // A trim rewrites the file, so the modified time is when somebody
        // pressed save rather than when the moment happened.
        recordedAtMs: new Date(clip.recordedAt ?? clip.fileModifiedAt).getTime(),
        durationSec: clip.durationSec,
        sizeBytes: clip.sizeBytes,
      })),
      windowSec,
    );

    const dtos: BurstClusterDTO[] = clusters.map((cluster) => ({
      game: cluster.game,
      clips: cluster.clips
        .map((candidate) => byId.get(candidate.id))
        .filter((clip): clip is Clip => Boolean(clip))
        .map((clip) => ClipDTO.fromEntity(clip)),
      spanSec: cluster.spanSec,
      reclaimableBytes: cluster.reclaimableBytes,
      suggestedKeeperId: cluster.suggestedKeeperId,
    }));

    return {
      clusters: dtos,
      totalClips: dtos.reduce((sum, cluster) => sum + cluster.clips.length, 0),
      reclaimableBytes: dtos.reduce((sum, cluster) => sum + cluster.reclaimableBytes, 0),
    };
  }
}
