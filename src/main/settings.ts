import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The handful of things the app needs to know before it can do anything.
 *
 * Deliberately not the renderer's settings — view preferences stay where they
 * are. These are the ones main itself reads at boot, before a window exists:
 * where the clips are, whether to start with Windows, where to publish.
 *
 * A plain JSON file rather than a dependency; there are six keys and they are
 * read once.
 */
export interface Settings {
  /** Where OBS writes. Empty until the first run picks it. */
  videosRoot: string;
  /** Where the editor's music lives. */
  audioRoot: string;
  /** Optional. Empty means the publish feature is absent, not broken. */
  publisherBaseUrl: string;
  startAtLogin: boolean;
  /** Keep running in the tray when the window is closed. */
  keepRunningInTray: boolean;
  /** Set once the legacy web-app database has been adopted. */
  migratedFromWebApp: boolean;
  /**
   * The app version that last booted against this database.
   *
   * A different one means the schema is about to be compared to a new set of
   * entities, which is when a verified backup is taken. See `backup.ts`.
   */
  schemaVersion?: string;
  /**
   * Fit the suggestion model to your trims on its own as they accumulate.
   * Default on; Settings → Advanced turns it off and can revert to the rule.
   */
  learnFromTrims?: boolean;
  /** Where the window was last, so it opens where you left it. */
  window?: WindowBounds;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** Restored maximised rather than at the remembered size. */
  maximized: boolean;
}

const DEFAULTS: Settings = {
  videosRoot: '',
  audioRoot: '',
  publisherBaseUrl: '',
  startAtLogin: true,
  keepRunningInTray: true,
  migratedFromWebApp: false,
};

let cached: Settings | null = null;

/** `%APPDATA%/GoodBit` on Windows. Everything the app owns lives under here. */
export function userDataDir(): string {
  // index.ts already redirected app.getPath('userData') when the override is
  // set, so asking Electron is enough and both agree by construction.
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function settingsPath(): string {
  return join(userDataDir(), 'settings.json');
}

export function databasePath(): string {
  return join(userDataDir(), 'goodbit.db');
}

export function backupsDir(): string {
  const dir = join(userDataDir(), 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadSettings(): Settings {
  if (cached) return cached;

  const path = settingsPath();
  if (!existsSync(path)) {
    cached = { ...DEFAULTS };
    return cached;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<Settings>;
    // Merged over the defaults so a file written by an older version, missing
    // keys added since, still loads.
    cached = { ...DEFAULTS, ...parsed };
  } catch (error) {
    // Falling back to defaults quietly would look like the app forgetting where
    // the clips are — and would let a later save overwrite a file that might
    // still be recoverable. Keep the original and say so.
    const salvage = `${path}.corrupt-${Date.now()}`;
    try {
      copyFileSync(path, salvage);
    } catch {
      /* nothing more to try */
    }
    console.error(
      `[settings] could not read ${path} (${error instanceof Error ? error.message : error}). ` +
        `Falling back to defaults; the unreadable file was kept at ${salvage}`,
    );
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  cached = next;
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

/** True when there is enough to start: somewhere to read clips from. */
export function isConfigured(): boolean {
  const { videosRoot } = loadSettings();
  return !!videosRoot && existsSync(videosRoot);
}
