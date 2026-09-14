import type { HighlightFeatures } from './features.js';
import { moduleFor, type GameRefinement } from './registry.js';
import { score as modelScore } from './model.js';

/**
 * Whether to suggest anything, and on what grounds.
 *
 * Kept apart from the measuring for one practical reason: measuring a clip
 * costs an ffmpeg pass and is cached, while deciding costs nothing. A cached
 * measurement stays valid when the bar moves — because a game's calibration
 * changed, or a model was dropped in — and only the verdict is recomputed.
 */

/**
 * How far the loudest moment has to stand above the clip's own normal, in
 * units of 3 × MAD.
 *
 * Arrived at by measuring, not by taste. Across 88 real recordings from 24
 * games, the cases that had to be refused — a Battlefield menu screen whose
 * music swells (1.04), a black loading screen (0.76), half a clip of settings
 * menus (1.14), a death and respawn sequence (0.58), a quiet walk through a
 * house (0.53) — all sit below 1.3, and the cases that had to be kept — a
 * helicopter crash (1.44), a firefight (1.93), two clips of people laughing
 * over a near-static top-down game (1.68, 2.73) — all sit above it.
 *
 * Absolute loudness cannot do this: that menu's music swell is 17 LU above its
 * own median, *larger* than the helicopter crash.
 */
export const MIN_PEAK_Z = 1.3;

/** Below this there is no dynamic range at all: nothing to point at. */
export const MIN_SPREAD_LU = 6;

export interface Verdict {
  confident: boolean;
  reason: string | null;
  /** What set the bar, for logs and for the settings screen. */
  bar: number;
  basis: 'rule' | 'model';
}

export interface DecideInput {
  features: HighlightFeatures;
  game?: string;
  /**
   * The median peak z of this game's other clips, when enough of them are
   * known. A moment also has to beat what is ordinary for its own game.
   */
  gameMedianPeakZ?: number | null;
}

export function decide({ features, game, gameMedianPeakZ }: DecideInput): Verdict {
  let bar = MIN_PEAK_Z;
  let refinement: GameRefinement = {};

  // A game's own normal, where it is known. See calibration.ts: a racing game
  // is a constant engine and nothing stands far above it, while a quiet horror
  // game is silence and stings, so the fixed bar flagged every single clip.
  if (gameMedianPeakZ !== null && gameMedianPeakZ !== undefined) {
    bar = Math.max(bar, gameMedianPeakZ);
  }

  if (game) {
    const module = moduleFor(game);
    if (module) {
      refinement = module.refine({ features, bar });
      if (refinement.bar !== undefined) bar = refinement.bar;
    }
  }

  if (refinement.reject) {
    return { confident: false, reason: refinement.reject, bar, basis: 'rule' };
  }

  // A trained model replaces the threshold entirely when one is present; the
  // rule below is what ships, and what runs when there is not.
  const probability = modelScore(features);
  if (probability !== null) {
    return {
      confident: probability >= 0.5,
      reason:
        probability >= 0.5 ? null : 'nothing in this clip looks like the bits you usually keep',
      bar,
      basis: 'model',
    };
  }

  if (features.spreadLu < MIN_SPREAD_LU) {
    return {
      confident: false,
      reason: 'the sound of this clip never really changes',
      bar,
      basis: 'rule',
    };
  }

  if (features.peakZ < bar) {
    return {
      confident: false,
      reason: 'nothing in this clip really stands out from the rest of it',
      bar,
      basis: 'rule',
    };
  }

  return { confident: true, reason: null, bar, basis: 'rule' };
}
