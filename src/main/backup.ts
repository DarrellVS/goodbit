import { app } from 'electron';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';
import { backupsDir, loadSettings, saveSettings } from './settings.js';

/**
 * A verified copy of the library, taken before the schema is allowed to move.
 *
 * The app runs TypeORM with `synchronize: true` and no migrations: on every
 * boot it compares the entities to the tables and changes the tables to match.
 * That is fine while the entities only gain columns, and on SQLite it is not
 * fine at all when a column changes type or goes away — the resolution is a
 * table rebuild, and a rebuild that goes wrong takes the library with it.
 *
 * Migrations are the real answer and are not what 1.0 ships. What it ships
 * instead is this: SQLite is asked for a snapshot and the snapshot is *read
 * back* before any version that could carry a schema change is allowed near
 * the file. A backup nobody has opened is a guess, not a backup.
 *
 * Cheap by construction — one `VACUUM INTO`, only when the app version changed
 * since the last successful boot.
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
 * Ask SQLite for the copy rather than copying the file.
 *
 * A plain file copy taken while something is writing can capture a torn page,
 * and the manual "Back up now" button runs with the app's own connection open.
 * `VACUUM INTO` is answered by SQLite itself, so what lands is always a valid
 * database — and compacted on the way out. A read-only connection is enough;
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
        // that is not a failure — only a corrupt copy is.
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
 * Must be called before the DataSource is initialised — that is the moment
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

  const target = join(backupsDir(), `goodbit-${version}-${stamp()}.db`);

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

  const target = join(backupsDir(), `goodbit-manual-${stamp()}.db`);

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
