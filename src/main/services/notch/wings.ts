/**
 * What the notch's wings say, and what their tiles do when pressed.
 *
 * Like `status.ts`, nothing here is a new source. Every tile reads a row, a
 * job, the drive or OBS's own files, and every press hands over to an Action
 * that already exists. Only the tiles somebody placed are read, so a wing of
 * four small tiles costs four small queries.
 *
 * A tile that has nothing true to say on this machine is left out of the
 * answer rather than drawn empty: no publisher means no Views and no Share, a
 * last game Steam does not know means no Play again. The page leaves its cell
 * blank, and Settings shows the reason.
 */
import { MoreThanOrEqual } from 'typeorm';
import type { NotchClipThumb, NotchTiles, NotchTilePress } from '@shared/notch.js';
import type { TileId } from '@shared/notchWings.js';
import { loadSettings } from '../../settings.js';
import { clipLength, type Disk } from './status.js';

export type ShareState = 'idle' | 'working' | 'copied' | 'failed';

export interface TileContext {
  obsInstalled: boolean;
  obsRunning: boolean;
  disk: Disk | null;
  share: ShareState;
}

/** What a read found beyond what it shows: the ids a press is allowed to act on. */
export interface TileRead {
  tiles: NotchTiles;
  latestId: number | null;
  foundClipIds: number[];
}

function thumb(clip: {
  id: number;
  fileModifiedAt: Date;
  durationSec?: number | null;
  suggestedCount?: number | null;
}): NotchClipThumb {
  return {
    id: clip.id,
    modifiedAt: new Date(clip.fileModifiedAt).toISOString(),
    length: clip.durationSec ? clipLength(clip.durationSec) : '',
    moments: clip.suggestedCount ?? null,
  };
}

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

/** "9 h", or "40 min" under an hour. Rounded down: this is a promise about space. */
function recordingTime(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.max(0, Math.floor(seconds / 60))} min`;
}

/** "1.1 TB", "412 GB", "9.5 GB". Only shown when the library has no length to turn it into hours. */
function freeSpace(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

export async function readTiles(ids: Iterable<TileId>, ctx: TileContext): Promise<TileRead> {
  const want = new Set(ids);
  const tiles: NotchTiles = {};
  const out: TileRead = { tiles, latestId: null, foundClipIds: [] };

  const { AppDataSource } = await import('../../data-source.js');
  if (!AppDataSource.isInitialized || want.size === 0) return out;

  const { Clip } = await import('../../entity/Clip.js');
  const { Game } = await import('../../entity/Game.js');
  const repo = AppDataSource.getRepository(Clip);
  const order = { recordedAt: 'DESC', createdAt: 'DESC' } as const;
  const publisher = Boolean(loadSettings().publisherBaseUrl);

  // The same clip the island calls the latest.
  const latest = await repo.findOne({ where: {}, order, relations: { tags: true } });
  out.latestId = latest?.id ?? null;

  const needsToday = want.has('session') || want.has('found');
  const today = needsToday ? await repo.find({ where: { recordedAt: MoreThanOrEqual(startOfToday()) }, order }) : [];

  if (want.has('recent')) {
    const clips = await repo.find({ where: {}, order, skip: 1, take: 3 });
    tiles.recent = { id: 'recent', clips: clips.map(thumb) };
  }

  if (want.has('session')) {
    const game = latest?.game ?? '';
    const played = today.filter((clip) => clip.game === game);
    const row = game ? await AppDataSource.getRepository(Game).findOneBy({ name: game }) : null;
    tiles.session = {
      id: 'session',
      game: row?.displayName || game,
      clips: played.slice(0, 4).map(thumb),
      count: played.length,
      moments: played.reduce((sum, clip) => sum + (clip.suggestedCount ?? 0), 0),
    };
  }

  if (want.has('found')) {
    const holding = today.filter((clip) => (clip.suggestedCount ?? 0) > 0);
    out.foundClipIds = holding.map((clip) => clip.id);
    tiles.found = {
      id: 'found',
      moments: holding.reduce((sum, clip) => sum + (clip.suggestedCount ?? 0), 0),
      clips: holding.length,
    };
  }

  if (want.has('jobs')) {
    const { listJobs, etaSeconds } = await import('../jobs.js');
    tiles.jobs = {
      id: 'jobs',
      jobs: listJobs()
        .filter((job) => job.status === 'running')
        .map((job) => {
          const eta = etaSeconds(job);
          return { label: job.label || job.message || job.kind, progress: job.progress, eta: eta === null ? null : clipLength(eta) };
        }),
    };
  }

  if (want.has('drive') && ctx.disk) {
    // What a second of this library costs on disk, from the library itself.
    // Exports are left out: they are squeezed for sharing and would promise
    // hours the recordings will not get.
    const rate = (await repo
      .createQueryBuilder('clip')
      .select('SUM(clip.sizeBytes)', 'bytes')
      .addSelect('SUM(clip.durationSec)', 'seconds')
      .where('clip.durationSec > 0')
      .andWhere('clip.isExport = 0')
      .getRawOne()) as { bytes: number | null; seconds: number | null } | undefined;
    const perSecond = rate?.bytes && rate.seconds ? rate.bytes / rate.seconds : 0;
    tiles.drive = {
      id: 'drive',
      drive: ctx.disk.drive,
      free: freeSpace(ctx.disk.freeBytes),
      hours: perSecond > 0 ? recordingTime(ctx.disk.freeBytes / perSecond) : null,
      percent: Math.round(ctx.disk.fraction * 100),
    };
  }

  if (want.has('play') && latest?.game) {
    const row = await AppDataSource.getRepository(Game).findOneBy({ name: latest.game });
    if (row && /^\d+$/.test(row.steamAppId ?? '')) {
      tiles.play = { id: 'play', game: row.name, name: row.displayName || row.name };
    }
  }

  if (want.has('tags')) {
    const top = (await AppDataSource.query(
      `SELECT "tag"."name" AS "name", COUNT(*) AS "uses"
         FROM "clip_tags_tag" JOIN "tag" ON "tag"."id" = "clip_tags_tag"."tagId"
        GROUP BY "tag"."id" ORDER BY "uses" DESC, "tag"."name" ASC LIMIT 4`,
    )) as Array<{ name: string }>;
    const on = new Set((latest?.tags ?? []).map((tag) => tag.name));
    tiles.tags = { id: 'tags', tags: top.map(({ name }) => ({ name, on: on.has(name) })), hasLatest: !!latest };
  }

  if (want.has('star')) {
    tiles.star = { id: 'star', starred: !!latest?.starred, hasLatest: !!latest };
  }

  if (want.has('share') && publisher) {
    tiles.share = { id: 'share', state: ctx.share, published: !!latest?.published, hasLatest: !!latest };
  }

  if (want.has('views') && publisher) {
    const published = await repo.find({ where: { published: true }, order: { publisherViews: 'DESC' } });
    const topClip = published[0];
    tiles.views = {
      id: 'views',
      total: published.reduce((sum, clip) => sum + (clip.publisherViews ?? 0), 0),
      published: published.length,
      top: topClip?.publisherViews
        ? { name: topClip.displayName || topClip.filename, views: topClip.publisherViews }
        : null,
    };
  }

  if (want.has('obs')) {
    const { replayKeyLabel } = await import('../obs/saveReplay.js');
    tiles.obs = {
      id: 'obs',
      recording: !ctx.obsInstalled ? 'missing' : ctx.obsRunning ? 'running' : 'closed',
      key: ctx.obsInstalled ? replayKeyLabel() : null,
    };
  }

  if (want.has('week')) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const week = await repo.find({ where: { recordedAt: MoreThanOrEqual(since), isExport: false } });
    const perGame = new Map<string, number>();
    for (const clip of week) perGame.set(clip.game, (perGame.get(clip.game) ?? 0) + 1);
    tiles.week = {
      id: 'week',
      count: week.length,
      total: clipLength(week.reduce((sum, clip) => sum + (clip.durationSec ?? 0), 0)),
      games: [...perGame.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, count]) => ({ name, count })),
    };
  }

  return out;
}

/** What a press asks main to do once it has been checked. */
export type TileOutcome =
  | { kind: 'navigate'; path: string }
  | { kind: 'changed' }
  | { kind: 'share' }
  | { kind: 'none' };

/**
 * Check a press against what was last shown, and do the quick ones.
 *
 * A clip id has to be one a tile was drawn with and a tag one the tags tile
 * offered, so the page can only ask for what it was shown. The share is left
 * to the caller, because it takes long enough to need its own states.
 */
export async function pressTile(press: NotchTilePress, shown: TileRead): Promise<TileOutcome> {
  const tiles = shown.tiles;
  switch (press.tile) {
    case 'recent':
    case 'session': {
      const clips = tiles[press.tile]?.clips ?? [];
      if (!clips.some((clip) => clip.id === press.clipId)) return { kind: 'none' };
      return { kind: 'navigate', path: `/trim/${press.clipId}` };
    }
    case 'found':
      if (!shown.foundClipIds.length) return { kind: 'none' };
      return { kind: 'navigate', path: `/editor?clips=${shown.foundClipIds.join(',')}&highlights=1` };
    case 'tags': {
      const offered = tiles.tags?.tags.find((tag) => tag.name === press.tag);
      // Adding only. Taking a tag off is a decision about the clip, made where
      // the clip is, and a stray press here should cost nothing.
      if (!offered || offered.on || shown.latestId === null) return { kind: 'none' };
      const { BatchAddTagsAction } = await import('../../actions/BatchOperationsAction.js');
      await new BatchAddTagsAction().execute({ clipIds: [shown.latestId], tags: [offered.name] });
      return { kind: 'changed' };
    }
    case 'star': {
      if (shown.latestId === null) return { kind: 'none' };
      const { BatchStarAction } = await import('../../actions/BatchOperationsAction.js');
      await new BatchStarAction().execute({ clipIds: [shown.latestId], starred: !tiles.star?.starred });
      return { kind: 'changed' };
    }
    case 'share':
      return shown.latestId === null || !tiles.share ? { kind: 'none' } : { kind: 'share' };
    case 'play':
      if (tiles.play) {
        const { launchSteamGame } = await import('../steam/launch.js');
        await launchSteamGame(tiles.play.game);
      }
      return { kind: 'none' };
    case 'jobs':
      return { kind: 'navigate', path: '/' };
    case 'drive':
      return { kind: 'navigate', path: '/storage' };
    case 'views':
      return { kind: 'navigate', path: '/publisher' };
    case 'week':
      return { kind: 'navigate', path: '/stats' };
    case 'obs':
      return { kind: 'navigate', path: '/settings' };
    default:
      return { kind: 'none' };
  }
}
