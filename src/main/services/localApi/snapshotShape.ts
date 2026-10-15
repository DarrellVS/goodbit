/**
 * The pure half of the snapshot: rows in, wire shapes out.
 *
 * No database, no Electron, no clock of its own, so `tests/unit` owns it.
 * `snapshot.ts` reads the rows and hands them here.
 */
import type {
  ApiClip,
  ApiGame,
  ApiGameRef,
  ApiJob,
  PublisherSection,
  SessionSection,
  TotalSection,
  WeekSection,
} from '@shared/localApi';
import { etaSeconds, type Job } from '../jobs.js';

/** Most clip ids one section names. Counts stay whole; only the list is capped. */
export const SECTION_CLIP_CAP = 50;

/** How many games the week section lists. */
export const WEEK_GAME_CAP = 5;

/**
 * A game's id on the wire: its folder name as a slug.
 *
 * Folder names hold spaces, dots and brackets, none of which belong in a path
 * segment. Two folders that differ only in case or punctuation share a slug;
 * a reader resolving one takes the first, which is the honest limit of a slug.
 */
export function gameSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'game';
}

export interface GameRowLike {
  name: string;
  displayName: string | null;
  steamAppId: string | null;
}

export function gameRef(folder: string, row?: GameRowLike | null): ApiGameRef {
  return {
    id: gameSlug(folder),
    name: row?.displayName || row?.name || folder,
    steamAppId: row?.steamAppId || null,
  };
}

export function gameToApi(row: GameRowLike): ApiGame {
  const ref = gameRef(row.name, row);
  return { ...ref, launchable: /^\d+$/.test(ref.steamAppId ?? '') };
}

export interface ClipRowLike {
  id: number;
  game: string;
  filename: string;
  displayName: string | null;
  durationSec?: number | null;
  recordedAt?: Date | string | null;
  fileModifiedAt: Date | string | number;
  starred: boolean;
  published: boolean;
  publisherViews?: number | null;
  tags?: Array<{ name: string }>;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function clipToApi(clip: ClipRowLike, game: ApiGameRef | null, goodBits: number): ApiClip {
  const modified =
    clip.fileModifiedAt instanceof Date ? clip.fileModifiedAt.getTime() : new Date(clip.fileModifiedAt).getTime();
  return {
    id: clip.id,
    name: clip.displayName || clip.filename,
    game,
    lengthSec: clip.durationSec ?? null,
    recordedAt: iso(clip.recordedAt),
    modifiedAt: Number.isFinite(modified) ? modified : 0,
    starred: !!clip.starred,
    published: !!clip.published,
    views: clip.publisherViews ?? 0,
    goodBits,
    tags: (clip.tags ?? []).map((tag) => tag.name),
  };
}

export function jobsToApi(jobs: readonly Job[]): ApiJob[] {
  return jobs
    .filter((job) => job.status === 'running')
    .map((job) => ({
      id: job.id,
      label: job.label || job.message || job.kind,
      progress: job.progress,
      etaSec: etaSeconds(job),
    }));
}

/** The host only: a base URL can carry a path or a token somebody pasted into it. */
export function publisherSection(baseUrl: string | undefined | null): PublisherSection {
  const text = (baseUrl ?? '').trim();
  if (!text) return { configured: false, host: null };
  try {
    return { configured: true, host: new URL(text).host || null };
  } catch {
    return { configured: true, host: null };
  }
}

/** Whole hours of recording the free space holds at this library's own rate, or null with no rate. */
export function hoursLeft(freeBytes: number, libraryBytes: number | null, librarySeconds: number | null): number | null {
  if (!libraryBytes || !librarySeconds || libraryBytes <= 0 || librarySeconds <= 0) return null;
  const perSecond = libraryBytes / librarySeconds;
  const hours = freeBytes / perSecond / 3600;
  return Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : null;
}

export interface RecentRow {
  id: number;
  game: string;
  durationSec?: number | null;
  recordedAt?: Date | string | null;
}

function momentMs(row: RecentRow): number {
  const value = row.recordedAt;
  if (value === null || value === undefined) return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** Newest first, ties by id, the same order `LATEST_CLIP_ORDER` gives the database. */
export function newestFirst<T extends RecentRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => momentMs(b) - momentMs(a) || b.id - a.id);
}

export function totalOf(rows: readonly RecentRow[]): TotalSection {
  return { count: rows.length, totalSec: Math.round(rows.reduce((sum, row) => sum + (row.durationSec ?? 0), 0)) };
}

/**
 * Today's clips of the latest recording's game. Null when there are none, which
 * is a desktop with nothing recorded today rather than a session of zero.
 */
export function sessionOf(
  today: readonly RecentRow[],
  latestGame: string | null,
  goodBitsOf: (id: number) => number,
): SessionSection | null {
  if (!latestGame) return null;
  const played = newestFirst(today.filter((row) => row.game === latestGame));
  if (played.length === 0) return null;
  return {
    game: gameSlug(latestGame),
    clipIds: played.slice(0, SECTION_CLIP_CAP).map((row) => row.id),
    count: played.length,
    goodBits: played.reduce((sum, row) => sum + goodBitsOf(row.id), 0),
  };
}

export function weekOf(rows: readonly RecentRow[]): WeekSection {
  const perGame = new Map<string, number>();
  for (const row of rows) perGame.set(row.game, (perGame.get(row.game) ?? 0) + 1);
  const games = [...perGame.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, WEEK_GAME_CAP)
    .map(([name, count]): [string, number] => [gameSlug(name), count]);
  return { ...totalOf(rows), games };
}

/** The "saving" rule: a raw watch event is believed for this long without a receipt. */
export function savingActive(since: number | null, now: number, fallbackMs: number): boolean {
  return since !== null && now - since < fallbackMs;
}
