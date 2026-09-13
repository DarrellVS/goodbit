/**
 * Take a consistent snapshot of the library database.
 *
 * `VACUUM INTO` rather than a file copy: the database is normally open and
 * being written by the running app, and copying the file underneath a writer
 * can capture a torn page. VACUUM INTO asks SQLite itself for the snapshot, so
 * what lands is always a valid database — and it is compacted on the way out.
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
import sqlite3 from 'sqlite3';

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

function open(path, mode) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path, mode, (err) => (err ? reject(err) : resolve(db)));
  });
}

function run(db, sql) {
  return new Promise((resolve, reject) => db.run(sql, (err) => (err ? reject(err) : resolve())));
}

function all(db, sql) {
  return new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))),
  );
}

function close(db) {
  return new Promise((resolve) => db.close(() => resolve()));
}

async function countRows(db) {
  const counts = {};
  for (const table of TABLES) {
    try {
      const [row] = await all(db, `SELECT COUNT(*) AS n FROM "${table}"`);
      counts[table] = row.n;
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

  const source = await open(DB_PATH, sqlite3.OPEN_READONLY);
  const before = await countRows(source);

  // Single-quoted SQL literal; the path is ours, but escape quotes anyway.
  await run(source, `VACUUM INTO '${target.replace(/'/g, "''")}'`);
  await close(source);

  // Prove the snapshot is readable and intact rather than assuming it.
  const copy = await open(target, sqlite3.OPEN_READONLY);
  const [{ integrity_check: integrity }] = await all(copy, 'PRAGMA integrity_check');
  const after = await countRows(copy);
  await close(copy);

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
