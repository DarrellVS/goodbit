/**
 * Put back the tags and collections a re-indexed library lost.
 *
 * `MoveLibraryAction` wrote the moved rows with `path.join`, which on Windows
 * means backslashes. `ScanAndSyncClipsAction` stores what fast-glob returns
 * with `absolute: true`, which is forward slashes. So the scan that ran at the
 * end of a move matched none of the rows it had just repointed: it read 279
 * clips as missing, 279 files as new, and replaced every row. The clips
 * survived, their ids did not, and the join tables hang off the ids.
 *
 * This matches the old rows to the new ones by path, comparing with the
 * separators normalised, and re-inserts the links.
 *
 *   node scripts/repair-links.mjs <backup.db>            # says what it would do
 *   node scripts/repair-links.mjs <backup.db> --write    # does it
 *
 * Close GoodBit first. It holds the database open, and a repair racing the
 * app's own writes is how one problem becomes two.
 */
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';

const backupPath = process.argv[2];
const write = process.argv.includes('--write');

if (!backupPath || !existsSync(backupPath)) {
  console.error('Give me the backup to read the links from.');
  process.exit(1);
}

const livePath = join(process.env.APPDATA ?? '', 'GoodBit', 'goodbit.db');
if (!existsSync(livePath)) {
  console.error(`No library database at ${livePath}`);
  process.exit(1);
}

/**
 * Match on the part of a path that a move does not change.
 *
 * The absolute path is no good here: half the library was still on C: when the
 * backup was taken and all of it is on D: now. What survives is the last two
 * segments, `<game folder>/<file name>`, which is also the pair the library is
 * built on, since the top level folder name *is* the game name.
 *
 * The separator is normalised as well, because that difference is what caused
 * the damage this repairs.
 */
const key = (path) =>
  path.replace(/\\/g, '/').toLowerCase().split('/').slice(-2).join('/');

const open = (file, mode) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, mode, (error) => (error ? reject(error) : resolve(db)));
  });

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))),
  );

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (error) {
      return error ? reject(error) : resolve(this.changes);
    }),
  );

const old = await open(backupPath, sqlite3.OPEN_READONLY);
const live = await open(livePath, write ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY);

const oldClips = await all(old, 'select id, filePath from clip');
const liveClips = await all(live, 'select id, filePath from clip');

// old id -> new id, by the path both of them describe.
const byPath = new Map(liveClips.map((clip) => [key(clip.filePath), clip.id]));
const remap = new Map();
for (const clip of oldClips) {
  const now = byPath.get(key(clip.filePath));
  if (now !== undefined) remap.set(clip.id, now);
}

console.log(`\n  clips then: ${oldClips.length}   clips now: ${liveClips.length}`);
console.log(`  matched by path: ${remap.size}\n`);

const work = [
  {
    what: 'collection links',
    rows: await all(old, 'select collectionId, clipId from collection_clips_clip'),
    insert: 'insert or ignore into collection_clips_clip (collectionId, clipId) values (?, ?)',
    map: (row) => [row.collectionId, remap.get(row.clipId)],
    id: (row) => row.clipId,
  },
  {
    what: 'tag links',
    rows: await all(old, 'select clipId, tagId from clip_tags_tag'),
    insert: 'insert or ignore into clip_tags_tag (clipId, tagId) values (?, ?)',
    map: (row) => [remap.get(row.clipId), row.tagId],
    id: (row) => row.clipId,
  },
];

if (write) {
  const safety = `${livePath}.before-repair`;
  copyFileSync(livePath, safety);
  console.log(`  copied the database to ${safety} first\n`);
}

for (const job of work) {
  const usable = job.rows.filter((row) => remap.has(job.id(row)));
  const lost = job.rows.length - usable.length;

  if (!write) {
    console.log(`  ${job.what}: ${usable.length} would be restored${lost ? `, ${lost} unmatched` : ''}`);
    continue;
  }

  let done = 0;
  for (const row of usable) done += await run(live, job.insert, job.map(row));
  console.log(`  ${job.what}: ${done} restored${lost ? `, ${lost} unmatched` : ''}`);
}

// Things that live on the clip row itself rather than in a join table.
const carried = await all(
  old,
  "select filePath, starred, notes, displayName from clip where starred = 1 or (notes is not null and notes <> '') or (displayName is not null and displayName <> '')",
);

if (carried.length) {
  if (!write) {
    console.log(`  stars, notes and names: ${carried.length} rows would be restored`);
  } else {
    let done = 0;
    for (const row of carried) {
      const id = byPath.get(key(row.filePath));
      if (id === undefined) continue;
      done += await run(live, 'update clip set starred = ?, notes = ?, displayName = ? where id = ?', [
        row.starred,
        row.notes,
        row.displayName,
        id,
      ]);
    }
    console.log(`  stars, notes and names: ${done} restored`);
  }
} else {
  console.log('  stars, notes and names: none were set');
}

console.log(write ? '\n  done.\n' : '\n  nothing was written. Pass --write to do it.\n');
process.exit(0);
