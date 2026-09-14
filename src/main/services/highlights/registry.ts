import type { HighlightFeatures } from './features.js';
import type { Region } from './vision/geometry.js';
import type { SampledRegion } from './vision/sample.js';

/**
 * Per-game knowledge, kept out of the general rule.
 *
 * The general rule only listens. It cannot know that a killfeed chime means a
 * kill in one game and a menu selection in another, or that in a racing game
 * the interesting part is the ten seconds *after* the crash rather than before
 * it. Those are facts about one game, and hard-coding them into the rule would
 * make it worse everywhere else.
 *
 * A module claims some game folder names and may do two things for them: name
 * boxes on the screen it wants sampled and turn what appears in them into
 * events, and adjust the verdict the general rule would reach.
 *
 * **Adding one is a measuring job, not a guessing one.** Every tweak that
 * suggested itself from the armchair — shorter lead-in for racing, a higher
 * bar for shooters — was a guess, and guesses aimed at one game are exactly
 * what produced suggestions that pointed at nothing. `scripts/visual-*.mjs`
 * is the bench: it renders what a candidate rule actually picked, and no rule
 * belongs here until those contact sheets show the thing it claims to find.
 */

export interface GameRefinement {
  /** Refuse outright, with a reason worth showing someone. */
  reject?: string;
  /** Raise or lower the bar this game's moments have to clear. */
  bar?: number;
  /** Open the window earlier or later than the usual lead-in. */
  leadInSec?: number;
  /** Keep more or less of the clip after the peak. */
  tailRoomSec?: number;
  /** Never suggest anything shorter than this. */
  minWindowSec?: number;
}

/**
 * Something the game itself said happened, and when.
 *
 * This is the strongest evidence there is — stronger than loudness, which can
 * only report that a clip got loud. A kill banner is the game confirming a
 * kill, so a suggestion built on one can say *why* it is being made.
 */
export interface GameEvent {
  /** A short machine name: 'kill', 'multi-kill'. */
  kind: string;
  /** When it happened, in seconds from the start of the clip. */
  atSec: number;
  /**
   * When it finished, for something that took a while — three kills in nine
   * seconds is one event nine seconds long, and the window has to fit it.
   */
  untilSec?: number;
  /** How sure the detector is, 0 to 1. */
  confidence: number;
  /**
   * One line for the person looking at the suggestion, in the app's voice:
   * lower case, plain, no exclamation marks.
   */
  reason: string;
}

export interface WatchInput {
  /** The boxes this module asked for, sampled in order. */
  regions: Record<string, SampledRegion>;
  /** Samples per second. */
  fps: number;
  frameWidth: number;
  frameHeight: number;
  durationSec: number;
}

export interface GameModule {
  /** Folder names this applies to. Matched case-insensitively. */
  games: string[];
  /** What this module knows, in one line, for anyone reading the registry. */
  describe: string;
  /**
   * Boxes on the screen to sample, keyed by name. Declaring any of these is
   * what makes a clip of this game worth decoding frames for at all; a game
   * with no module is never decoded.
   */
  regions?: Record<string, Region>;
  /** Turn the sampled boxes into events. Only called when `regions` is set. */
  watch?(input: WatchInput): GameEvent[];
  refine(input: {
    features: HighlightFeatures;
    /** The bar the general rule would use, after calibration. */
    bar: number;
    /** What the HUD gave away, if this module watched for anything. */
    events?: GameEvent[];
  }): GameRefinement;
}

const MODULES: GameModule[] = [];

/** Add a module. Exported for tests and for anyone extending this. */
export function register(module: GameModule): void {
  MODULES.push(module);
}

/** Drop every module. Tests only. */
export function clearModules(): void {
  MODULES.length = 0;
}

export function moduleFor(game: string): GameModule | null {
  const wanted = game.trim().toLowerCase();
  return MODULES.find((m) => m.games.some((g) => g.toLowerCase() === wanted)) ?? null;
}

/** Whether a clip of this game has anything on screen worth reading. */
export function watchesScreen(game: string): boolean {
  const module = moduleFor(game);
  return !!module?.regions && !!module.watch;
}

/** What is registered, for the settings screen and for logs. */
export function registered(): Array<{ games: string[]; describe: string; watches: boolean }> {
  return MODULES.map(({ games, describe, regions, watch }) => ({
    games,
    describe,
    watches: !!regions && !!watch,
  }));
}
