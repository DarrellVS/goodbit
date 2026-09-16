/**
 * Where OBS drops a replay before GoodBit knows whose it is.
 *
 * `<videosRoot>/.goodbit-incoming/`, and the location is a decision rather
 * than a convenience.
 *
 * **Inside the videos root**, so filing a clip is an `fs.rename` on one volume:
 * atomic, instant, and the file is never half present at its final path. The
 * obvious alternative, `%APPDATA%/GoodBit/incoming`, is a cross volume copy of
 * a few hundred megabytes for anybody whose library is on another drive, which
 * is most people with a games machine. `CheckObsSetupAction` already raises a
 * blocker when OBS records to a different drive than it sorts to, for this
 * exact reason.
 *
 * **Dot prefixed**, so the three things that sweep the videos root all leave it
 * alone. Two do so for free and were verified rather than assumed: the library
 * watcher ignores any path whose basename starts with a dot, and
 * `ScanAndSyncClipsAction` globs with `dot: false`. The third,
 * `cleanupEmptyFolders`, had to be taught, because an empty staging folder is
 * its normal resting state and it was being deleted on every boot, leaving OBS
 * pointed at a folder that no longer existed.
 *
 * It also matches the `.goodbit-trim-` and `.goodbit-bak-` files already on
 * disk, so somebody who opens the folder sees a convention rather than a
 * mystery.
 */
import { basename, join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, watch as fsWatch, type FSWatcher as NativeWatcher } from 'node:fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { VIDEOS_ROOT } from '../../data-source.js';
import { IngestReplayAction } from '../../actions/IngestReplayAction.js';

export const INCOMING_DIR_NAME = '.goodbit-incoming';

const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv)$/i;

/**
 * The same four seconds the library watcher waits, and for the same reason.
 *
 * OBS writes the replay in one go, but "the file stopped growing" is the only
 * signal either watcher has, and reading a file mid-write gives a garbage
 * duration and a black first frame.
 */
const WRITE_SETTLE_MS = 4000;

let watcher: FSWatcher | null = null;
/** The same folder, watched raw and with no settle, purely so the app can say a clip is coming. */
let eager: NativeWatcher | null = null;

export function incomingDir(): string {
  return join(VIDEOS_ROOT, INCOMING_DIR_NAME);
}

/** Created eagerly: OBS refuses to start a replay buffer pointed at nothing. */
export function ensureIncomingDir(): string {
  const dir = incomingDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Told about every clip this module files, with its final path.
 *
 * A callback rather than an import of `startup.ts`, which imports this module
 * and would make a cycle. It exists so the clip can be indexed the moment it
 * lands instead of waiting for the library watcher to notice it: that watcher
 * sits behind another four second settle, and the file got to its final path by
 * an atomic same volume rename, so it is complete the instant it appears.
 * Eight seconds of waiting for a file nobody is still writing is why a clip did
 * not show up when it was taken.
 */
let filedListeners: Array<(filePath: string, game: string) => void> = [];

/** Told the moment a replay appears, before anything is known about it. */
let arrivingListeners: Array<() => void> = [];

export function onClipArriving(listener: () => void): () => void {
  arrivingListeners.push(listener);
  return () => {
    arrivingListeners = arrivingListeners.filter((l) => l !== listener);
  };
}

export function onClipFiled(listener: (filePath: string, game: string) => void): () => void {
  filedListeners.push(listener);
  return () => {
    filedListeners = filedListeners.filter((l) => l !== listener);
  };
}

async function ingest(filePath: string): Promise<void> {
  try {
    const { movedTo, game } = await new IngestReplayAction().execute({ filePath });
    for (const listener of filedListeners) {
      try {
        listener(movedTo, game);
      } catch (error) {
        console.error('[capture] filed listener failed:', error);
      }
    }
  } catch (error) {
    // A clip that cannot be filed stays in staging rather than disappearing.
    // The next boot sweeps it, and the user still has the file.
    console.error(
      `[capture] could not file ${basename(filePath)}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Anything staging still holds, filed now.
 *
 * A crash between OBS writing and GoodBit moving leaves a clip here, and
 * without this it would sit in a hidden folder for ever. The foreground
 * history is empty this early, so these are named `Unsorted` unless the
 * executable happens to still be running, which is the honest answer.
 */
export async function drainIncoming(): Promise<void> {
  if (!VIDEOS_ROOT) return;
  ensureIncomingDir();

  let waiting: string[] = [];
  try {
    waiting = readdirSync(incomingDir()).filter((name) => VIDEO_EXTENSIONS.test(name));
  } catch {
    return;
  }

  for (const name of waiting) await ingest(join(incomingDir(), name));
  if (waiting.length > 0) console.log(`[capture] filed ${waiting.length} clip(s) left in staging`);
}

export function watchIncoming(): void {
  if (watcher || !VIDEOS_ROOT) return;
  const dir = ensureIncomingDir();

  watcher = chokidar.watch(dir, {
    depth: 0,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: WRITE_SETTLE_MS, pollInterval: 500 },
  });

  watcher.on('add', (filePath: string) => {
    if (!VIDEO_EXTENSIONS.test(filePath)) return;
    console.log(`[capture] a replay arrived: ${basename(filePath)}`);
    void ingest(filePath);
  });

  watcher.on('error', (error: unknown) => {
    console.error('[capture] staging watcher error:', error);
  });

  /*
   * A second watch on the same folder, raw, with no settle at all.
   *
   * The one above cannot announce anything: it waits four seconds for the file
   * to stop growing before it says a word, and those four seconds are most of
   * the wait the user is standing in. This one fires on the file appearing,
   * which is the earliest this process can know a clip is coming, and it does
   * nothing but say so. Reading the file is still the other watcher's job, for
   * the reason it has always been, a file read mid-write gives a garbage
   * duration and a black first frame.
   *
   * **`fs.watch` rather than chokidar, and that is the point.** chokidar is the
   * right tool for the library, where correctness across platforms and atomic
   * saves matters more than milliseconds, but it normalises events, stats every
   * path and holds an `atomic` window of its own, and the whole job here is to
   * be fast. `fs.watch` is `ReadDirectoryChangesW` with nothing on top, and it
   * fires as the file is created.
   *
   * `rename` covers creation and deletion both, and this folder sees plenty of
   * deletions, every clip leaves it by being renamed out. `seen` is what tells
   * the two apart without a stat on the hot path: a name that now exists and
   * was not there before is a new clip, anything else is bookkeeping.
   */
  const seen = new Set<string>();

  eager = fsWatch(dir, (_event, filename) => {
    if (!filename) return;
    const name = filename.toString();
    if (!VIDEO_EXTENSIONS.test(name)) return;

    if (!existsSync(join(dir, name))) {
      seen.delete(name);
      return;
    }
    if (seen.has(name)) return;
    seen.add(name);

    for (const listener of arrivingListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[capture] arriving listener failed:', error);
      }
    }
  });

  eager.on('error', (error: unknown) => {
    console.error('[capture] staging announce watcher error:', error);
  });

  console.log(`[capture] watching ${dir}`);
}

export async function stopWatchingIncoming(): Promise<void> {
  eager?.close();
  eager = null;
  await watcher?.close();
  watcher = null;
}
