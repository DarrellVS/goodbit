import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Clip } from './entity/Clip.js';
import { Tag } from './entity/Tag.js';
import { Collection } from './entity/Collection.js';
import { Game } from './entity/Game.js';
import { Project } from './entity/Project.js';
import { TagPattern } from './entity/TagPattern.js';
import { HighlightLabel } from './entity/HighlightLabel.js';
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

  // `synchronize: true` below is allowed to rewrite tables. Never let a
  // version that has not booted against this file before do that without a
  // copy that has been read back first.
  lastBackup = await backupBeforeSchemaSync(databasePath());

  AppDataSource = new DataSource({
    type: 'sqlite',
    database: databasePath(),
    entities: [Clip, Tag, Collection, Game, Project, TagPattern, HighlightLabel],
    synchronize: true,
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
