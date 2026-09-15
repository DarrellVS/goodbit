/**
 * Moving the whole library somewhere else, clips and all.
 *
 * Pointing the clips folder at a new path has always been allowed, and it has
 * always meant "look over there instead": the old clips stayed where they were
 * and dropped out of the library. That is right for somebody correcting a
 * wrong path and useless for somebody who wants their clips in `Videos/Clips`
 * rather than loose in `Videos`.
 *
 * This is the other operation, and it is the dangerous one. Four things make
 * it dangerous and each is handled below rather than hoped about.
 *
 * **`filePath` is the clip's identity.** It is the unique column, and a row
 * carries the only copy of its tags, notes, display name, collections and
 * stars. Move files without rewriting rows and the next scan sees every file
 * missing and every file new.
 *
 * **A scan during the move is worse than a scan after it.** The prune guard
 * refuses to delete when more than half the library has gone, which is exactly
 * what it looks like at the *end* of a move. Partway through, only a few
 * folders have moved, the guard is satisfied, and it deletes those rows with
 * everything on them. So the library is suspended for the duration, and each
 * folder's rows are repointed the moment that folder lands.
 *
 * **Timestamps are data.** `recordedAt` is taken from a clip's mtime when it is
 * first indexed and `fileModifiedAt` is what invalidates the analysis cache and
 * the `?v=` on every media URL. A copy that restamps them would refile old
 * clips under today and re-derive every thumbnail.
 *
 * **The destination can be inside the source.** `Videos` into `Videos/Clips` is
 * the case this was built for, and it means creating the destination inside the
 * directory being walked.
 */
import { existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs';
import { cp, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT, refreshRoots } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { saveSettings } from '../settings.js';
import { CACHE_DIR_NAME } from '../services/cachePaths.js';
import { INCOMING_DIR_NAME } from '../services/capture/incoming.js';
import { completeJob, createJob, failJob, setJobProgress } from '../services/jobs.js';
import { resumeLibrary, suspendLibrary } from '../startup.js';

export interface MoveLibraryInput {
  destination: string;
  /** Move what is already there, or only look somewhere else from now on. */
  moveExisting: boolean;
}

export interface MoveLibraryOutput {
  jobId: string;
}

/**
 * A path spelled the way the library spells it.
 *
 * The scan stores what fast-glob returns, which uses forward slashes on
 * Windows too. Anything else writing a `filePath` has to match, or the row and
 * the file stop describing each other.
 */
function libraryPath(value: string): string {
  return value.split(path.sep).join('/');
}

/** Folders that belong to the app rather than to a game. */
function isOurs(name: string): boolean {
  return name.startsWith('.');
}

/** Windows compares paths without case, and `Videos` to `videos` is a real rename. */
function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isInside(parent: string, child: string): boolean {
  const base = path.resolve(parent) + path.sep;
  const target = path.resolve(child) + path.sep;
  return process.platform === 'win32'
    ? target.toLowerCase().startsWith(base.toLowerCase())
    : target.startsWith(base);
}

/**
 * What would go wrong, said before anything moves.
 *
 * Exported so the settings screen can warn rather than letting somebody start
 * a job that fails halfway through a library.
 */
export function whyNotMove(from: string, to: string): string | null {
  if (!from) return 'There is no clips folder set yet.';
  if (!to) return 'Pick a folder first.';
  if (samePath(from, to)) return 'That is already the clips folder.';

  if (existsSync(to) && !statSync(to).isDirectory()) {
    return 'That path is a file, not a folder.';
  }

  /*
   * A destination inside a game folder would move that folder into itself.
   * One level down is the useful case (`Videos` into `Videos/Clips`) and
   * anything deeper is somebody about to lose an afternoon.
   */
  if (isInside(from, to) && path.dirname(path.resolve(to)) !== path.resolve(from)) {
    return 'Pick a folder directly inside the current one, or one outside it entirely.';
  }

  return null;
}

export class MoveLibraryAction extends BaseAction<MoveLibraryInput, MoveLibraryOutput> {
  async execute({ destination, moveExisting }: MoveLibraryInput): Promise<MoveLibraryOutput> {
    const from = VIDEOS_ROOT;
    const to = path.resolve(destination);

    const problem = whyNotMove(from, to);
    if (problem) throw new Error(problem);

    /*
     * Never while OBS is open, and this is a harder rule than the config one.
     *
     * OBS holds the replay buffer in memory and writes it into the staging
     * folder the moment the key is pressed. A save that lands in the old
     * staging folder after that folder has been walked is a clip this move
     * will not carry over, and one that lands *during* a folder's move is a
     * file being written to while it is being copied. On top of that, OBS
     * rewrites its own config from memory at exit, so repointing it at the new
     * folder underneath a running instance is discarded.
     */
    const { obsIsRunning } = await import('../services/obs/paths.js');
    if (await obsIsRunning()) {
      throw new Error('OBS is open. Close it first, then move your clips.');
    }

    const job = createJob(
      'import',
      moveExisting ? 'Moving your clips' : 'Changing the clips folder',
    );

    // Not awaited: a library move is minutes, and a handler that waits for it
    // is a window that has stopped answering.
    void this.run(job.id, from, to, moveExisting).catch((error) => {
      failJob(job.id, error instanceof Error ? error.message : String(error));
      void resumeLibrary();
    });

    return { jobId: job.id };
  }

  private async run(jobId: string, from: string, to: string, moveExisting: boolean): Promise<void> {
    mkdirSync(to, { recursive: true });

    if (moveExisting) {
      /*
       * Across drives this is a copy, and a copy that runs out of room stops
       * halfway through somebody's library. Checking costs a directory walk of
       * metadata only, which is nothing against the alternative.
       *
       * Same drive is a rename and needs no space at all, so the check is
       * skipped rather than failing somebody with a full disk and a move that
       * would not have touched it.
       */
      if (path.parse(path.resolve(from)).root !== path.parse(to).root) {
        setJobProgress(jobId, 0, 'Checking there is room');
        const needed = sizeOf(from);
        const { bsize, bavail } = await statfs(to);
        const free = bsize * bavail;

        if (needed > free) {
          throw new Error(
            `Your clips need ${gb(needed)} and that drive has ${gb(free)} free. ` +
              'Nothing has been moved.',
          );
        }
      }

      // Deaf for the duration. See the note at the top of the file.
      await suspendLibrary();

      const folders = readdirSync(from, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !isOurs(entry.name))
        // The destination itself, when it sits inside the folder being moved.
        .filter((entry) => !samePath(path.join(from, entry.name), to))
        .map((entry) => entry.name);

      for (const [index, folder] of folders.entries()) {
        setJobProgress(jobId, (index / Math.max(folders.length, 1)) * 0.9, `Moving ${folder}`);

        await move(path.join(from, folder), path.join(to, folder));

        // Immediately, not at the end. A crash between the two leaves rows
        // pointing at files that are not there, which the next scan reads as
        // a deletion.
        await repoint(path.join(from, folder), path.join(to, folder));
      }

      // The derived caches sit beside the clips because they belong with the
      // media. Regenerable, but regenerating thumbnails for a whole library is
      // minutes of the machine doing something it already did.
      setJobProgress(jobId, 0.92, 'Bringing the thumbnails along');
      const cache = path.join(from, CACHE_DIR_NAME);
      if (existsSync(cache) && !samePath(cache, path.join(to, CACHE_DIR_NAME))) {
        await move(cache, path.join(to, CACHE_DIR_NAME)).catch(() => {
          // A cache that will not move is rebuilt, which is what it is for.
        });
      }
    }

    setJobProgress(jobId, 0.95, 'Pointing OBS at the new folder');
    saveSettings({ videosRoot: to });
    refreshRoots();

    await repointObs(to);

    // Watch the new root, and scan once now that files and rows agree.
    await resumeLibrary();

    completeJob(jobId);
    console.log(`[library] clips folder is now ${to}`);
  }
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Metadata only: every file's size, without reading a byte of any of them. */
function sizeOf(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isOurs(entry.name)) continue;
    const full = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? sizeOf(full) : statSync(full).size;
    } catch {
      // A file that cannot be read is a file that cannot be moved either, and
      // it will say so then.
    }
  }
  return total;
}

/** A rename when the volume allows it, a copy when it does not. */
async function move(from: string, to: string): Promise<void> {
  if (existsSync(to)) {
    // Merge rather than fail: a folder of the same name at the destination is
    // the same game, and stopping halfway is worse than merging.
    for (const entry of readdirSync(from)) {
      await move(path.join(from, entry), path.join(to, entry));
    }
    await rm(from, { recursive: true, force: true }).catch(() => {});
    return;
  }

  mkdirSync(path.dirname(to), { recursive: true });

  try {
    // Same volume: instant, atomic, and every timestamp is untouched.
    renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;

    /*
     * `preserveTimestamps` is the correctness of the whole operation, not a
     * nicety. A plain copy stamps each file with the moment it was copied:
     * `recordedAt` is read from the mtime the first time a clip is indexed, so
     * anything not yet indexed would refile itself under today, and
     * `fileModifiedAt` drives the analysis cache and the `?v=` on every media
     * URL, so the library would re-analyse and re-thumbnail itself entirely.
     */
    await cp(from, to, { recursive: true, preserveTimestamps: true });

    /*
     * The copy is the move; removing the original is tidying up.
     *
     * A source folder Windows will not let go of must not take the rest of the
     * library with it. The clip is already at its destination and the row
     * already points there, so the worst case of a failed delete is a stale
     * folder the user can remove themselves, and the worst case of waiting for
     * it is a move that stops halfway through with no way to tell why.
     */
    await withTimeout(rm(from, { recursive: true, force: true }), 30_000).catch((error) => {
      console.warn(
        `[library] copied ${from} but could not remove the original:`,
        error instanceof Error ? error.message : error,
      );
    });
  }
}

/** Never let one filesystem call hang a job that is holding the whole library. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * The rows follow the files, one folder at a time.
 *
 * `update` rather than `save`. The clips are loaded without their relations,
 * and handing TypeORM an entity whose `tags` it cannot see, on a relation
 * declared `cascade: ['insert']` with a join table, is not a risk worth taking
 * to change one column. This writes `filePath` and touches nothing else.
 */
async function repoint(from: string, to: string): Promise<void> {
  const repo = AppDataSource.getRepository(Clip);
  const prefix = path.resolve(from) + path.sep;

  const clips = await repo.find();
  let moved = 0;

  for (const clip of clips) {
    const current = path.resolve(clip.filePath);
    const inside = process.platform === 'win32'
      ? current.toLowerCase().startsWith(prefix.toLowerCase())
      : current.startsWith(prefix);
    if (!inside) continue;

    /*
     * Written the way the scan writes it, forward slashes and all.
     *
     * `path.join` gives `D:\Clips\Game\clip.mp4`; fast-glob, which is what
     * `ScanAndSyncClipsAction` stores, gives `D:/Clips/Game/clip.mp4`. Writing
     * the first meant the next scan matched none of these rows: it read every
     * clip as missing and every file as new, inserted a duplicate row for each
     * one and then deleted the original, and a deleted row takes its tags,
     * notes, stars and collections with it.
     */
    await repo.update(clip.id, {
      filePath: libraryPath(path.join(to, current.slice(prefix.length))),
    });
    moved += 1;
  }

  if (moved > 0) console.log(`[library] ${moved} clip(s) kept their tags and stars`);
}

async function repointObs(root: string): Promise<void> {
  try {
    const { obsIsRunning, profilesDir } = await import('../services/obs/paths.js');
    if (await obsIsRunning()) {
      console.warn('[library] OBS is running, so it still records into the old folder');
      return;
    }

    const { GOODBIT_PROFILE } = await import('../services/obs/setup.js');
    const { applyIniEdits } = await import('../services/obs/ini.js');

    const file = path.join(profilesDir(), GOODBIT_PROFILE, 'basic.ini');
    if (!existsSync(file)) return;

    // OBS stores a Windows path with its backslashes doubled.
    applyIniEdits(file, [
      {
        section: 'SimpleOutput',
        key: 'FilePath',
        value: path.join(root, INCOMING_DIR_NAME).replace(/\\/g, '\\\\'),
      },
    ]);
    console.log('[library] OBS now records into the new folder');
  } catch (error) {
    // A library that moved and an OBS that did not is recoverable from the
    // Recording screen, which already reports a path mismatch in a sentence.
    console.warn(
      '[library] could not repoint OBS:',
      error instanceof Error ? error.message : error,
    );
  }
}
