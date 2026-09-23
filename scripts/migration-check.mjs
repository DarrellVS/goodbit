/**
 * Run the *shipped* migrations against a copy of a real library, and read back
 * what happened.
 *
 * The app ran `synchronize: true` from the beginning, which means every library
 * in existence has a schema TypeORM built by comparing entities to tables on
 * each boot, and no migration history at all. Turning that into a migration
 * chain is the one schema change that can lose somebody's tags and notes, so it
 * does not get trusted because it typechecked.
 *
 * This bundles `initDatabase` out of `src/main` with esbuild, the same way
 * `hud-check.mjs` bundles the HUD modules, so the bench and the app cannot
 * drift into two implementations. Then it:
 *
 *   1. copies a real database aside, twice,
 *   2. migrates one copy and compares every row count to the original,
 *   3. migrates an empty file and compares its schema to the migrated copy,
 *   4. runs the migrations again to prove they are idempotent,
 *   5. checks the search index actually has the library in it.
 *
 * Step 3 is the one that catches the real hazard: a fresh install and an
 * upgraded install must end up with the *same* schema, or the app works on one
 * machine and not the other.
 *
 *   node scripts/migration-check.mjs
 *   node scripts/migration-check.mjs --database <a .db file>
 *
 * **Read-only as far as the real database is concerned.** It is copied with
 * `VACUUM INTO`, never opened for writing, and the default source is the newest
 * verified backup rather than the live file.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { userDataDir } from './lib/libraryRoot.mjs';

const TMP = join(process.cwd(), 'tmp', 'migration-check');
const BUNDLE = join(TMP, 'db-bundle.mjs');

const flag = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};

/** The live database is the last resort, and it is still only ever copied. */
function pickSource() {
  const explicit = flag('--database');
  if (explicit) return explicit;

  const backups = join(userDataDir(), 'backups');
  if (existsSync(backups)) {
    const newest = readdirSync(backups)
      .filter((name) => name.endsWith('.db'))
      .map((name) => ({ path: join(backups, name), at: statSync(join(backups, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0];
    if (newest) return newest.path;
  }

  const live = join(userDataDir(), 'goodbit.db');
  return existsSync(live) ? live : null;
}

/*
 * The driver is synchronous, so these are direct calls rather than the
 * promise wrappers they used to be. The names stay because the call sites
 * below read the same either way, and a bench that reads like the thing it
 * checks is easier to trust.
 */
const open = (path, readonly = true) => new Database(path, { readonly, fileMustExist: true });
const all = (db, sql) => db.prepare(sql).all();
const get = (db, sql) => db.prepare(sql).get();
const run = (db, sql) => db.exec(sql);

function snapshot(source, target) {
  const db = open(source);
  try {
    run(db, `VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

/** Every table and its row count, which is the thing that must not change. */
function census(path) {
  const db = open(path);
  try {
    const tables = all(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const counts = {};
    for (const { name } of tables) {
      counts[name] = get(db, `SELECT COUNT(*) AS n FROM "${name}"`).n;
    }
    return counts;
  } finally {
    db.close();
  }
}

/** The schema, normalised enough that two databases can be compared by eye. */
function schema(path) {
  const db = open(path);
  try {
    const rows = all(
      db,
      "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    );
    return rows.map((row) => `${row.type} ${row.name}`);
  } finally {
    db.close();
  }
}

function columnsOf(path, table) {
  const db = open(path);
  try {
    // `db.pragma` rather than a prepared statement, which is what this driver
    // asks for: it normalises the pragmas that both set and report.
    return db.pragma(`table_info("${table}")`).map((row) => row.name);
  } finally {
    db.close();
  }
}

let failures = 0;
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures++;
};

// A profile per run, so `initDatabase` finds a database where it expects one.
async function migrate(profileDir) {
  const { initDatabase } = await import(pathToFileURL(BUNDLE).href + `?v=${Date.now()}`);
  process.env.GOODBIT_USER_DATA = profileDir;
  const source = await initDatabase();
  const applied = await source.query(
    `SELECT name FROM "migrations" ORDER BY timestamp`,
  );
  await source.destroy();
  return applied.map((row) => row.name);
}

const source = pickSource();
if (!source) {
  console.error('no database found. Pass one with --database <file>.');
  process.exit(2);
}

console.log(`source     ${source}`);
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

/*
 * The bundle, and the one thing it has to fake.
 *
 * `settings.ts` opens with `import { app } from 'electron'`, because
 * `userDataDir()` asks Electron where the profile is. Outside Electron that
 * import has nothing to resolve, so it is aliased to a shim that answers from
 * `GOODBIT_USER_DATA`, which is the same override the app itself honours and
 * which every test already uses.
 */
const shim = join(TMP, 'electron-shim.mjs');
writeFileSync(
  shim,
  [
    'export const app = {',
    "  getPath: () => process.env.GOODBIT_USER_DATA ?? '.',",
    "  getVersion: () => '0.0.0-migration-check',",
    "  getName: () => 'GoodBit',",
    '};',
    'export default { app };',
    '',
  ].join('\n'),
  'utf-8',
);

const entry = join(TMP, 'entry.ts');
writeFileSync(entry, "export { initDatabase } from '../../src/main/data-source.js';\n", 'utf-8');

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { electron: shim, '@shared': join(process.cwd(), 'src', 'shared') },
  outfile: BUNDLE,
  logLevel: 'warning',
  /*
   * The entities are decorated classes, and the root `tsconfig.json` is a
   * references-only file with no `compilerOptions` in it. esbuild resolves a
   * tsconfig by walking up from the entry, finds that one, and so emits
   * `@Entity() class {}` verbatim, which is not JavaScript.
   *
   * `emitDecoratorMetadata` is in `tsconfig.node.json` and esbuild does not
   * implement it, which is fine here only because every column in every entity
   * declares its type explicitly. A column added with an inferred type would
   * work in the app and fail in this bench, so if that ever happens, the
   * column is the thing to fix.
   */
  tsconfig: 'tsconfig.node.json',
});

// 1. An existing library, migrated.
const upgradedProfile = join(TMP, 'upgraded');
mkdirSync(upgradedProfile, { recursive: true });
const upgraded = join(upgradedProfile, 'goodbit.db');
snapshot(source, upgraded);

const before = census(upgraded);
console.log(`\nbefore     ${Object.entries(before).map(([t, n]) => `${t}:${n}`).join('  ')}`);

const appliedUpgrade = await migrate(upgradedProfile);
console.log(`migrations ${appliedUpgrade.join(', ')}`);

const after = census(upgraded);
console.log(`after      ${Object.entries(after).map(([t, n]) => `${t}:${n}`).join('  ')}\n`);

for (const [table, count] of Object.entries(before)) {
  /*
   * `migrations` is the one table that is *supposed* to grow.
   *
   * It is TypeORM's record of what has been applied, so a release that adds
   * one adds a row, and holding it to "every row survives" made this bench
   * fail for the one reason that means everything worked. It still has to
   * grow rather than shrink or be rewritten: losing a row here is a migration
   * that would run twice.
   */
  if (table === 'migrations') {
    ok(
      `migrations grew from ${count}`,
      after[table] >= count,
      `${count} -> ${after[table]} (${appliedUpgrade.length} applied)`,
    );
    continue;
  }

  /*
   * FTS5's own segment storage, not rows anybody wrote. The update trigger on
   * `clip` retires and re-adds a row's terms on every update, so the first
   * migration to touch clip rows (3.8.0 clearing `suggestedCount`) grew these
   * while the index itself was exactly right. Their counts say how the index
   * is laid out, not what is in it; `integrity-check` below asks that instead.
   */
  if (/^clip_search_(data|idx)$/.test(table)) continue;

  ok(`${table} kept all ${count} rows`, after[table] === count, `now ${after[table]}`);
}

ok('the good_bit table exists', 'good_bit' in after);
ok('the search index exists', 'clip_search' in after);

const clipColumns = columnsOf(upgraded, 'clip');
ok('clip gained lastOpenedAt', clipColumns.includes('lastOpenedAt'));
ok('clip gained openCount', clipColumns.includes('openCount'));
ok('clip gained suggestedCount', clipColumns.includes('suggestedCount'));

// 2. The search index has to have been backfilled, not just created. An empty
//    index is a search that finds nothing, which reads as a broken search.
{
  const db = open(upgraded);
  try {
    const indexed = get(db, 'SELECT COUNT(*) AS n FROM "clip_search"');
    ok(
      'the search index was backfilled',
      indexed.n === after.clip,
      `${indexed.n} indexed of ${after.clip} clips`,
    );

    // And that it matches the rows it indexes. With external content, a count
    // of `clip_search` is read from `clip` and is right whatever the index
    // holds; rank 1 makes FTS5 compare its terms against the content table,
    // and it throws on any drift.
    // Spelled as an INSERT, so it needs a writable handle; this is the copy.
    let intact = true;
    let why = '';
    const writable = open(upgraded, false);
    try {
      writable.prepare(`INSERT INTO "clip_search"("clip_search", rank) VALUES ('integrity-check', 1)`).run();
    } catch (err) {
      intact = false;
      why = err.message;
    } finally {
      writable.close();
    }
    ok('the search index agrees with the clips', intact, why);

    // And that it answers. A populated index that cannot match is no better.
    const game = get(db, 'SELECT game FROM clip WHERE game IS NOT NULL LIMIT 1');
    if (game) {
      const term = String(game.game).split(/[^A-Za-z0-9]+/).filter(Boolean)[0];
      const hit = get(
        db,
        `SELECT COUNT(*) AS n FROM "clip_search" WHERE "clip_search" MATCH '${term.replace(/'/g, "''")}'`,
      );
      ok(`searching "${term}" finds something`, hit.n > 0, `${hit.n} hits`);
    }
  } finally {
    db.close();
  }
}

// 3. Running them again must do nothing at all.
const appliedAgain = await migrate(upgradedProfile);
ok('a second boot applies no migrations', appliedAgain.length === appliedUpgrade.length);
const afterTwice = census(upgraded);
ok(
  'a second boot changes no row counts',
  JSON.stringify(afterTwice) === JSON.stringify(after),
);

// 4. A fresh install has to land on the same schema as an upgraded one.
const freshProfile = join(TMP, 'fresh');
mkdirSync(freshProfile, { recursive: true });
const appliedFresh = await migrate(freshProfile);
ok(
  'a fresh database runs every migration',
  appliedFresh.length === appliedUpgrade.length,
  `${appliedFresh.length} of ${appliedUpgrade.length}`,
);

const freshSchema = schema(join(freshProfile, 'goodbit.db'));
const upgradedSchema = schema(upgraded);
const missing = upgradedSchema.filter((item) => !freshSchema.includes(item));
const extra = freshSchema.filter((item) => !upgradedSchema.includes(item));
ok(
  'a fresh install and an upgrade end up with the same schema',
  missing.length === 0 && extra.length === 0,
  missing.length || extra.length ? `missing ${missing.join(', ')} | extra ${extra.join(', ')}` : '',
);

const freshClipColumns = columnsOf(join(freshProfile, 'goodbit.db'), 'clip');
const upgradedClipColumns = columnsOf(upgraded, 'clip');
ok(
  'clip has the same columns either way',
  JSON.stringify([...freshClipColumns].sort()) === JSON.stringify([...upgradedClipColumns].sort()),
  `fresh ${freshClipColumns.length}, upgraded ${upgradedClipColumns.length}`,
);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
