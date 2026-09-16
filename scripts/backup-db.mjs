/**
 * Take a consistent snapshot of the library database.
 *
 * `VACUUM INTO` rather than a file copy: the database is normally open and
 * being written by the running app, and copying the file underneath a writer
 * can capture a torn page. VACUUM INTO asks SQLite itself for the snapshot, so
 * what lands is always a valid database, and it is compacted on the way out.
 *
 * Run before anything that touches the schema. The desktop app keeps its
 * database in %APPDATA%/GoodBit; this defaults there and still accepts a path
 * for a library left behind by the self-hosted version.
 *
 *   node scripts/backup-db.mjs [--db <file>] [--out <dir>]
 */
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';

const APPDATA = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');

const dbFlag = process.argv.indexOf('--db');
const DB_PATH =
  dbFlag !== -1 && process.argv[dbFlag + 1]
    ? process.argv[dbFlag + 1]
    : join(APPDATA, 'GoodBit', 'goodbit.db');

const outFlag = process.argv.indexOf('--out');
const OUT_DIR =
  outFlag !== -1 && process.argv[outFlag + 1]
    ? process.argv[outFlag + 1]
    : join(APPDATA, 'GoodBit', 'backups');

/** Tables worth counting, so the report says what was actually preserved. */
const TABLES = ['clip', 'tag', 'collection', 'game', 'project', 'tag_pattern'];

function countRows(db) {
  const counts = {};
  for (const table of TABLES) {
    try {
      counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    } catch {
      // A table that does not exist yet is not an error; the schema grows.
      counts[table] = null;
    }
  }
  return counts;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`No database at ${DB_PATH}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = join(OUT_DIR, `filmpje-${stamp}.db`);

  const source = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const before = countRows(source);

  // Single-quoted SQL literal; the path is ours, but escape quotes anyway.
  source.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  source.close();

  // Prove the snapshot is readable and intact rather than assuming it.
  const copy = new Database(target, { readonly: true, fileMustExist: true });
  const integrity = String(copy.pragma('integrity_check', { simple: true }));
  const after = countRows(copy);
  copy.close();

  const mismatched = TABLES.filter((t) => before[t] !== after[t]);

  console.log(`source   ${DB_PATH} (${statSync(DB_PATH).size.toLocaleString()} bytes)`);
  console.log(`backup   ${target} (${statSync(target).size.toLocaleString()} bytes)`);
  console.log(`integrity ${integrity}`);
  console.log('rows');
  for (const table of TABLES) {
    const value = after[table];
    console.log(`  ${table.padEnd(12)} ${value === null ? '(no table)' : value}`);
  }

  if (integrity !== 'ok' || mismatched.length) {
    console.error(`\nBACKUP NOT TRUSTWORTHY: integrity=${integrity} mismatched=${mismatched}`);
    process.exit(1);
  }
  console.log('\nBackup verified.');
}

main().catch((error) => {
  console.error('Backup failed:', error);
  process.exit(1);
});
