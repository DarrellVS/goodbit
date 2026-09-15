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
import { mkdirSync, readdirSync } from 'node:fs';
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

export function incomingDir(): string {
  return join(VIDEOS_ROOT, INCOMING_DIR_NAME);
}

/** Created eagerly: OBS refuses to start a replay buffer pointed at nothing. */
export function ensureIncomingDir(): string {
  const dir = incomingDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function ingest(filePath: string): Promise<void> {
  try {
    await new IngestReplayAction().execute({ filePath });
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

  console.log(`[capture] watching ${dir}`);
}

export async function stopWatchingIncoming(): Promise<void> {
  await watcher?.close();
  watcher = null;
}
