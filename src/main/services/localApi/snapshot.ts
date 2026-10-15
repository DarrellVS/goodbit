/**
 * OWNER: events.
 *
 * Builds the whole state, and owns the two definitions every route and every
 * stream must agree on: the one "latest" (`LATEST_CLIP_ORDER` in
 * `@shared/localApi`, never a second query) and the one "saving" (the raw
 * staging watch plus the 45 s fallback, confirmed by a staging read).
 *
 * May import: `@shared/localApi`, `../../entity/*`, `../jobs.js`,
 * `../notch/status.js`, `../obs/*`, `../steam/*`, `../../startup.js` types,
 * `../../settings.js`. Never `server.js`, `routes.js`, `index.js`.
 * `stream.js` imports this; this does not import `stream.js`.
 * Imported by: `stream.ts`, `routes.ts`.
 *
 * Views are re-read from the mirrored `publisherViews` column only: nothing
 * here may start a pull from the publisher.
 *
 * The pure half (rows in, wire shapes out) is `snapshotShape.ts`.
 */
import { readdirSync } from 'node:fs';
import { In, MoreThanOrEqual } from 'typeorm';
import { isVideoFile } from '@shared/constants/videoFiles.js';
import {
  LATEST_CLIP_ORDER,
  LOCAL_API_LIMITS,
  type ApiClip,
  type ApiGame,
  type DriveSection,
  type LocalApiState,
  type ObsSection,
} from '@shared/localApi';
import { AppDataSource } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';
import { Game } from '../../entity/Game.js';
import { loadSettings } from '../../settings.js';
import { incomingDir } from '../capture/incoming.js';
import { listJobs } from '../jobs.js';
import { libraryDisk } from '../notch/status.js';
import { readTiles } from '../notch/wings.js';
import {
  SECTION_CLIP_CAP,
  clipToApi,
  gameRef,
  gameSlug,
  gameToApi,
  hoursLeft,
  jobsToApi,
  publisherSection,
  savingActive,
  sessionOf,
  totalOf,
  weekOf,
  type RecentRow,
} from './snapshotShape.js';

export { gameSlug } from './snapshotShape.js';

/** `state.recent` holds this many recordings after the latest one. */
const RECENT_COUNT = 3;

// ---------------------------------------------------------------------------
// Saving: the one definition
// ---------------------------------------------------------------------------

let savingSince: number | null = null;

/** The raw staging watch saw a replay arrive. */
export function noteSaving(now: number = Date.now()): void {
  savingSince = now;
}

/** The clip has a row, or the replay was given up on. */
export function noteSaved(): void {
  savingSince = null;
}

/** The one "saving": true while a recording is being filed. */
export function isSaving(now: number = Date.now()): boolean {
  return savingActive(savingSince, now, LOCAL_API_LIMITS.savingFallbackMs);
}

/**
 * Confirm the raw watch against the folder itself: a replay that is no longer
 * in staging is not being filed any more, whatever the 45 s fallback says.
 * Resolves true when the flag changed.
 */
export async function confirmSaving(now: number = Date.now()): Promise<boolean> {
  if (savingSince === null) return false;
  if (!isSaving(now)) {
    savingSince = null;
    return true;
  }
  try {
    if (!readdirSync(incomingDir()).some((name) => isVideoFile(name))) {
      savingSince = null;
      return true;
    }
  } catch {
    // An unreadable staging folder says nothing; the fallback stays in charge.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Slow sections: OBS and the drive
// ---------------------------------------------------------------------------

interface Slow {
  obs: ObsSection;
  drive: DriveSection | null;
  at: number;
}

let slow: Slow | null = null;

async function readDrive(): Promise<DriveSection | null> {
  const disk = await libraryDisk();
  if (!disk) return null;
  let bytes: number | null = null;
  let seconds: number | null = null;
  try {
    // Exports are left out: they are squeezed for sharing and would promise
    // hours the recordings will not get. Same rule as the notch's drive tile.
    const rate = (await AppDataSource.getRepository(Clip)
      .createQueryBuilder('clip')
      .select('SUM(clip.sizeBytes)', 'bytes')
      .addSelect('SUM(clip.durationSec)', 'seconds')
      .where('clip.durationSec > 0')
      .andWhere('clip.isExport = 0')
      .getRawOne()) as { bytes: number | null; seconds: number | null } | undefined;
    bytes = rate?.bytes ?? null;
    seconds = rate?.seconds ?? null;
  } catch {
    // No rate means no hours, not no drive.
  }
  return {
    drive: disk.drive,
    used: Math.min(1, Math.max(0, disk.fraction)),
    freeBytes: disk.freeBytes,
    hoursLeft: hoursLeft(disk.freeBytes, bytes, seconds),
  };
}

async function readObs(): Promise<ObsSection> {
  try {
    const { obsIsInstalled, obsIsRunning } = await import('../obs/paths.js');
    const installed = await obsIsInstalled();
    const running = installed ? await obsIsRunning() : false;
    let replayKey: string | null = null;
    if (installed) {
      const { replayKeyLabel } = await import('../obs/saveReplay.js');
      replayKey = replayKeyLabel();
    }
    return { installed, running, replayKey };
  } catch {
    return { installed: false, running: false, replayKey: null };
  }
}

/**
 * Re-read OBS and the drive when what is held is older than `maxAgeMs`
 * (default: always). Only the stream's timer and a first build call this.
 */
export async function refreshSlow(maxAgeMs = 0): Promise<void> {
  if (slow && Date.now() - slow.at < maxAgeMs) return;
  const [obs, drive] = await Promise.all([readObs(), readDrive().catch(() => null)]);
  slow = { obs, drive, at: Date.now() };
}

// ---------------------------------------------------------------------------
// Rows to the wire
// ---------------------------------------------------------------------------

async function goodBitCounts(ids: readonly number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (ids.length === 0) return counts;
  const rows = (await AppDataSource.query(
    `SELECT "clipId" AS "clipId", COUNT(*) AS "n" FROM "good_bit" WHERE "clipId" IN (${ids.map(() => '?').join(',')}) GROUP BY "clipId"`,
    [...ids],
  )) as Array<{ clipId: number; n: number }>;
  for (const row of rows) counts.set(Number(row.clipId), Number(row.n));
  return counts;
}

async function gameRows(names: readonly string[]): Promise<Map<string, Game>> {
  const unique = [...new Set(names.filter(Boolean))];
  const rows = unique.length ? await AppDataSource.getRepository(Game).find({ where: { name: In(unique) } }) : [];
  return new Map(rows.map((row) => [row.name, row]));
}

/** Clip rows (tags loaded) to wire clips in one pass: games and GoodBit counts are batched. */
export async function toApiClips(clips: readonly Clip[]): Promise<ApiClip[]> {
  const [games, counts] = await Promise.all([
    gameRows(clips.map((clip) => clip.game)),
    goodBitCounts(clips.map((clip) => clip.id)),
  ]);
  return clips.map((clip) =>
    clipToApi(clip, clip.game ? gameRef(clip.game, games.get(clip.game)) : null, counts.get(clip.id) ?? 0),
  );
}

/**
 * A clip row (with tags and game) as the wire shape.
 *
 * Async, unlike the stub: the GoodBit count and the game's name and appid are
 * not on the clip row. `tags` must be loaded on `clip`.
 */
export async function toApiClip(clip: Clip): Promise<ApiClip> {
  return (await toApiClips([clip]))[0]!;
}

/** One clip by id with its tags, as the wire shape, or null for an id that is gone. */
export async function apiClipById(id: number): Promise<ApiClip | null> {
  const clip = await AppDataSource.getRepository(Clip).findOne({ where: { id }, relations: { tags: true } });
  return clip ? toApiClip(clip) : null;
}

/** A game row as the wire shape, or null for a game GoodBit does not know. */
export async function toApiGame(gameId: string): Promise<ApiGame | null> {
  const rows = await AppDataSource.getRepository(Game).find();
  const row = rows.find((candidate) => gameSlug(candidate.name) === gameId);
  return row ? gameToApi(row) : null;
}

// ---------------------------------------------------------------------------
// Latest: the one ordering
// ---------------------------------------------------------------------------

/** The newest recordings, newest first, by `LATEST_CLIP_ORDER`'s own SQL. */
async function newestIds(limit: number): Promise<number[]> {
  const sql = LATEST_CLIP_ORDER.sql;
  const rows = (await AppDataSource.getRepository(Clip)
    .createQueryBuilder('clip')
    .select('clip.id', 'id')
    .where(sql.where)
    .orderBy(sql.primary, sql.direction)
    .addOrderBy(sql.secondary, sql.direction)
    .limit(limit)
    .getRawMany()) as Array<{ id: number }>;
  return rows.map((row) => Number(row.id));
}

/** The id of the latest recording, per the one ordering rule, or null for an empty library. */
export async function latestClipId(): Promise<number | null> {
  if (!AppDataSource.isInitialized) return null;
  return (await newestIds(1))[0] ?? null;
}

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

/** The jobs section alone, with no database read: what the 250 ms push uses. */
export function buildJobs(): LocalApiState['jobs'] {
  return jobsToApi(listJobs());
}

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function emptyState(): LocalApiState {
  return {
    saving: { active: isSaving() },
    obs: slow?.obs ?? { installed: false, running: false, replayKey: null },
    drive: slow?.drive ?? null,
    today: { count: 0, totalSec: 0 },
    latest: null,
    session: null,
    recent: [],
    found: { goodBits: 0, clipIds: [] },
    tags: { top: [] },
    week: { count: 0, totalSec: 0, games: [] },
    views: null,
    jobs: buildJobs(),
    clips: {},
    games: {},
    publisher: publisherSection(loadSettings().publisherBaseUrl),
  };
}

/** Read everything and build every section. A section that cannot be read is its empty value, never missing. */
export async function buildState(): Promise<LocalApiState> {
  await refreshSlow(LOCAL_API_LIMITS.slowPollMs);
  const state = emptyState();
  if (!AppDataSource.isInitialized) return state;

  const repo = AppDataSource.getRepository(Clip);

  // Same `recordedAt` the library groups by, so "today" agrees with the island.
  const weekRows = (await repo
    .find({
      where: { recordedAt: MoreThanOrEqual(new Date(Date.now() - 7 * 24 * 3600 * 1000)), isExport: false },
      select: { id: true, game: true, durationSec: true, recordedAt: true },
    })
    .catch(() => [])) as RecentRow[];
  const start = startOfToday().getTime();
  const todayRows = weekRows.filter((row) => (row.recordedAt ? new Date(row.recordedAt).getTime() >= start : false));
  state.today = totalOf(todayRows);
  state.week = weekOf(weekRows);

  const ids = await newestIds(1 + RECENT_COUNT).catch(() => [] as number[]);
  const latestId = ids[0] ?? null;
  state.recent = ids.slice(1);
  const latestGame =
    latestId === null ? null : ((await repo.findOne({ where: { id: latestId }, select: { id: true, game: true } }))?.game ?? null);

  // The notch's own readers for what they already know how to say: the tags
  // tile's top names, and the found tile's moments and clips.
  const tiles = await readTiles(['tags', 'found'], {
    obsInstalled: state.obs.installed,
    obsRunning: state.obs.running,
    disk: null,
    share: 'idle',
  }).catch(() => null);
  state.tags = { top: tiles?.tiles.tags?.tags.map((tag) => tag.name) ?? [] };
  state.found = {
    goodBits: tiles?.tiles.found?.moments ?? 0,
    clipIds: (tiles?.foundClipIds ?? []).slice(0, SECTION_CLIP_CAP),
  };

  if (state.publisher.configured) {
    const published = await repo.find({
      where: { published: true },
      select: { id: true, publisherViews: true },
      order: { publisherViews: 'DESC' },
    });
    state.views = {
      total: published.reduce((sum, clip) => sum + (clip.publisherViews ?? 0), 0),
      published: published.length,
      top: published[0]?.publisherViews ?? 0,
    };
  }

  // Everything another section names is in `clips`, counted once.
  const sessionIds = sessionOf(todayRows, latestGame, () => 0)?.clipIds ?? [];
  const referenced = new Set<number>([
    ...(latestId === null ? [] : [latestId]),
    ...sessionIds,
    ...state.recent,
    ...state.found.clipIds,
  ]);
  const rows = referenced.size ? await repo.find({ where: { id: In([...referenced]) }, relations: { tags: true } }) : [];
  const [counts, games, allGames] = await Promise.all([
    goodBitCounts([...referenced]),
    gameRows(rows.map((row) => row.game)),
    state.week.games.length ? AppDataSource.getRepository(Game).find() : Promise.resolve([] as Game[]),
  ]);

  for (const row of rows) {
    const known = games.get(row.game);
    const ref = row.game ? gameRef(row.game, known) : null;
    state.clips[String(row.id)] = clipToApi(row, ref, counts.get(row.id) ?? 0);
    if (ref) state.games[ref.id] = gameToApi(known ?? { name: row.game, displayName: null, steamAppId: null });
  }
  for (const [slug] of state.week.games) {
    const row = allGames.find((candidate) => gameSlug(candidate.name) === slug);
    if (row && !state.games[slug]) state.games[slug] = gameToApi(row);
  }

  state.latest = latestId === null ? null : (state.clips[String(latestId)] ?? null);
  state.session = sessionOf(todayRows, latestGame, (id) => counts.get(id) ?? 0);
  return state;
}

// ---------------------------------------------------------------------------
// What the stream last published
// ---------------------------------------------------------------------------

let current: { rev: number; state: LocalApiState } | null = null;

/** `stream.ts` calls this whenever it advances, so `GET /v1/state` and the stream cannot disagree. */
export function setPublished(rev: number, state: LocalApiState): void {
  current = { rev, state };
}

/** The stream has no subscribers any more, so what it held is going stale. */
export function clearPublished(): void {
  current = null;
}

/** The last state and revision `stream.ts` published, for `GET /v1/state`. Builds one if nobody is subscribed. */
export async function currentSnapshot(): Promise<{ rev: number; state: LocalApiState }> {
  if (current) return current;
  return { rev: 0, state: await buildState() };
}
