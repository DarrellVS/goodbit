import axios from 'axios';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { publisherAuthHeaders, publisherBaseUrl } from '../services/publisherConfig.js';
import { ClipDTO } from '@shared/index.js';

export interface PublisherClipStat {
  filename: string;
  sizeBytes: number;
  publishedAt: string;
  views: number;
  lastViewedAt: string;
}

export interface SyncPublisherStatsOutput {
  /**
   * The published clips, with their numbers already on them.
   *
   * Returned rather than left for a second request: this action loads exactly
   * those rows to write the counts, so handing them back costs nothing and
   * saves the screen a round trip and the list route a `published` filter it
   * has no other use for.
   */
  clips: ClipDTO[];
  /** How many rows had their numbers changed. */
  updated: number;
  totals: { clips: number; bytes: number; views: number };
  /**
   * When the publisher started counting at all, or null if it never has.
   *
   * The honest answer to "0 views" on a clip published two years ago: nothing
   * was counting then. Anything suggesting a cleanup has to read this or it
   * will recommend deleting the whole library the first time it runs.
   */
  countingSince: string | null;
}

/**
 * Bring the publisher's view counts back onto the rows.
 *
 * **Pulled, not polled.** On app start and when the Publisher screen opens. A
 * background timer refreshing a number that only matters while somebody is
 * looking at it is cost with no reader, and every refresh is a request over
 * somebody's home uplink to their own server.
 *
 * Mirrored onto `clip` rather than fetched per tile for the same reason
 * `suggestedCount` is: the library is one query per page, and a remote lookup
 * per card is the shape `mediaQueue` exists to prevent.
 *
 * Never throws for the ordinary reasons. No publisher configured, a publisher
 * too old to have the endpoint, one that is simply switched off: all of those
 * are "no numbers today" rather than an error, because nothing the user asked
 * for has failed.
 */
export class SyncPublisherStatsAction extends BaseAction<void, SyncPublisherStatsOutput> {
  async execute(): Promise<SyncPublisherStatsOutput> {
    const empty: SyncPublisherStatsOutput = {
      clips: [],
      updated: 0,
      totals: { clips: 0, bytes: 0, views: 0 },
      countingSince: null,
    };

    const baseUrl = publisherBaseUrl();
    if (!baseUrl) return empty;

    let payload: {
      clips?: PublisherClipStat[];
      totals?: SyncPublisherStatsOutput['totals'];
      countingSince?: string | null;
    };

    try {
      const response = await axios.get(`${baseUrl}/api/publish/stats`, {
        headers: publisherAuthHeaders(),
        timeout: 15_000,
      });
      payload = response.data ?? {};
    } catch (error) {
      /*
       * A 404 is the interesting one: the publisher is older than the counter.
       * That is a container to update rather than anything wrong, and it is
       * the state every existing install is in on the day this ships.
       */
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        console.log('[publisher] this publisher has no stats endpoint yet; update the container');
      } else {
        console.warn(
          '[publisher] could not read the view counts:',
          error instanceof Error ? error.message : String(error),
        );
      }
      return empty;
    }

    const stats = new Map((payload.clips ?? []).map((stat) => [stat.filename, stat]));

    const repo = AppDataSource.getRepository(Clip);
    // Only the published ones. The publisher knows nothing about the rest, and
    // writing null over null is a save per row for no change.
    const clips = await repo.find({ where: { published: true } });

    if (!stats.size) {
      return {
        clips: clips.map((clip) => ClipDTO.fromEntity(clip)),
        updated: 0,
        totals: payload.totals ?? empty.totals,
        countingSince: payload.countingSince ?? null,
      };
    }

    let updated = 0;
    for (const clip of clips) {
      const stat = stats.get(clip.filename);
      if (!stat) continue;

      const lastViewedAt = stat.lastViewedAt ? new Date(stat.lastViewedAt) : null;
      const sameDate =
        (clip.publisherLastViewedAt?.getTime() ?? null) === (lastViewedAt?.getTime() ?? null);
      if (clip.publisherViews === stat.views && sameDate) continue;

      clip.publisherViews = stat.views;
      clip.publisherLastViewedAt = lastViewedAt;
      await repo.save(clip);
      updated += 1;
    }

    if (updated) console.log(`[publisher] view counts updated on ${updated} clips`);

    return {
      clips: clips.map((clip) => ClipDTO.fromEntity(clip)),
      updated,
      totals: payload.totals ?? empty.totals,
      countingSince: payload.countingSince ?? null,
    };
  }
}
