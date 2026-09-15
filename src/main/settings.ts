import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The handful of things the app needs to know before it can do anything.
 *
 * Deliberately not the renderer's settings, view preferences stay where they
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
  /**
   * The shared secret the publisher checks before accepting an upload.
   *
   * Serving media is public by design; writing to it must not be, or anyone
   * who finds the address owns the disk. The publisher refuses every write
   * without one, so this is not optional in practice, only in type.
   */
  publisherToken?: string;
  startAtLogin: boolean;
  /** Keep running in the tray when the window is closed. */
  keepRunningInTray: boolean;
  /**
   * Start OBS, minimised, with the replay buffer running, when GoodBit starts.
   *
   * The point of the whole app is that the last thirty seconds are always
   * there when something happens, and that is only true if OBS is running with
   * its buffer on. Leaving that to the user means the one time they forget is
   * the time worth clipping.
   *
   * Turned on by the setup, because by then GoodBit has a profile to start OBS
   * with. Off for anyone who would rather open OBS themselves.
   */
  startObsWithGoodbit?: boolean;
  /**
   * A game name for an executable, when the guess was wrong.
   *
   * Keyed by the lowercased full path. This is the one thing Smart Replays'
   * alias list was genuinely for, and correcting a clip's game should fix
   * every clip after it rather than only that one.
   */
  gameOverrides?: Record<string, string>;
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
  /**
   * Re-encode a trim to share size instead of keeping the recorded bytes.
   *
   * **Default off.** A trim replaces the only copy of that moment, so the
   * recorded picture is kept unless someone asks otherwise; on, a cut is
   * re-encoded to roughly a fifth of the size.
   */
  compressTrims?: boolean;
  /**
   * Send a share-sized copy to the publisher instead of the file itself.
   *
   * **Default on**, and a different question from the one above: what goes to
   * a public link is a copy, so shrinking it costs nothing on disk and saves
   * whoever opens the link most of the download.
   */
  compressPublished?: boolean;
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
let changeListeners: Array<(settings: Settings) => void> = [];

/**
 * Hear about saves from anywhere. The window, the tray, the updater. The tray
 * menu mirrors two of these and would otherwise show a stale tick.
 */
export function onSettingsChange(listener: (settings: Settings) => void): () => void {
  changeListeners.push(listener);
  return () => {
    changeListeners = changeListeners.filter((l) => l !== listener);
  };
}

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
    // the clips are, and would let a later save overwrite a file that might
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
  for (const listener of changeListeners) {
    try {
      listener(next);
    } catch (error) {
      console.error('[settings] listener threw:', error);
    }
  }
  return next;
}

/** Whether a trim is re-encoded to share size. Unset means no. */
export function compressTrims(): boolean {
  return loadSettings().compressTrims === true;
}

/** Whether what goes to the publisher is a share-sized copy. Unset means yes. */
export function compressPublished(): boolean {
  return loadSettings().compressPublished !== false;
}

/** True when there is enough to start: somewhere to read clips from. */
export function isConfigured(): boolean {
  const { videosRoot } = loadSettings();
  return !!videosRoot && existsSync(videosRoot);
}
