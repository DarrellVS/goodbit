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
import { startForegroundHistory } from './services/capture/foregroundHistory.js';
import { setSweepsPaused, watchGameSessions } from './services/capture/sessionWatch.js';
import {
  drainIncoming,
  onClipArriving,
  onClipFiled,
  stopWatchingIncoming,
  watchIncoming,
} from './services/capture/incoming.js';
import { isClipLayout, isVideoFile } from '@shared/constants/videoFiles.js';

/**
 * What the background service does, and keeps doing.
 *
 * The web app ran a fixed sequence once at boot and then never looked again
 * until someone pressed Rescan. A service that is always running should notice
 * a clip the moment OBS finishes writing it, so the reconciliation sweep is now
 * the backstop rather than the only mechanism.
 */

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
  /**
   * The clip is filed, indexed and openable. `clip-added` only says a file
   * appeared; this one carries the id, so anything acting on the clip has
   * something to act on.
   */
  | { type: 'clip-ready'; clipId: number; game: string; filePath: string }
  | { type: 'clip-removed'; filePath: string }
  /**
   * A clip has been read and this is what the analysis found in it.
   *
   * The sweep writes `suggestedCount` straight to the row, and a database the
   * window is not told about is a badge that appears on the next refresh and
   * not before. That is what it did: somebody closed a game, the sweep ran,
   * and the library went on showing cards with nothing on them until the page
   * was reloaded by hand.
   *
   * Carries the count rather than the clip, so the renderer patches the one
   * field on the row it already has. Refetching a page of fifty rows for each
   * of a dozen clips would be a list that flashes twelve times.
   */
  | { type: 'clip-analyzed'; clipId: number; suggestedCount: number }
  /**
   * Publishing a clip takes as long as it takes to squeeze two hundred
   * megabytes and push them up a home connection, a minute is normal. Saying
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
    }
  /**
   * The same problem as publishing. An exact cut re-encodes, which on a
   * 3440 wide recording is tens of seconds, and the button said "Trimming"
   * with a spinner and no idea how far along it was.
   */
  | {
      type: 'trim-progress';
      clipId: number;
      stage: 'cutting' | 'done' | 'failed';
      /** 0-100 through the cut. */
      percent: number;
    }
  /**
   * Fetching OBS, or the script that sorts clips into folders. An installer is
   * a hundred megabytes over whatever connection the user has, and the window
   * needs something to show other than a spinner.
   */
  | {
      type: 'obs-setup-progress';
      stage: 'downloading' | 'running' | 'done' | 'failed';
      /** 0-100 while downloading, absent otherwise. */
      percent?: number;
      message: string;
    };

/**
 * Push an event to whatever is listening.
 *
 * Exported so work that lives outside this file, publishing, which is an
 * action, can report on itself without the window having to poll for it.
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

/** The top-level folder name is the game name, OBS's doing, and the app follows it. */
function gameFromPath(filePath: string): string | null {
  const rel = relative(VIDEOS_ROOT, filePath);
  if (!rel || rel.startsWith('..')) return null;
  const parts = rel.split(sep);
  // Needs to be <root>/<Game>/<file>; a loose file at the root has no game.
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Whether the scan would actually index this path.
 *
 * The watcher and the scan disagreed about depth, and the watcher was the
 * deeper of the two: chokidar runs at `depth: 2` while
 * `ScanAndSyncClipsAction` globs one level down. So a file somebody dropped in
 * `<videosRoot>/<Game>/Old/clip.mp4` was announced as a new clip,
 * `clip-added` was emitted, the library refreshed, and the scan that followed
 * created nothing: a phantom the UI reacted to with nothing behind it. Worse,
 * had a row existed, the same scan would have counted it missing and deleted
 * it, taking its tags, notes, stars and marks.
 *
 * `isClipLayout` is the shared answer, so the two cannot come apart again.
 */
function scanWouldIndex(filePath: string): boolean {
  const rel = relative(VIDEOS_ROOT, filePath);
  if (!rel || rel.startsWith('..')) return false;
  return isClipLayout(rel);
}

/**
 * A clip GoodBit filed itself, indexed at once rather than in eight seconds.
 *
 * The library watcher would find this file eventually, behind another four
 * second `awaitWriteFinish`, on top of the four the staging watcher already
 * spent. That settle exists because "the file stopped growing" is the only
 * signal a watcher has while OBS is writing. It buys nothing here: the file
 * reached this path by an atomic same volume rename from our own staging
 * folder, so it was whole before it appeared.
 *
 * The toast waits for the row, not for the rename. "Saved" should mean the clip
 * is in the library and openable, which is the thing the user is actually
 * asking about when they press the key and then look at the screen.
 */
function clipWasFiled(filePath: string, game: string): void {
  void (async () => {
    emit({ type: 'clip-added', filePath, game });
    await reconcile();

    try {
      const { AppDataSource } = await import('./data-source.js');
      const { Clip } = await import('./entity/Clip.js');
      const { showClipSaved } = await import('./services/clipToast.js');

      const clip = await AppDataSource.getRepository(Clip)
        .createQueryBuilder('clip')
        .where("REPLACE(LOWER(clip.filePath), '\\', '/') = :key", {
          key: filePath.split('\\').join('/').toLowerCase(),
        })
        .getOne();

      // No row means the scan did not take it, and saying "saved" then would be
      // a lie. Silence is the honest answer; the log says why.
      if (!clip) {
        console.warn(`[capture] ${basename(filePath)} was filed but not indexed, no toast`);
        return;
      }

      emit({ type: 'clip-ready', clipId: clip.id, game, filePath });

      const length = clip.durationSec ? ` · ${formatLength(clip.durationSec)}` : '';
      await showClipSaved(`${game}${length}`);
    } catch (error) {
      console.error('[capture] could not announce the clip:', error);
    }
  })();
}

/** "0:30", which is how long a replay reads on every other screen in the app. */
function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

let detachFiled: (() => void) | null = null;

/** Registered once, however many times the services restart. */
function attachFiledListener(): void {
  if (detachFiled) return;
  detachFiled = onClipFiled(clipWasFiled);

  // The promise, as early as anything can know to make it. The receipt is
  // `clipWasFiled` above, and only it says "saved".
  onClipArriving(() => {
    void (async () => {
      const { showClipSaving } = await import('./services/clipToast.js');
      await showClipSaving();
    })();
  });
}

/**
 * Bring the database in line with what is on disk.
 *
 * Wrapped rather than called directly so every entry point, boot, the watcher's
 * backstop, the Rescan button, reports the same way.
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
      console.warn(`[service] ${result.pruneSkipped.reason}, nothing was deleted`);
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
    /*
     * One level deeper than a clip sits, deliberately.
     *
     * A game folder is one level down, so `depth: 1` would find every clip.
     * The extra level is what notices a *folder* appearing inside a game
     * folder, which is how a newly created `Exports` directory is seen at all,
     * and it costs one more level of inotify handles rather than a recursive
     * walk. What the watcher may announce is `scanWouldIndex`'s decision, not
     * this number's.
     */
    depth: 2,
    ignoreInitial: true,
    // The derived caches, the app's own working files, and anything a trim
    // left behind before those were hidden.
    ignored: (path: string) =>
      basename(path).startsWith('.') ||
      /\.tmp-\d+\.[a-z0-9]+$/i.test(basename(path)) ||
      path.includes(`${sep}${CACHE_DIR_NAME}${sep}`),
    awaitWriteFinish: {
      stabilityThreshold: WRITE_SETTLE_MS,
      pollInterval: 500,
    },
  });

  watcher.on('add', (path: string) => {
    if (!isVideoFile(path)) return;
    const game = gameFromPath(path);
    if (!game) return;
    // Announced only if the scan behind it will produce a row. See
    // `scanWouldIndex`: chokidar watches one level deeper than the scan globs,
    // so without this a file in a folder of somebody's own inside a game
    // folder is reported as a new clip that never appears.
    if (!scanWouldIndex(path)) return;

    console.log(`[service] new clip in ${game}: ${basename(path)}`);
    emit({ type: 'clip-added', filePath: path, game });

    // Indexing one file is the scan's job; it already knows how to insert a
    // row, derive a thumbnail and leave everything else alone.
    void reconcile();
  });

  watcher.on('unlink', (path: string) => {
    if (!isVideoFile(path)) return;
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
 * Start OBS, if that is what the user asked for.
 *
 * GoodBit is already a background service: registered at login, alive in the
 * tray, watching the folder. The program that fills that folder is the one
 * thing it was not starting, so a replay key pressed after a reboot saved
 * nothing until somebody remembered to open OBS.
 *
 * Minimised to the tray and with `--startreplaybuffer`, so the only visible
 * difference is that pressing the key works.
 */
async function startObsIfWanted(): Promise<void> {
  if (!loadSettings().startObsWithGoodbit) return;

  const { LaunchObsAction } = await import('./actions/LaunchObsAction.js');
  const result = await new LaunchObsAction().execute({
    startReplayBuffer: true,
    minimized: true,
  });

  console.log(
    result.alreadyRunning
      ? '[service] OBS is already running'
      : `[service] started OBS: ${result.args.join(' ')}`,
  );
}

/**
 * The boot sequence, each step isolated.
 *
 * One failing step must not stop the rest, a clip library that cannot reach
 * the publisher is still a working clip library.
 */
export async function startServices(): Promise<void> {
  // The app used to be called Filmpje; its cache folder is carried over rather
  // than regenerated.
  migrateLegacyCacheDir();

  /*
   * Watching starts before any of the work below, and that ordering is the
   * feature rather than a detail.
   *
   * It used to come last, after every boot step had finished. That was fine
   * while the steps were quick, and stopped being fine the moment one of them
   * had to compile a helper: a clip that OBS wrote during those few seconds
   * arrived before anything was listening, and nothing indexed it until the
   * next sweep minutes later. The clip somebody saved while the app was
   * starting is exactly the clip they are about to go looking for.
   *
   * Nothing is lost by starting early. chokidar is told to ignore what is
   * already there, so the scan below still owns the existing library, and a
   * file that arrives during the scan is now seen by both: the watcher queues
   * it and the scan is idempotent.
   */
  startWatching();
  watchIncoming();
  attachFiledListener();
  /*
   * Registered once, like the filed listener above, and for the same reason:
   * it hangs off the foreground sampler rather than off a service, so a
   * restart of the services must not leave two of them counting.
   */
  watchGameSessions();

  const steps: Array<[string, () => Promise<unknown>]> = [
    ['folder cleanup', () => cleanupEmptyFolders(VIDEOS_ROOT)],
    ['scan', () => reconcile()],
    ['games sync', () => new SyncGamesAction().execute()],
    ['creation dates', () => new SyncClipCreationDatesAction().execute()],
    /*
     * Not awaited. It compiles a helper the first time, and nothing else here
     * depends on it: a clip that lands before the first sample is named
     * Unsorted rather than making the rest of the boot wait.
     */
    ['foreground sampler', async () => void startForegroundHistory()],
    ['staging', () => drainIncoming()],
    // Built now so the first clip of the session does not wait for a window to
    // be constructed and a page to load before it hears anything.
    ['toast', async () => {
      const { warmClipToast } = await import('./services/clipToast.js');
      warmClipToast();
    }],
    // After the library is ready, because a clip that lands while this is
    // still scanning should find a watcher waiting for it.
    ['start OBS', () => startObsIfWanted()],
    // Last, and only if asked for. Nothing else waits on it.
    /*
     * Imported here rather than at the top.
     *
     * The MCP server pulls in the SDK and, through it, enough of the module
     * graph to change how the main bundle is split. A static import moved
     * TypeORM's connection options reader into the entry chunk, which has no
     * `__dirname`, and the app stopped loading before it drew a window. It is
     * optional and it starts last; a dynamic import keeps it out of the way.
     */
    ['mcp', async () => (await import('./services/mcp/server.js')).startMcp()],
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
  void stopWatchingIncoming();
}

/**
 * The same, but actually finished before the caller continues.
 *
 * `stopServices` fires both closes and returns, which is fine when the app is
 * quitting and fatal when something is about to move the folder being watched.
 * chokidar holds directory handles, and on Windows a held handle does not slow
 * a delete down, it blocks it: the move copied a folder to its destination and
 * then hung for ever trying to remove the source.
 */
export async function stopWatchers(): Promise<void> {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }

  const closing = watcher?.close();
  watcher = null;
  await Promise.allSettled([closing, stopWatchingIncoming()]);
}

/**
 * Hold everything that looks at the library, for an operation that moves it.
 *
 * Not a nicety. The watcher fires `unlink` for every clip a move takes away
 * and each one triggers a scan, and a scan that runs when only the first few
 * folders have moved sees a *minority* of clips missing, which is exactly the
 * case the prune guard is designed to allow: it deletes those rows, and a clip
 * row is the only copy of its tags, notes, stars and collections.
 *
 * So the library is deaf until the move has finished and the rows have caught
 * up with the files.
 */
export async function suspendLibrary(): Promise<void> {
  // Nothing may read the library while its files are being moved under it.
  setSweepsPaused(true);
  await stopWatchers();

  /*
   * A closed watcher is not the same as a released handle.
   *
   * chokidar resolves `close()` before Windows has finished tearing down the
   * `ReadDirectoryChangesW` handles underneath it, and a directory with a
   * handle still open cannot be deleted. A short settle is the difference
   * between a move that completes and one that stops halfway with the source
   * folder still on disk.
   */
  await new Promise((resolve) => setTimeout(resolve, 750));
  console.log('[service] library suspended');
}

/** Watch again, at whatever the root is now. */
export async function resumeLibrary(): Promise<void> {
  setSweepsPaused(false);
  startWatching();
  watchIncoming();
  reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  await reconcile();
  console.log('[service] library resumed');
}

/** Restart the watcher after the videos folder is changed in Settings. */
export async function restartServices(): Promise<void> {
  stopServices();
  await startServices();
}
