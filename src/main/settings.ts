import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RECORDING_QUALITY, type RecordingQuality } from '@shared/index.js';

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
   * Keyed by the lowercased full path, because correcting a clip's game should
   * fix every clip after it rather than only that one.
   */
  gameOverrides?: Record<string, string>;
  /**
   * The MCP server, for connecting Claude Code to this library.
   *
   * Off unless asked for: it is a listening socket into a database that holds
   * the only copy of everybody's tags and notes. The token is generated once
   * and kept, because a saved Claude Code config has to keep working across
   * restarts.
   */
  /**
   * Say "clip saved" over the game, in a corner, for a few seconds.
   *
   * On by default: pressing the replay key and getting nothing back is the
   * single most uncertain moment in using this app, and the library takes
   * several seconds to show the clip. Opt out rather than opt in, because
   * somebody who does not want it will find the switch and somebody who needs
   * it will not know to look.
   */
  clipToast?: boolean;
  /** A short chime with it. Separately switchable: the picture and the noise
   *  are different levels of intrusion. */
  clipToastSound?: boolean;
  /** Which corner of the screen the pointer is on. */
  clipToastCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /**
   * How loud the chime is, 0 to 100.
   *
   * It plays over a game, so the right level depends on how loud the game is
   * and how the machine is mixed, which is not something the app can work out.
   * 75 is the default because the first version was fixed and too quiet to hear
   * over anything.
   */
  clipToastVolume?: number;
  /**
   * Read the session's clips the moment the game closes.
   *
   * Suggestions are worked out when somebody opens the Trim page and not a
   * second before, which is the right rule for a half that decodes video:
   * doing it while OBS is filling a replay buffer is the thing to avoid. The
   * cost of that rule is that the first open of every clip pays for the read
   * while somebody is sitting there waiting to cut.
   *
   * Closing the game is the one moment when the machine is unambiguously free
   * and the answer is wanted: the GPU is idle, nothing is recording, and the
   * clips from that session are exactly the ones about to be looked at.
   *
   * On by default. The work lands on an idle machine, it stands down if
   * another game is in front, and the payoff is a Trim page that opens
   * instantly for the rest of the evening.
   */
  analyzeOnGameClose?: boolean;
  /**
   * Say so, on the same card the clip toast uses.
   *
   * Separate from the sweep itself, the same way `clipToastSound` is separate
   * from `clipToast`, and for the reason stated there: doing the work and
   * drawing something about it are different levels of intrusion. Silent
   * either way, even when the clip chime is on, because this one arrives after
   * somebody has stopped playing rather than answering a key they just
   * pressed.
   */
  analyzeOnGameCloseToast?: boolean;
  /**
   * A chime with the card that says what it found.
   *
   * Its own switch, the same way `clipToastSound` is separate from
   * `clipToast`: a noise and a picture are different amounts of interruption.
   * Deliberately not the clip chime's notes, and only on the half that has
   * news in it. Shares `clipToastVolume`, because it is the same card in the
   * same window and two volume sliders for one overlay is a setting nobody
   * wants to reason about.
   */
  analyzeOnGameCloseSound?: boolean;
  mcpEnabled?: boolean;
  mcpPort?: number;
  mcpToken?: string;
  /**
   * The Stream Deck plugin's server. Off unless switched on, for the same
   * reason the MCP server is: it is a port into a library holding the only
   * copy of somebody's tags and notes. See `services/streamdeck/server.ts`.
   */
  streamDeckEnabled?: boolean;
  streamDeckPort?: number;
  streamDeckToken?: string;
  /**
   * Whether a Stream Deck key may throw the latest clip away.
   *
   * **Off by default, separately from the server.** A key pressed mid-game by
   * somebody not looking at a screen has no room for the question
   * `clipDeleteQuestion.ts` asks, so this is its own decision, the plugin only
   * sends it on a long press, and the server still refuses any clip carrying
   * something that exists only in GoodBit.
   */
  streamDeckAllowDiscard?: boolean;
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
  /**
   * How hard OBS compresses what it records.
   *
   * Not one of the three things in this app that sound like it. `compressTrims`
   * and `compressPublished` are GoodBit re-encoding a clip it already has; this
   * is what OBS writes in the first place, and it cannot change a file already
   * on disk. It also does not take effect when it is changed: the OBS profile
   * is rewritten by `ApplyObsSetupAction`, which refuses to run while OBS is
   * open.
   */
  recordingQuality?: RecordingQuality;
  /**
   * How old a clip has to be before Storage Saver calls it abandoned. Days.
   *
   * A threshold rather than a rule: "never opened" is the signal, and the age
   * is how long somebody wants to give themselves to get round to it. Thirty
   * days by default, which is long enough that "I will get to it" has stopped
   * being true.
   */
  unreviewedDays?: number;
  /**
   * How close together two saves have to be to be one moment. Seconds.
   *
   * The replay buffer holds the last thirty seconds, so two presses inside
   * ninety seconds have overlapping footage in both files.
   */
  burstWindowSec?: number;
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
  clipToast: true,
  clipToastSound: true,
  clipToastCorner: 'top-right',
  clipToastVolume: 75,
  analyzeOnGameClose: true,
  analyzeOnGameCloseToast: true,
  analyzeOnGameCloseSound: true,
  migratedFromWebApp: false,
  recordingQuality: DEFAULT_RECORDING_QUALITY,
  unreviewedDays: 30,
  burstWindowSec: 90,
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
/**
 * What OBS should be told to record at.
 *
 * Falls back to the default rather than to whatever is in the file, because a
 * settings.json written by hand could carry anything and the value goes
 * straight into another program's configuration.
 */
export function recordingQuality(): RecordingQuality {
  const stored = loadSettings().recordingQuality;
  return stored === 'balanced' || stored === 'indistinguishable' ? stored : DEFAULT_RECORDING_QUALITY;
}

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
