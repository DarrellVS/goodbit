import { basename, relative, sep } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { VIDEOS_ROOT } from './data-source.js';
import { loadSettings } from './settings.js';
import { videoService } from './services/videoService.js';
import { SyncGamesAction } from './actions/SyncGamesAction.js';
import { SyncClipCreationDatesAction } from './actions/SyncClipCreationDatesAction.js';
import { SyncPublishedClipsMetadataAction } from './actions/SyncPublishedClipsMetadataAction.js';
import { SyncPublisherAction } from './actions/SyncPublisherAction.js';
import { cleanupEmptyFolders } from './utils/cleanupEmptyFolders.js';
import { CACHE_DIR_NAME, migrateLegacyCacheDir } from './services/cachePaths.js';

/**
 * What the background service does, and keeps doing.
 *
 * The web app ran a fixed sequence once at boot and then never looked again
 * until someone pressed Rescan. A service that is always running should notice
 * a clip the moment OBS finishes writing it, so the reconciliation sweep is now
 * the backstop rather than the only mechanism.
 */

const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv)$/i;

/**
 * How long a file has to stop growing before it counts as finished.
 *
 * Not optional. OBS writes for the length of the recording, and indexing a file
 * mid-write reads a garbage duration and grabs a black first frame.
 */
const WRITE_SETTLE_MS = 4000;

/** Filesystem events are a hint, not a guarantee; sweep occasionally regardless. */
const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let watcher: FSWatcher | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let listeners: Array<(event: ServiceEvent) => void> = [];

export type ServiceEvent =
  | { type: 'scan-started' }
  | { type: 'scan-finished'; added: number; updated: number; removed: number; total: number }
  | { type: 'clip-added'; filePath: string; game: string }
  | { type: 'clip-removed'; filePath: string }
  /**
   * Publishing a clip takes as long as it takes to squeeze two hundred
   * megabytes and push them up a home connection — a minute is normal. Saying
   * nothing for a minute reads as broken, so it says where it is.
   */
  | {
      type: 'publish-progress';
      clipId: number;
      name: string;
      stage: 'compressing' | 'uploading' | 'done' | 'failed';
      /** 0-100 within the current stage. */
      percent: number;
      message?: string;
    };

/**
 * Push an event to whatever is listening.
 *
 * Exported so work that lives outside this file — publishing, which is an
 * action — can report on itself without the window having to poll for it.
 */
export function announce(event: ServiceEvent): void {
  emit(event);
}

export function onServiceEvent(listener: (event: ServiceEvent) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emit(event: ServiceEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('[service] listener threw:', error);
    }
  }
}

/** The top-level folder name is the game name — OBS's doing, and the app follows it. */
function gameFromPath(filePath: string): string | null {
  const rel = relative(VIDEOS_ROOT, filePath);
  if (!rel || rel.startsWith('..')) return null;
  const parts = rel.split(sep);
  // Needs to be <root>/<Game>/<file>; a loose file at the root has no game.
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Bring the database in line with what is on disk.
 *
 * Wrapped rather than called directly so every entry point — boot, the watcher's
 * backstop, the Rescan button — reports the same way.
 */
export async function reconcile(): Promise<void> {
  emit({ type: 'scan-started' });
  try {
    const result = await videoService.scanAndSyncClips();
    emit({
      type: 'scan-finished',
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      total: result.total,
    });
    console.log(
      `[service] scan: +${result.added} ~${result.updated} -${result.removed} (${result.total} total)`,
    );
    if (result.pruneSkipped) {
      console.warn(`[service] ${result.pruneSkipped.reason} — nothing was deleted`);
    }
  } catch (error) {
    console.error('[service] scan failed:', error instanceof Error ? error.message : error);
  }
}

function startWatching(): void {
  if (watcher) return;
  const root = VIDEOS_ROOT;
  if (!root) return;

  watcher = chokidar.watch(root, {
    // Game folders sit one level down; nothing deeper is a clip.
    depth: 2,
    ignoreInitial: true,
    // The derived caches and the app's own output would otherwise loop.
    ignored: (path: string) =>
      basename(path).startsWith('.') || path.includes(`${sep}${CACHE_DIR_NAME}${sep}`),
    awaitWriteFinish: {
      stabilityThreshold: WRITE_SETTLE_MS,
      pollInterval: 500,
    },
  });

  watcher.on('add', (path: string) => {
    if (!VIDEO_EXTENSIONS.test(path)) return;
    const game = gameFromPath(path);
    if (!game) return;

    console.log(`[service] new clip in ${game}: ${basename(path)}`);
    emit({ type: 'clip-added', filePath: path, game });

    // Indexing one file is the scan's job; it already knows how to insert a
    // row, derive a thumbnail and leave everything else alone.
    void reconcile();
  });

  watcher.on('unlink', (path: string) => {
    if (!VIDEO_EXTENSIONS.test(path)) return;
    console.log(`[service] clip gone: ${basename(path)}`);
    emit({ type: 'clip-removed', filePath: path });
    void reconcile();
  });

  watcher.on('error', (error: unknown) => {
    console.error('[service] watcher error:', error);
  });

  console.log(`[service] watching ${root}`);
}

/**
 * The boot sequence, each step isolated.
 *
 * One failing step must not stop the rest — a clip library that cannot reach
 * the publisher is still a working clip library.
 */
export async function startServices(): Promise<void> {
  // The app used to be called Filmpje; its cache folder is carried over rather
  // than regenerated.
  migrateLegacyCacheDir();

  const steps: Array<[string, () => Promise<unknown>]> = [
    ['folder cleanup', () => cleanupEmptyFolders(VIDEOS_ROOT)],
    ['scan', () => reconcile()],
    ['games sync', () => new SyncGamesAction().execute()],
    ['creation dates', () => new SyncClipCreationDatesAction().execute()],
  ];

  // Publishing is optional now: with no publisher configured these would fail
  // on every boot and log noise about a feature the user does not have.
  if (loadSettings().publisherBaseUrl) {
    steps.push(
      ['published metadata', () => new SyncPublishedClipsMetadataAction().execute()],
      ['publisher sync', () => new SyncPublisherAction().execute()],
    );
  }

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (error) {
      console.error(`[service] ${name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  startWatching();

  reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  console.log('[service] ready');
}

export function stopServices(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  void watcher?.close();
  watcher = null;
}

/** Restart the watcher after the videos folder is changed in Settings. */
export async function restartServices(): Promise<void> {
  stopServices();
  await startServices();
}
