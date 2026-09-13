/**
 * Candidate rules for picking the good bit, kept out of the app so they can be
 * run against measurements in bulk. Whatever wins here gets ported into
 * `src/main/actions/AnalyzeClipAction.ts`.
 */

const HOP = 0.1;
const SILENCE = -70;

export function normalise(values) {
  const voiced = values.filter((x) => x > SILENCE).sort((a, b) => a - b);
  if (voiced.length < 10) return null;

  const median = voiced[Math.floor(voiced.length / 2)];
  const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  const spreadLu = voiced[Math.floor(voiced.length * 0.9)] - voiced[Math.floor(voiced.length * 0.1)];

  const scale = 3 * Math.max(mad, 0.5);
  return { median, mad, spreadLu, scale, z: values.map((x) => (x - median) / scale) };
}

/* --------------------------------------------------------------- current */

/** What ships today, for comparison. */
export function ruleCurrent(clip, windowSec = 10) {
  const shaped = normalise(clip.full);
  if (!shaped) return { confident: false, reason: 'silent' };

  const durationSec = clip.durationSec;
  const score = shaped.z.map((x) => Math.max(0, Math.min(1, x)));
  const win = Math.max(1, Math.round(Math.min(windowSec, durationSec * 0.8) / HOP));

  const prefix = [0];
  for (let i = 0; i < score.length; i++) prefix.push(prefix[i] + score[i]);

  let best = 0;
  let bestSum = -1;
  for (let i = 0; i + win <= score.length; i++) {
    const sum = prefix[i + win] - prefix[i];
    if (sum > bestSum) {
      bestSum = sum;
      best = i;
    }
  }

  const mean = bestSum / win;
  const overall = score.reduce((a, b) => a + b, 0) / score.length;
  const confident = shaped.spreadLu >= 4 && mean - overall >= 0.08;

  const start = clip.t0 + best * HOP;
  return {
    confident,
    window: { start: r(start), end: r(Math.min(durationSec, start + win * HOP)) },
  };
}

/* ----------------------------------------------------------------- v2 */

export const V2 = {
  /** A clip is a replay buffer: the reason it was saved is usually near its end. */
  RECENCY_WEIGHT: 0.45,
  /** How much of the clip counts as "the end" for that weighting. */
  RECENCY_TAIL: 0.45,
  /** Voices carry as much as the mix; laughter is rarely the loudest thing. */
  VOICE_WEIGHT: 0.8,
  /** The moment has to be this far above the clip's own normal, in LU. */
  MIN_PEAK_LIFT_LU: 8,
  /** And it has to be a change, not a level: this much rise within a second. */
  MIN_RISE_LU: 6,
  /** The winner has to beat the best window that does not overlap it, by this much score. */
  MIN_MARGIN: 0.12,
  /** Below this the clip is flat: nothing to point at. */
  MIN_SPREAD_LU: 6,
  /** A clip shorter than the window times this is already the highlight. */
  MIN_ROOM: 1.4,
  LEAD_IN: 2.5,
  ONSET_FRACTION: 0.5,
  /** Keep this much after the peak when the peak is near the end. */
  TAIL_ROOM: 1.5,
};

function r(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * The candidate.
 *
 * Three changes over the current rule, each with a reason:
 *
 * 1. **The voice band counts.** Someone shouting or laughing is the point of a
 *    clip at least as often as an explosion, and on a normal mix it never wins
 *    on total loudness.
 * 2. **Later is likelier.** A replay buffer is saved *after* the thing
 *    happened, so the thing is near the end. Measured across 68 real clips the
 *    loudest moment falls in the last tenth 24% of the time, against the 10%
 *    a uniform distribution would give, and in the last 40% sixty per cent of
 *    the time. A gentle weighting, not a rule: a big enough event earlier still
 *    wins.
 * 3. **It can say no.** The old gate passed everything: a spread of 4 LU is
 *    nothing when the median clip spans 25. This one asks for a real lift over
 *    the clip's own normal, a real *rise* rather than a level, and a margin
 *    over the best window that does not overlap the winner — because if two
 *    unrelated stretches score the same, picking either is guesswork.
 */
export function ruleV2(clip, windowSec = 10, config = V2) {
  const shaped = normalise(clip.full);
  if (!shaped) return { confident: false, reason: 'this clip is silent' };

  const voiceShaped = clip.voice ? normalise(clip.voice) : null;
  const durationSec = clip.durationSec;
  const n = shaped.z.length;

  // A clip barely longer than the window has nothing to choose between: it is
  // already the good bit, usually because someone trimmed it to that. Offering
  // to cut two seconds off it is noise.
  if (durationSec < windowSec * config.MIN_ROOM) {
    return { confident: false, reason: 'this clip is already about as short as the suggestion' };
  }

  // Loudness, and voices, each clipped so one enormous bang cannot drown out
  // everything else in the sum.
  const base = shaped.z.map((x, i) => {
    const full = Math.max(0, Math.min(1, x));
    const voice = voiceShaped ? Math.max(0, Math.min(1, voiceShaped.z[i] ?? 0)) : 0;
    return Math.max(full, voice * config.VOICE_WEIGHT);
  });

  const win = Math.max(1, Math.round(Math.min(windowSec, durationSec * 0.8) / HOP));
  if (win >= n) return { confident: false, reason: 'this clip is too short to suggest anything' };

  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + base[i]);

  // Windows scored on their own content, then tilted towards the end.
  const scored = [];
  for (let i = 0; i + win <= n; i++) {
    const mean = (prefix[i + win] - prefix[i]) / win;
    const centre = (i + win / 2) / n;
    const lateness = Math.max(0, centre - (1 - config.RECENCY_TAIL)) / config.RECENCY_TAIL;
    scored.push({ i, mean, weighted: mean * (1 + config.RECENCY_WEIGHT * lateness) });
  }

  let best = scored[0];
  for (const s of scored) if (s.weighted > best.weighted) best = s;

  // The best window that shares nothing with the winner. If it is nearly as
  // good, the clip has several equally interesting moments — or none.
  let rival = null;
  for (const s of scored) {
    if (s.i + win <= best.i || s.i >= best.i + win) {
      if (!rival || s.weighted > rival.weighted) rival = s;
    }
  }

  const margin = rival ? best.weighted - rival.weighted : best.weighted;

  // The loudest moment inside the winner, in LU over the clip's own normal.
  let peakIndex = best.i;
  for (let i = best.i; i < best.i + win; i++) if (shaped.z[i] > shaped.z[peakIndex]) peakIndex = i;
  const peakLiftLu = (clip.full[peakIndex] - shaped.median);

  // A rise rather than a level: the peak against the quiet floor of the three
  // seconds before it. Constant gunfire has a high level and no rise.
  //
  // The floor is a low percentile rather than the minimum, and samples below
  // the silence threshold are skipped: `ebur128` ramps up from about -120 LUFS
  // over its first frames, so a minimum taken naively reports a rise of a
  // hundred LU on every clip whose peak is near the start.
  const before = [];
  for (let i = Math.max(0, peakIndex - 30); i < peakIndex; i++) {
    if (clip.full[i] > SILENCE) before.push(clip.full[i]);
  }
  before.sort((a, b) => a - b);
  const floorBefore = before.length ? before[Math.floor(before.length * 0.2)] : null;
  const riseLu = floorBefore === null ? 0 : clip.full[peakIndex] - floorBefore;

  const reasons = [];
  if (shaped.spreadLu < config.MIN_SPREAD_LU) reasons.push('flat');
  if (peakLiftLu < config.MIN_PEAK_LIFT_LU) reasons.push('no lift');
  if (riseLu < config.MIN_RISE_LU) reasons.push('no rise');
  if (margin < config.MIN_MARGIN) reasons.push('no margin');

  const confident = reasons.length === 0;

  // Placement: open a beat before the loud part starts, but never slide so far
  // that the loud part falls out of the window, and keep a moment after the
  // peak when the peak is near the end of the clip.
  let onset = peakIndex;
  const peakZ = shaped.z[peakIndex];
  while (onset > best.i && shaped.z[onset - 1] >= peakZ * config.ONSET_FRACTION) onset--;

  const onsetSec = clip.t0 + onset * HOP;
  const peakSec = clip.t0 + peakIndex * HOP;
  const length = win * HOP;

  let start = Math.min(clip.t0 + best.i * HOP, onsetSec - config.LEAD_IN);
  start = Math.max(0, start);
  let end = Math.min(durationSec, start + length);
  // The peak must stay inside, with a little room after it.
  if (end < Math.min(durationSec, peakSec + config.TAIL_ROOM)) {
    end = Math.min(durationSec, peakSec + config.TAIL_ROOM);
    start = Math.max(0, end - length);
  }

  return {
    confident,
    reason: confident ? null : reasons.join(', '),
    window: { start: r(start), end: r(end) },
    peakAt: r(peakSec),
    peakLiftLu: r(peakLiftLu),
    riseLu: r(riseLu),
    margin: r(margin, 3),
    spreadLu: r(shaped.spreadLu),
  };
}

/* ----------------------------------------------------------------- v3 */

export const V3 = {
  /**
   * How far the loudest moment must stand above the clip's own normal, in
   * units of 3 × MAD.
   *
   * This is the gate that stopped the false positives, and it is the only one
   * that separated the hand-checked cases: a Battlefield menu screen (1.04), a
   * black loading screen (0.76) and a clip of nothing but settings menus (1.14)
   * all sit below it, while a helicopter crash (1.44), a firefight (1.98) and
   * two clips of people laughing over a near-static top-down game (2.15, 3.06)
   * all sit above. Absolute loudness could not do this: the menu's music swell
   * is 17 LU over its own median, larger than the crash.
   */
  MIN_PEAK_Z: 1.3,
  /** Nothing at all is happening in the sound. */
  MIN_SPREAD_LU: 6,
  /** A clip shorter than the window times this is already the highlight. */
  MIN_ROOM: 1.4,
  /** A replay buffer is saved after the thing happened. */
  RECENCY_WEIGHT: 0.45,
  RECENCY_TAIL: 0.45,
  LEAD_IN: 2.5,
  ONSET_FRACTION: 0.5,
  TAIL_ROOM: 1.5,
};

export function ruleV3(clip, windowSec = 10, config = V3) {
  const shaped = normalise(clip.full);
  if (!shaped) return { confident: false, reason: 'this clip is silent' };

  const durationSec = clip.durationSec;
  const n = shaped.z.length;

  if (durationSec < windowSec * config.MIN_ROOM) {
    return { confident: false, reason: 'this clip is already about as short as the suggestion' };
  }

  const win = Math.max(1, Math.round(Math.min(windowSec, durationSec * 0.8) / HOP));
  if (win >= n) return { confident: false, reason: 'this clip is too short to suggest anything' };

  const score = shaped.z.map((x) => Math.max(0, Math.min(1, x)));

  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + score[i]);

  let best = { i: 0, weighted: -1 };
  for (let i = 0; i + win <= n; i++) {
    const mean = (prefix[i + win] - prefix[i]) / win;
    const centre = (i + win / 2) / n;
    const lateness = Math.max(0, centre - (1 - config.RECENCY_TAIL)) / config.RECENCY_TAIL;
    const weighted = mean * (1 + config.RECENCY_WEIGHT * lateness);
    if (weighted > best.weighted) best = { i, weighted, mean };
  }

  let peakIndex = best.i;
  for (let i = best.i; i < Math.min(n, best.i + win); i++) {
    if (shaped.z[i] > shaped.z[peakIndex]) peakIndex = i;
  }

  const peakZ = shaped.z[peakIndex];
  const reasons = [];
  if (shaped.spreadLu < config.MIN_SPREAD_LU) reasons.push('flat');
  if (peakZ < config.MIN_PEAK_Z) reasons.push('nothing stands out');

  let onset = peakIndex;
  while (onset > best.i && shaped.z[onset - 1] >= peakZ * config.ONSET_FRACTION) onset--;

  const onsetSec = clip.t0 + onset * HOP;
  const peakSec = clip.t0 + peakIndex * HOP;
  const length = win * HOP;

  let start = Math.max(0, Math.min(clip.t0 + best.i * HOP, onsetSec - config.LEAD_IN));
  let end = Math.min(durationSec, start + length);
  if (end < Math.min(durationSec, peakSec + config.TAIL_ROOM)) {
    end = Math.min(durationSec, peakSec + config.TAIL_ROOM);
    start = Math.max(0, end - length);
  }

  return {
    confident: reasons.length === 0,
    reason: reasons.length ? reasons.join(', ') : null,
    window: { start: r(start), end: r(end) },
    peakAt: r(peakSec),
    peakZ: r(peakZ, 2),
    spreadLu: r(shaped.spreadLu),
  };
}
