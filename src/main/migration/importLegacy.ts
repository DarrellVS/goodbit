import { copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
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

/*
 * The four promise wrappers that used to live here are gone: this driver is
 * synchronous, so `open`, `all`, `run` and `close` were each a function whose
 * whole body existed to turn a callback into a promise, and they now say
 * nothing that the call itself does not.
 */
function countRows(db: SqliteDatabase): Record<string, number | null> {
  const counts: Record<string, number | null> = {};
  for (const table of TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
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

  const source = new Database(legacy, { readonly: true, fileMustExist: true });
  const before = countRows(source);
  source.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  source.close();

  // The verified snapshot becomes the new library, so what opens here is known
  // to be intact rather than whatever state the live file was in.
  copyFileSync(backup, target);

  const adopted = new Database(target, { fileMustExist: true });
  const integrity = String(adopted.pragma('integrity_check', { simple: true }) ?? 'no answer');
  const after = countRows(adopted);
  adopted.close();

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
