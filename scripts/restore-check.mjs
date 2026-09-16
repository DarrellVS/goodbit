/**
 * Prove that putting a backup back does what it says, and refuses what it
 * should.
 *
 * This is the one operation in the app whose failure mode is losing everything
 * the user has ever typed: a clip row is the only copy of its tags, notes,
 * display name, stars and collections, and a restore replaces every row at
 * once. So it does not get trusted because it typechecked.
 *
 * Bundles the real `restoreBackup` out of `src/main` with esbuild, the same way
 * `migration-check.mjs` bundles `initDatabase`, and drives it against a
 * throw-away profile. Checks, in order of how much they would hurt:
 *
 *   1. a path outside the backups folder is refused, including via `..`
 *   2. a file that is not a database is refused, and the live library survives
 *   3. a good copy is put back, and the rows in it are the rows that appear
 *   4. what was there before is copied first, verified, and can be put back
 *   5. the write-ahead log does not survive the swap
 *
 *   node scripts/restore-check.mjs
 *
 * Nothing here goes near the real library. The profile is a temp directory and
 * every database in it is made by this script.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const TMP = join(process.cwd(), 'tmp', 'restore-check');
const BUNDLE = join(TMP, 'backup-bundle.mjs');

/*
 * Read-write and creating by default, read-only on request.
 *
 * This used to carry a warning about node-sqlite3 picking its callback out of
 * the argument list by position and type, so that `new Database(path,
 * undefined, cb)` saw no callback at all and the script hung with no error.
 * That hazard belonged to that driver and is gone with it: this one takes an
 * options object and is synchronous, so there is no callback to lose and
 * nothing to hang.
 */
const open = (path, readonly = false) =>
  readonly ? new Database(path, { readonly: true, fileMustExist: true }) : new Database(path);
const run = (db, sql) => db.exec(sql);
const get = (db, sql) => db.prepare(sql).get();

let failures = 0;
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures++;
};

/** A database with a `clip` table and a known number of rows in it. */
function makeLibrary(path, rows, note) {
  const db = open(path);
  try {
    run(db, 'CREATE TABLE IF NOT EXISTS clip (id integer primary key, notes text)');
    run(db, 'DELETE FROM clip');
    for (let i = 0; i < rows; i++) {
      run(db, `INSERT INTO clip (id, notes) VALUES (${i + 1}, '${note}')`);
    }
  } finally {
    db.close();
  }
}

function readLibrary(path) {
  const db = open(path, true);
  try {
    const count = get(db, 'SELECT COUNT(*) AS n FROM clip');
    const sample = get(db, 'SELECT notes FROM clip LIMIT 1');
    return { rows: count.n, note: sample?.notes ?? null };
  } finally {
    db.close();
  }
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const profile = join(TMP, 'profile');
const backups = join(profile, 'backups');
mkdirSync(backups, { recursive: true });
process.env.GOODBIT_USER_DATA = profile;

// The same electron shim `migration-check.mjs` uses, for the same reason:
// `settings.ts` asks Electron where the profile is.
const shim = join(TMP, 'electron-shim.mjs');
writeFileSync(
  shim,
  [
    'export const app = {',
    "  getPath: () => process.env.GOODBIT_USER_DATA ?? '.',",
    "  getVersion: () => '0.0.0-restore-check',",
    "  getName: () => 'GoodBit',",
    '};',
    'export default { app };',
    '',
  ].join('\n'),
  'utf-8',
);

const entry = join(TMP, 'entry.ts');
writeFileSync(
  entry,
  "export { restoreBackup, takeBackup, listBackups } from '../../src/main/backup.js';\n",
  'utf-8',
);

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { electron: shim },
  outfile: BUNDLE,
  logLevel: 'warning',
  tsconfig: 'tsconfig.node.json',
});

const { restoreBackup, takeBackup } = await import(pathToFileURL(BUNDLE).href);

const live = join(profile, 'goodbit.db');

// The library as it was, and a verified copy of it.
makeLibrary(live, 12, 'the old library');
const taken = await takeBackup(live);
ok('a copy can be taken to restore from', taken.taken === true, taken.reason);
const goodCopy = taken.path;

// And then the library moves on, which is the state somebody restores from.
makeLibrary(live, 3, 'the current library');
ok('the live library is the newer one', readLibrary(live).rows === 3);

console.log('');

// 1. A path that is not ours.
{
  const outside = join(TMP, 'somewhere-else.db');
  makeLibrary(outside, 99, 'not ours');
  const refused = await restoreBackup(outside);
  ok('refuses a database outside the backups folder', refused.restored === false, refused.reason);

  const traversal = join(backups, '..', '..', 'somewhere-else.db');
  const refusedTraversal = await restoreBackup(traversal);
  ok('refuses a path that walks out with ..', refusedTraversal.restored === false);

  const notADatabase = join(backups, 'notes.txt');
  writeFileSync(notADatabase, 'hello', 'utf-8');
  const refusedExtension = await restoreBackup(notADatabase);
  ok('refuses a file that is not a .db', refusedExtension.restored === false);

  const missing = join(backups, 'never-existed.db');
  const refusedMissing = await restoreBackup(missing);
  ok('refuses a copy that is not on disk', refusedMissing.restored === false);

  ok('the live library is untouched by any of those', readLibrary(live).rows === 3);
}

// 2. A file with the right name that is not a database.
{
  const corrupt = join(backups, 'goodbit-corrupt-2020-01-01T00-00-00.db');
  writeFileSync(corrupt, 'this is not a database, it just ends in .db', 'utf-8');

  const refused = await restoreBackup(corrupt);
  ok('refuses a copy that will not open', refused.restored === false, refused.reason);
  ok(
    'the live library survives a refused restore',
    readLibrary(live).rows === 3,
    'still 3 rows',
  );
}

console.log('');

// 3. The real thing.
{
  const result = await restoreBackup(goodCopy);
  ok('restores a good copy', result.restored === true, result.reason);
  ok('reports how many clips came back', result.clips === 12, `said ${result.clips}`);

  const now = readLibrary(live);
  ok('the restored rows are the ones from the copy', now.rows === 12, `${now.rows} rows`);
  ok('and their contents came with them', now.note === 'the old library', String(now.note));
}

// 4. The way back from the way back.
{
  const copies = (await import(pathToFileURL(BUNDLE).href)).listBackups();
  const safety = copies.find((copy) => copy.name.includes('before-restore'));
  ok('a copy of the replaced library was kept', !!safety, safety?.name ?? 'none found');

  if (safety) {
    const back = await restoreBackup(safety.path);
    ok('that copy can itself be restored', back.restored === true, back.reason);

    const now = readLibrary(live);
    ok(
      'which puts the library back to where it started',
      now.rows === 3 && now.note === 'the current library',
      `${now.rows} rows, ${now.note}`,
    );
  }
}

// 5. A write-ahead log from the replaced database must not survive.
{
  writeFileSync(`${live}-wal`, 'stale pages from the database that is no longer here', 'utf-8');
  writeFileSync(`${live}-shm`, 'stale index', 'utf-8');

  await restoreBackup(goodCopy);
  ok('the stale -wal is gone after a restore', !existsSync(`${live}-wal`));
  ok('the stale -shm is gone after a restore', !existsSync(`${live}-shm`));
  ok('and the restore still landed', readLibrary(live).rows === 12);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
