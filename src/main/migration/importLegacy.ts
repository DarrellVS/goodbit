import { copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';
import { backupsDir, databasePath, loadSettings, saveSettings } from '../settings.js';

/**
 * Adopt the database the web app left behind.
 *
 * **This is not part of a public build.** `__LEGACY_IMPORT__` is defined false
 * in the release config, so the bundler drops every call to this as dead code;
 * it exists for the one machine that ran the self-hosted version. It also
 * requires an actual legacy database to be present, which nobody else will have.
 *
 * Nothing is moved or deleted. The old file stays exactly where it is, so the
 * web app keeps working and going back is just running it again.
 */

const TABLES = ['clip', 'tag', 'collection', 'game', 'project', 'tag_pattern'];

export interface ImportReport {
  imported: boolean;
  reason?: string;
  from?: string;
  backup?: string;
  rows?: Record<string, number | null>;
}

function open(path: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path, sqlite3.OPEN_READONLY, (err) =>
      err ? reject(err) : resolve(db),
    );
  });
}

function all<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as T[]))),
  );
}

function run(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => db.run(sql, (err) => (err ? reject(err) : resolve())));
}

function close(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

async function countRows(db: sqlite3.Database): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {};
  for (const table of TABLES) {
    try {
      const [row] = await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "${table}"`);
      counts[table] = row.n;
    } catch {
      // A table the old schema never had is not an error.
      counts[table] = null;
    }
  }
  return counts;
}

/**
 * Look for a legacy database beside the clips and adopt it.
 *
 * Runs before the data source opens, because it writes the file the data
 * source is about to read.
 */
export async function importLegacyDatabase(): Promise<ImportReport> {
  const settings = loadSettings();

  if (settings.migratedFromWebApp) return { imported: false, reason: 'already migrated' };
  if (!settings.videosRoot) return { imported: false, reason: 'no videos folder set yet' };

  const legacy = join(settings.videosRoot, 'filmpje.db');
  if (!existsSync(legacy)) return { imported: false, reason: 'no legacy database found' };

  const target = databasePath();
  if (existsSync(target) && statSync(target).size > 0) {
    // Never write over a library that is already in use here.
    return { imported: false, reason: 'this install already has a database' };
  }

  // Snapshot first, through SQLite itself rather than by copying the file:
  // the web app may still be running and holding it open.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = join(backupsDir(), `legacy-${stamp}.db`);

  const source = await open(legacy);
  const before = await countRows(source);
  await run(source, `VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  await close(source);

  // The verified snapshot becomes the new library, so what opens here is known
  // to be intact rather than whatever state the live file was in.
  copyFileSync(backup, target);

  const adopted = await open(target);
  const [{ integrity_check: integrity }] = await all<{ integrity_check: string }>(
    adopted,
    'PRAGMA integrity_check',
  );
  const after = await countRows(adopted);
  await close(adopted);

  const mismatched = TABLES.filter((t) => before[t] !== after[t]);
  if (integrity !== 'ok' || mismatched.length > 0) {
    return {
      imported: false,
      reason: `snapshot did not verify (integrity ${integrity}, mismatched: ${mismatched.join(', ')})`,
      from: legacy,
      backup,
    };
  }

  saveSettings({ migratedFromWebApp: true });

  console.log(`[migration] adopted ${legacy}`);
  for (const table of TABLES) {
    if (after[table] !== null) console.log(`[migration]   ${table}: ${after[table]}`);
  }

  return { imported: true, from: legacy, backup, rows: after };
}
