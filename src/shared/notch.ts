/**
 * What main tells the notch window, and what the notch window says back.
 *
 * Main decides everything and sends one whole `NotchState` whenever anything
 * changes, so the page never draws half of an old state beside half of a new
 * one. The page draws it and reports a button press. That is the whole
 * conversation, which is why the notch has a bridge of its own rather than the
 * app's: nothing on it can delete a clip.
 */

export type NotchMode = 'hidden' | 'line' | 'peek' | 'open';

/** The colour of the line at rest, most urgent first. See `lineState`. */
export type NotchLine = 'ready' | 'warn' | 'none' | 'busy' | 'danger';

/** Two pairs, each a promise and its receipt: a clip being filed, a session being read. */
export type NotchPeekState = 'saving' | 'saved' | 'finding' | 'found';

export interface NotchPeek {
  state: NotchPeekState;
  title: string;
  subtitle: string;
}

export interface NotchIsland {
  /** Whether OBS is running, which is not whether its buffer is. */
  recording: 'running' | 'closed' | 'missing';
  today: {
    count: number;
    /** "4:12", the length of today's clips together. */
    total: string;
  };
  latest: {
    id: number;
    /** The file's own timestamp, the thumbnail's cache-buster. */
    modifiedAt: string;
    name: string;
    /** "Battlefield 6 · 0:21 · 20 Sep", the quiet line under the name. */
    meta: string;
    /** Moments the screen found in it, or null when nobody has looked. */
    moments: number | null;
  } | null;
  /** Only when it is worth saying: the drive holding the library is filling up. */
  disk: { percent: number; free: string; drive: string; danger: boolean } | null;
}

/** What a session's sweep found, for the card the found peek opens into. */
export interface NotchResult {
  found: number;
  clips: number;
  /** The clips that held a moment, in the order they were read. */
  clipIds: number[];
}

export interface NotchState {
  mode: NotchMode;
  line: NotchLine;
  peek: NotchPeek | null;
  /** The open island: today's clips, when opened from the line. */
  island: NotchIsland | null;
  /** The open result card, when opened from a found peek. */
  result: NotchResult | null;
}

export type NotchChime = 'saving' | 'saved' | 'found';

export type NotchAction = 'trim' | 'open-latest' | 'library' | 'edit-highlights' | 'delete-latest';

/** The page's geometry, which main needs to know where the pointer is. */
export const NOTCH_STAGE = { along: 520, across: 300 } as const;
export const NOTCH_LINE = { width: 120, height: 4 } as const;
export const NOTCH_ZONE = { width: 280, height: 10 } as const;
export const NOTCH_PEEK = { width: 360, height: 40 } as const;
export const NOTCH_ISLAND = { width: 420, height: 220 } as const;
export const NOTCH_RESULT = { width: 400, height: 132 } as const;
