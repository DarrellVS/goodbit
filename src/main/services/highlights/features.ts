/**
 * Everything the analysis knows about a clip, as numbers.
 *
 * Split out of `AnalyzeClipAction` so that three things can share one
 * description: the rule that ships, a learned model if one is ever trained, and
 * the offline bench that fits it. A feature added here is available to all
 * three at once, and, because the names are the contract with a stored model,
 * one removed from here invalidates that model rather than silently changing
 * what it means.
 */

/** ebur128 reports momentary loudness every 100 ms. */
export const HOP = 0.1;

/** Anything below this is silence, not a quiet moment, and would wreck the median. */
export const SILENCE_LUFS = -70;

/**
 * How long a moment is, for ranking.
 *
 * Not a single 100 ms sample, which lets one door slam beat a firefight, and
 * not a whole ten second window, which made a long mild stretch outscore a
 * short loud one.
 */
export const MOMENT_SEC = 1.5;

/** What counts as "the loud part has started", as a fraction of its own peak. */
export const ONSET_FRACTION = 0.5;

/**
 * How much to favour the end of the clip, and how much of it counts as the end.
 *
 * A replay buffer is saved *after* something happened, so the something is near
 * the end. Measured over 88 real clips the loudest moment falls in the last
 * tenth 24% of the time, against the 10% a uniform distribution would give, and
 * in the last 40% sixty per cent of the time. A thumb on the scale rather than
 * a rule: a clearly bigger event earlier still wins.
 */
export const RECENCY_WEIGHT = 0.45;
export const RECENCY_TAIL = 0.45;

export interface Shaped {
  /** Robust z-score of every sample: how far above this clip's own normal. */
  z: number[];
  median: number;
  mad: number;
  spreadLu: number;
}

/**
 * Centre and scale the loudness on the clip's own middle, so a quiet horror
 * game and a loud shooter are each measured on their own terms.
 */
export function shape(loudness: number[]): Shaped | null {
  const voiced = loudness.filter((x) => x > SILENCE_LUFS).sort((a, b) => a - b);
  if (voiced.length < 10) return null;

  const median = voiced[Math.floor(voiced.length / 2)];
  const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  const spreadLu =
    voiced[Math.floor(voiced.length * 0.9)] - voiced[Math.floor(voiced.length * 0.1)];

  // MAD is floored so a nearly flat clip cannot divide its way to a big score.
  const scale = 3 * Math.max(mad, 0.5);
  return { z: loudness.map((x) => (x - median) / scale), median, mad, spreadLu };
}

/** Where the loud part starts, walking back from its peak. */
export function onsetBefore(z: number[], peakIndex: number): number {
  const peak = z[peakIndex];
  if (!(peak > 0)) return peakIndex;

  let onset = peakIndex;
  while (onset > 0 && z[onset - 1] >= peak * ONSET_FRACTION) onset--;
  return onset;
}

/** Where it stops, by the same measure. */
export function decayAfter(z: number[], peakIndex: number): number {
  const peak = z[peakIndex];
  if (!(peak > 0)) return peakIndex;

  let decay = peakIndex;
  while (decay < z.length - 1 && z[decay + 1] >= peak * ONSET_FRACTION) decay++;
  return decay;
}

export interface Candidate {
  /** Index of the loudest instant of the best moment. */
  peakIndex: number;
  onsetIndex: number;
  decayIndex: number;
}

/**
 * Find the moment.
 *
 * Rolling mean over `MOMENT_SEC` of the unclipped scores, tilted towards the
 * end of the clip, and then the loudest instant inside the winner.
 */
export function findMoment(z: number[]): Candidate {
  const n = z.length;
  const span = Math.max(1, Math.round(MOMENT_SEC / HOP));

  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + z[i]);

  let bestIndex = 0;
  let bestWeighted = -Infinity;
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - Math.floor(span / 2));
    const to = Math.min(n, from + span);
    const mean = (prefix[to] - prefix[from]) / (to - from);

    const position = i / n;
    const lateness = Math.max(0, position - (1 - RECENCY_TAIL)) / RECENCY_TAIL;
    const weighted = mean * (1 + RECENCY_WEIGHT * lateness);

    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestIndex = i;
    }
  }

  let peakIndex = bestIndex;
  for (let i = Math.max(0, bestIndex - span); i < Math.min(n, bestIndex + span); i++) {
    if (z[i] > z[peakIndex]) peakIndex = i;
  }

  return {
    peakIndex,
    onsetIndex: onsetBefore(z, peakIndex),
    decayIndex: decayAfter(z, peakIndex),
  };
}

/**
 * The named feature vector.
 *
 * The names are a contract: a stored model refers to them, so adding is safe
 * and renaming is not.
 */
export interface HighlightFeatures {
  /** How far the moment stands above this clip's own normal. The main signal. */
  peakZ: number;
  /** The clip's dynamic range in LU, p90 minus p10. */
  spreadLu: number;
  /** How long the loud part lasted. */
  eventSec: number;
  /** Where the moment sits, 0 at the start of the clip and 1 at the end. */
  position: number;
  /** How long the clip is. */
  durationSec: number;
  /** Mean z over the whole clip: how busy it is throughout. */
  busyness: number;
  /** The second best moment that does not overlap the winner, in z. */
  runnerUpZ: number;
}

export function describe(
  shaped: Shaped,
  candidate: Candidate,
  durationSec: number,
): HighlightFeatures {
  const { z } = shaped;
  const n = z.length;

  const eventSec = (candidate.decayIndex - candidate.onsetIndex + 1) * HOP;
  const busyness = z.reduce((a, b) => a + Math.max(0, b), 0) / n;

  // The best moment somewhere else entirely. When it is nearly as good as the
  // winner, the clip has several equal moments, or none.
  let runnerUpZ = 0;
  const gap = Math.max(1, Math.round(MOMENT_SEC / HOP));
  for (let i = 0; i < n; i++) {
    if (i > candidate.onsetIndex - gap && i < candidate.decayIndex + gap) continue;
    if (z[i] > runnerUpZ) runnerUpZ = z[i];
  }

  return {
    peakZ: z[candidate.peakIndex],
    spreadLu: shaped.spreadLu,
    eventSec,
    position: n > 1 ? candidate.peakIndex / (n - 1) : 0,
    durationSec,
    busyness,
    runnerUpZ,
  };
}

/** The order a model stores its weights in. */
export const FEATURE_NAMES: Array<keyof HighlightFeatures> = [
  'peakZ',
  'spreadLu',
  'eventSec',
  'position',
  'durationSec',
  'busyness',
  'runnerUpZ',
];

export function toVector(features: HighlightFeatures): number[] {
  return FEATURE_NAMES.map((name) => features[name]);
}
