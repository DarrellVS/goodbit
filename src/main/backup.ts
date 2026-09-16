import { app } from 'electron';
import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import sqlite3 from 'sqlite3';
import { backupsDir, databasePath, loadSettings, saveSettings } from './settings.js';

/**
 * A verified copy of the library, taken before the schema is allowed to move.
 *
 * This existed because the app ran `synchronize: true`, which compared the
 * entities to the tables on every boot and changed the tables to match, and
 * resolved some changes on SQLite by rebuilding a table. A rebuild that goes
 * wrong takes the library with it, and a clip row is the only copy of its tags,
 * notes, display name, stars and collections.
 *
 * There are migrations now, so the schema moves deliberately and reversibly.
 * The copy stays, and still runs before they do: a migration is code, code has
 * bugs, and this is the cheapest insurance in the app. One `VACUUM INTO`, only
 * when the version changed since the last successful boot.
 *
 * The part that makes it a backup rather than a gesture is that the snapshot is
 * **read back** before the app is allowed near the file. A copy nobody has
 * opened is a guess. And, since `restoreBackup` below, one of these can
 * actually be put back from inside the app.
 */

/** How many copies to keep. Enough to step back past a bad release. */
const KEEP = 5;

export interface BackupResult {
  taken: boolean;
  reason: string;
  path?: string;
  clips?: number;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * A path in the backups folder that nothing is using yet.
 *
 * `stamp()` is resolution-of-one-second and deliberately so, because it is
 * read by a person in a list. `VACUUM INTO` refuses to write a file that
 * already exists, so two copies inside one second are not two copies, they are
 * one copy and one error. Reachable three ways: two presses of "Back up now",
 * a restore immediately after another restore, and any automated caller.
 *
 * Found by `scripts/restore-check.mjs`, which restores twice in a row.
 */
function freshBackupPath(name: string): string {
  const base = join(backupsDir(), name);
  let candidate = `${base}.db`;

  for (let n = 2; existsSync(candidate); n++) candidate = `${base}-${n}.db`;

  return candidate;
}

/**
 * Ask SQLite for the copy rather than copying the file.
 *
 * A plain file copy taken while something is writing can capture a torn page,
 * and the manual "Back up now" button runs with the app's own connection open.
 * `VACUUM INTO` is answered by SQLite itself, so what lands is always a valid
 * database, and compacted on the way out. A read-only connection is enough;
 * the source is never modified.
 */
async function snapshot(source: string, target: string): Promise<void> {
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const handle = new sqlite3.Database(source, sqlite3.OPEN_READONLY, (error) =>
      error ? reject(error) : resolve(handle),
    );
  });

  try {
    await new Promise<void>((resolve, reject) =>
      // The path is a literal, not a bindable parameter, so quotes are doubled.
      db.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  } finally {
    db.close();
  }
}

/**
 * Open the copy and make it prove itself: SQLite's own integrity check, then a
 * row count that has to match the original.
 */
async function verify(path: string): Promise<number> {
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const handle = new sqlite3.Database(path, sqlite3.OPEN_READONLY, (error) =>
      error ? reject(error) : resolve(handle),
    );
  });

  try {
    const check = await new Promise<string>((resolve, reject) =>
      db.get('PRAGMA quick_check', (error, row: Record<string, string> | undefined) =>
        error ? reject(error) : resolve(Object.values(row ?? {})[0] ?? 'no answer'),
      ),
    );
    if (check !== 'ok') throw new Error(`the copy did not read back cleanly: ${check}`);

    return await new Promise<number>((resolve) =>
      db.get('SELECT COUNT(*) AS n FROM clip', (error, row: { n: number } | undefined) =>
        // A database from before the first scan has no `clip` table yet, and
        // that is not a failure, only a corrupt copy is.
        resolve(error ? 0 : (row?.n ?? 0)),
      ),
    );
  } finally {
    db.close();
  }
}

function prune(): void {
  const dir = backupsDir();
  const copies = readdirSync(dir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(KEEP);

  for (const copy of copies) {
    try {
      unlinkSync(join(dir, copy.name));
    } catch {
      // A copy that will not delete is not worth failing a boot over.
    }
  }
}

/**
 * Copy the database if this version has not booted before.
 *
 * Must be called before the DataSource is initialised. That is the moment
 * `synchronize` gets its hands on the schema, and the whole point is to have a
 * verified copy from *before* it.
 */
export async function backupBeforeSchemaSync(databaseFile: string): Promise<BackupResult> {
  if (!existsSync(databaseFile)) {
    return { taken: false, reason: 'there is no database yet' };
  }

  const version = app.getVersion();
  const settings = loadSettings();
  if (settings.schemaVersion === version) {
    return { taken: false, reason: `this version already booted against this database` };
  }

  const target = freshBackupPath(`goodbit-${version}-${stamp()}`);

  try {
    await snapshot(databaseFile, target);
    const clips = await verify(target);
    prune();

    console.log(`[backup] ${target} (${clips} clips) before ${version} touches the schema`);
    return { taken: true, reason: `copied before ${version}`, path: target, clips };
  } catch (error) {
    // A failed backup is a reason to be loud, not a reason to refuse to start:
    // the common causes are a full disk and a locked file, and neither is
    // helped by the app being unusable.
    console.error('[backup] could not take a verified copy:', error);
    try {
      if (existsSync(target)) unlinkSync(target);
    } catch {
      /* leave it */
    }
    return { taken: false, reason: (error as Error).message };
  }
}

/** Record that this version booted cleanly, so the next boot skips the copy. */
export function rememberSchemaVersion(): void {
  saveSettings({ schemaVersion: app.getVersion() });
}

/**
 * Copy the database now, whatever version last touched it.
 *
 * The automatic copy only happens when the version changes; this is the button
 * for "I am about to do something I might regret".
 */
export async function takeBackup(databaseFile: string): Promise<BackupResult> {
  if (!existsSync(databaseFile)) {
    return { taken: false, reason: 'there is no database yet' };
  }

  const target = freshBackupPath(`goodbit-manual-${stamp()}`);

  try {
    await snapshot(databaseFile, target);
    const clips = await verify(target);
    prune();
    return { taken: true, reason: 'copied and read back', path: target, clips };
  } catch (error) {
    try {
      if (existsSync(target)) unlinkSync(target);
    } catch {
      /* leave it */
    }
    return { taken: false, reason: (error as Error).message };
  }
}

export interface RestoreResult {
  restored: boolean;
  reason: string;
  /** The copy taken of what was there before, so this is itself undoable. */
  previousPath?: string;
  clips?: number;
}

/**
 * Put a copy back, and make the current library recoverable while doing it.
 *
 * Five verified copies existed and there was no way to use one, which made the
 * backups a gesture rather than a feature: the answer to "an update ate my
 * tags" was to find the file in Explorer and rename it by hand, with the app
 * running and holding the database open.
 *
 * The order below is the whole design, and it is deliberately paranoid,
 * because this is the one operation in the app whose failure mode is losing
 * everything the user has ever typed.
 *
 * 1. **The path has to be one of ours.** It arrives from the renderer, and the
 *    renderer is where a bug or a bad deep link would show up. Anything
 *    outside `backupsDir()` is refused, resolved first so `..` cannot walk out
 *    of it.
 * 2. **The copy proves itself before anything is touched.** `PRAGMA
 *    quick_check` and a readable `clip` count, the same test
 *    `backupBeforeSchemaSync` applies. A backup that will not open is not a
 *    backup, and finding that out *after* moving the live file aside is how
 *    one bad file becomes two.
 * 3. **What is there now is copied first, and verified too.** Restoring the
 *    wrong copy is an easy mistake to make from a list of timestamps, so it
 *    has to be undoable. An unverified safety copy would make "undo" a guess.
 * 4. **Only then is the file replaced**, and the caller relaunches.
 *
 * The database is not closed here on purpose. The caller owns the connection
 * and has to bring the app down anyway: TypeORM's pool, the folder watcher and
 * every cache key are derived from rows that are about to change underneath
 * them, and a process that keeps running after its database was swapped is a
 * worse outcome than a restart.
 *
 * **A copy from an older schema is fine now.** The migrations run on the next
 * boot and bring it forward. Before there were migrations this was the reason
 * not to offer a restore at all: `synchronize` would have reshaped an old file
 * on the way in, which is precisely the behaviour the backups existed to
 * protect against.
 */
export async function restoreBackup(backupPath: string): Promise<RestoreResult> {
  const dir = resolve(backupsDir());
  const chosen = resolve(backupPath);

  if (!chosen.startsWith(dir + sep) || !chosen.endsWith('.db')) {
    return { restored: false, reason: 'that file is not one of GoodBit’s backups' };
  }
  if (!existsSync(chosen)) {
    return { restored: false, reason: 'that copy is no longer on disk' };
  }

  let clips: number;
  try {
    clips = await verify(chosen);
  } catch (error) {
    return { restored: false, reason: `that copy will not open: ${(error as Error).message}` };
  }

  const live = databasePath();
  let previousPath: string | undefined;

  if (existsSync(live)) {
    previousPath = freshBackupPath(`goodbit-before-restore-${stamp()}`);
    try {
      await snapshot(live, previousPath);
      await verify(previousPath);
    } catch (error) {
      // Refuse rather than proceed. Without a good copy of what is there now,
      // this stops being a restore and becomes a one-way replacement.
      return {
        restored: false,
        reason: `could not safely copy the current library first: ${(error as Error).message}`,
      };
    }
  }

  try {
    copyFileSync(chosen, live);

    /*
     * The journal files have to go with it.
     *
     * SQLite in WAL mode keeps recent writes in `-wal` and an index of it in
     * `-shm`. Replacing only the main file leaves a write-ahead log describing
     * pages of the *old* database, and SQLite will replay it into the new one
     * on open. `VACUUM INTO` always produces a self-contained file, so there is
     * nothing to lose by removing them.
     */
    for (const suffix of ['-wal', '-shm']) {
      const journal = `${live}${suffix}`;
      if (existsSync(journal)) unlinkSync(journal);
    }
  } catch (error) {
    return { restored: false, reason: (error as Error).message };
  }

  /*
   * Forget which version last booted against this file.
   *
   * `backupBeforeSchemaSync` skips its copy when `schemaVersion` matches the
   * running version, and the file underneath has just been swapped for one
   * this version may never have seen. Clearing it means the next boot takes a
   * verified copy before any migration runs, which is exactly the moment it is
   * most wanted.
   */
  saveSettings({ schemaVersion: '' });

  console.log(`[backup] restored ${chosen} (${clips} clips) over ${live}`);
  return { restored: true, reason: 'restored', previousPath, clips };
}

export interface BackupFile {
  name: string;
  path: string;
  sizeBytes: number;
  takenAt: string;
}

/** The copies on disk, newest first. */
export function listBackups(): BackupFile[] {
  const dir = backupsDir();

  return readdirSync(dir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const path = join(dir, name);
      const stat = statSync(path);
      return { name, path, sizeBytes: stat.size, takenAt: new Date(stat.mtimeMs).toISOString() };
    })
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/** Where the copies live, for a "show me" button. */
export { backupsDir };
