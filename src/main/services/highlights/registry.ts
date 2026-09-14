import type { HighlightFeatures } from './features.js';

/**
 * Per-game knowledge, kept out of the general rule.
 *
 * The general rule only listens. It cannot know that a killfeed chime means a
 * kill in one game and a menu selection in another, or that in a racing game
 * the interesting part is the ten seconds *after* the crash rather than before
 * it. Those are facts about one game, and hard-coding them into the rule would
 * make it worse everywhere else.
 *
 * A module claims some game folder names and may adjust the verdict for them.
 * It sees only the features, never the audio, so adding one costs nothing at
 * analysis time.
 *
 * **There are deliberately none of these yet.** Every candidate tweak I could
 * think of — shorter lead-in for racing, a higher bar for shooters — was a
 * guess rather than a measurement, and guesses aimed at one game are exactly
 * what produced the suggestions that pointed at nothing. The per-game
 * behaviour that *is* justified by measurement is game calibration, which is
 * general and lives in `calibration.ts`. This is here so the next real finding
 * has somewhere to go.
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

export interface GameModule {
  /** Folder names this applies to. Matched case-insensitively. */
  games: string[];
  /** What this module knows, in one line, for anyone reading the registry. */
  describe: string;
  refine(input: {
    features: HighlightFeatures;
    /** The bar the general rule would use, after calibration. */
    bar: number;
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

/** What is registered, for the settings screen and for logs. */
export function registered(): Array<{ games: string[]; describe: string }> {
  return MODULES.map(({ games, describe }) => ({ games, describe }));
}
