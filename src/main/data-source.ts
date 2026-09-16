import 'reflect-metadata';
import { DataSource } from 'typeorm';
import BetterSqlite3 from 'better-sqlite3';
import { Clip } from './entity/Clip.js';
import { Tag } from './entity/Tag.js';
import { Collection } from './entity/Collection.js';
import { Game } from './entity/Game.js';
import { Project } from './entity/Project.js';
import { TagPattern } from './entity/TagPattern.js';
import { HighlightLabel } from './entity/HighlightLabel.js';
import { GoodBit } from './entity/GoodBit.js';
import { migrations } from './migrations/index.js';
import { databasePath, loadSettings } from './settings.js';
import { backupBeforeSchemaSync, rememberSchemaVersion, type BackupResult } from './backup.js';

/**
 * Where the clips are, and where the library database lives.
 *
 * Both used to be environment variables, and a missing `VIDEOS_ROOT` threw
 * before the process could start. That is right for a machine you own and
 * fatal for an app someone installs, so the roots are settings now and the app
 * opens a first-run picker rather than refusing to boot.
 *
 * The database moved out of the videos folder and into `%APPDATA%/GoodBit`:
 * metadata should not depend on the media drive still being formatted the way
 * it was, and a database does not belong in a folder that gets synced.
 */

/**
 * The roots, as live bindings.
 *
 * Exported with `let` and reassigned in `initDatabase`, so the ~40 action
 * classes that already do `path.join(VIDEOS_ROOT, …)` keep working untouched
 * while the value now comes from settings rather than from an environment
 * variable read at import time. ESM re-exports the binding, not a copy, so
 * importers see the assignment.
 */
export let VIDEOS_ROOT = '';
export let AUDIO_ROOT = '';

/** Re-read the roots from settings. Called at boot and whenever they change. */
export function refreshRoots(): void {
  const settings = loadSettings();
  VIDEOS_ROOT = settings.videosRoot;
  AUDIO_ROOT = settings.audioRoot;
}

/**
 * The data source, built once the database path is known.
 *
 * Constructed lazily rather than at import: TypeORM reads the options object
 * when the DataSource is created, and rewriting `options.database` afterwards
 * left the driver addressing a database it had already hashed into an
 * attach-alias, which failed with "no such table: <hash>.sqlite_master".
 *
 * The same live-binding trick as the roots: every caller does
 * `AppDataSource.getRepository(…)` inside a function body, so they pick up the
 * assignment rather than a copy captured at import.
 */
export let AppDataSource: DataSource = null as unknown as DataSource;

let initialised = false;
let lastBackup: BackupResult | null = null;

export async function initDatabase(): Promise<DataSource> {
  refreshRoots();
  if (initialised) return AppDataSource;

  // A migration is allowed to move the schema, so never let a version that has
  // not booted against this file before do it without a copy that has been
  // read back first. This was the whole safety net while `synchronize` was on;
  // it is cheaper insurance now and it stays.
  lastBackup = await backupBeforeSchemaSync(databasePath());

  AppDataSource = new DataSource({
    /*
     * `better-sqlite3`, not `sqlite3`.
     *
     * TryGhost archived node-sqlite3 read-only on 2026-07-01, so 5.1.7/6.0.1
     * is the end of it: no further SQLite version, no fix for the next
     * Electron. It was also the last thing in the tree pulling a vulnerable
     * `tar`, through an optional `node-gyp` it needed because it built from
     * source on every install.
     *
     * The driver underneath is a different shape, and only two of the
     * differences reach this file:
     *
     * - It is **synchronous**, which is why `backup.ts` lost its promise
     *   wrappers. TypeORM's own driver handles that; nothing here awaits
     *   differently.
     * - It ships **one Node-API binary per platform**, resolved as
     *   `prebuilds/win32-x64.node` with no runtime or ABI version in the name,
     *   so there is no per-Electron rebuild any more. Verified loading under
     *   Electron 44.4.1 / Node 24.21.0 from the prebuild alone.
     *
     * TypeORM declares its peer as `^8 || … || ^12` and 13 is what this uses,
     * deliberately, pinned by an `overrides` entry. The peer range is a
     * declaration that lags: the 12 line is the one with the problem, four of
     * its releases are marked "NOT A VIABLE RELEASE" because Electron 41 and
     * 42 moved the V8 APIs it compiled against, and its newest claimed
     * prebuild is Electron 43. 13 dropped that whole coupling by moving to
     * Node-API. On Electron 44, staying inside the declared range would be
     * the riskier choice.
     *
     * What actually had to be checked, and was, against a copy of the real
     * library rather than against the release notes: FTS5 is compiled in
     * (`SQLITE_ENABLE_FTS5`, SQLite 3.53.4), a quoted prefix `MATCH` still
     * returns rows, and `VACUUM INTO` still works from a read-only handle,
     * which every backup depends on and which no document states.
     */
    type: 'better-sqlite3',
    /*
     * The driver is handed over, not looked up.
     *
     * TypeORM otherwise resolves it with `PlatformTools.load('better-sqlite3')`,
     * which is a `require()`. Main is bundled to ESM, where there is no
     * `require`, so the load throws and TypeORM reports the one thing that is
     * not true:
     *
     *   DriverPackageNotInstalledError: SQLite package has not been found
     *   installed. Please run "npm install better-sqlite3".
     *
     * The package is installed, and is already imported at the top of this
     * file. It is listed in `NATIVE_OR_BINARY` so the bundler leaves the
     * import alone, which means the module object is right here and there is
     * nothing to look up. Passing it also removes a runtime resolution that a
     * packaged asar is exactly the wrong place to be doing.
     */
    driver: BetterSqlite3,
    database: databasePath(),
    entities: [Clip, Tag, Collection, Game, Project, TagPattern, HighlightLabel, GoodBit],
    /*
     * Migrations, not `synchronize`.
     *
     * `synchronize: true` compared the entities to the tables on every boot and
     * changed the tables to match. That is fine while entities only gain
     * columns, and on SQLite it is not fine at all when one changes type or
     * goes away: TypeORM resolves that by rebuilding the table, and a rebuild
     * that goes wrong takes the library with it. CLAUDE.md has listed it as a
     * 1.0 blocker since before 1.0, because a clip row is the only copy of its
     * tags, notes, display name, stars and collections.
     *
     * It was also a silent decision-maker. Renaming a column was a data loss
     * event that looked like a refactor, so the schema could not be touched
     * with confidence, which is why several things in 2.0 were waiting on this
     * one.
     *
     * `migrationsRun: true` applies them on `initialize`, before anything reads
     * a row. The first migration is deliberately idempotent, so it is a no-op
     * against every library `synchronize` has already built; see its own note.
     */
    synchronize: false,
    migrations,
    migrationsRun: true,
    logging: false,
  });

  await AppDataSource.initialize();
  initialised = true;
  // The schema survived this version, so the next boot of it can skip the copy.
  rememberSchemaVersion();
  console.log(`[db] opened ${databasePath()}`);
  return AppDataSource;
}

/** What the last boot's backup did, for the Settings screen to report. */
export function lastBackupResult(): BackupResult | null {
  return lastBackup;
}
