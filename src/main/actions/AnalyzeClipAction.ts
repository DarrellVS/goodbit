import { execFile } from 'node:child_process';
import { FFMPEG_PATH } from '../services/binaries.js';
import { promisify } from 'node:util';
import { BaseAction } from './BaseAction.js';
import type { SuggestedMoment } from '@shared/index.js';

const execFileAsync = promisify(execFile);
const FFMPEG = FFMPEG_PATH;

/**
 * Where the interesting part of a clip probably is, from its sound alone.
 *
 * OBS drops thirty-second replay buffers here, and the thing worth keeping is
 * some ten seconds inside them. Loudness finds it: gunfire, explosions and the
 * moment everyone starts shouting all sit well above whatever that clip calls
 * normal. One `ebur128` pass over the first audio track costs about 100 ms for
 * a thirty second clip — cheap enough to run on the whole library.
 *
 * Deliberately audio only. Scene-change detection was measured at 67 s per clip
 * in software and 9 s with GPU decode, because these are 3440x1440 AV1 files;
 * that is 100 to 700 times the cost of listening, for a signal that mostly
 * agrees with it.
 *
 * Everything is judged against the clip's own middle, so a quiet horror game
 * and a loud shooter are each measured on their own terms.
 */

/**
 * How far the loudest moment has to stand above the clip's own normal, in
 * units of 3 × MAD.
 *
 * This is what stops the suggestions being nonsense, and it was arrived at by
 * measuring, not by taste. Across 68 real recordings from 24 games, the cases
 * that had to be refused — a Battlefield menu screen whose music swells (1.04),
 * a black loading screen (0.76), half a clip of settings menus (1.14), a death
 * and respawn sequence (0.58), a quiet walk through a house (0.53) — all sit
 * below 1.3, and the cases that had to be kept — a helicopter crash (1.44), a
 * firefight (1.93), two clips of people laughing over a near-static top-down
 * game (1.68, 2.73) — all sit above it. Ten out of ten agree.
 *
 * Absolute loudness cannot do this: that menu's music swell is 17 LU above its
 * own median, *larger* than the helicopter crash. What separates them is how
 * far the moment stands out from the rest of its own clip.
 */
const MIN_PEAK_Z = 1.3;
/** Below this there is no dynamic range at all: nothing to point at. */
const MIN_SPREAD_LU = 6;
/**
 * A clip barely longer than the window is already the good bit, usually because
 * someone trimmed it to that. Offering to shave two seconds off it is noise.
 */
const MIN_ROOM = 1.4;
/** ebur128 reports momentary loudness every 100 ms. */
const HOP = 0.1;

/**
 * How much to favour the end of the clip, and how much of it counts as the end.
 *
 * A replay buffer is saved *after* something happened, so the something is near
 * the end. Measured over those same 68 clips the loudest moment falls in the
 * last tenth 24% of the time, against the 10% a uniform distribution would
 * give, and in the last 40% sixty per cent of the time. This is a thumb on the
 * scale rather than a rule: a clearly bigger event earlier still wins.
 */
const RECENCY_WEIGHT = 0.45;
const RECENCY_TAIL = 0.45;
/** Keep this much of the clip after the peak, so the payoff is not cut off. */
const TAIL_ROOM = 1.5;

/**
 * How far to start before the loud part, in seconds.
 *
 * What the sound marks is the *reaction* — the explosion, the shout, the
 * killfeed — and the thing that caused it already happened. Cutting exactly on
 * the spike drops the shot that led to it, so the window opens a beat earlier.
 */
const LEAD_IN = 2.5;
/** What counts as "the loud part has started", as a fraction of the window's own peak. */
const ONSET_FRACTION = 0.5;
/** Anything below this is silence, not a quiet moment, and would wreck the median. */
const SILENCE_LUFS = -70;

export interface AnalyzeClipInput {
  filePath: string;
  /** Length of the window to look for, in seconds. */
  windowSec?: number;
}

export interface AnalyzeClipOutput {
  analyzed: boolean;
  confident: boolean;
  reason: string | null;
  durationSec: number;
  window: { start: number; end: number } | null;
  moments: SuggestedMoment[];
  spreadLu: number;
  /** How far the loudest moment stood above the clip's own normal. */
  peakZ: number;
}

const NOTHING = (reason: string): AnalyzeClipOutput => ({
  analyzed: false,
  confident: false,
  reason,
  durationSec: 0,
  window: null,
  moments: [],
  spreadLu: 0,
  peakZ: 0,
});

export class AnalyzeClipAction extends BaseAction<AnalyzeClipInput, AnalyzeClipOutput> {
  async execute({ filePath, windowSec = 10 }: AnalyzeClipInput): Promise<AnalyzeClipOutput> {
    let stdout: string;
    try {
      const result = await execFileAsync(
        FFMPEG,
        [
          '-hide_banner', '-v', 'error', '-nostats',
          '-i', filePath,
          '-map', '0:a:0',
          '-af', 'ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M:file=-',
          '-f', 'null', '-',
        ],
        { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
      );
      stdout = result.stdout;
    } catch {
      // No audio track, an unreadable file, or ffmpeg refusing the mapping.
      return NOTHING('this clip has no sound to listen to');
    }

    const { times, loudness } = this.parse(stdout);
    if (times.length < 20) return NOTHING('this clip is too short to suggest anything');

    const durationSec = times[times.length - 1] + HOP;

    const voiced = loudness.filter((x) => x > SILENCE_LUFS).sort((a, b) => a - b);
    if (voiced.length < 10) return NOTHING('this clip is silent');

    const median = voiced[Math.floor(voiced.length / 2)];
    const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)] || 0;
    const spreadLu =
      voiced[Math.floor(voiced.length * 0.9)] - voiced[Math.floor(voiced.length * 0.1)];

    // Robust z-score, clipped to 0..1: how far above normal each moment sits.
    // MAD is floored so a nearly-flat clip cannot divide its way to a big score.
    const scale = 3 * Math.max(mad, 0.5);
    const raw = loudness.map((x) => (x - median) / scale);
    const score = raw.map((x) => Math.max(0, Math.min(1, x)));

    if (durationSec < windowSec * MIN_ROOM) {
      return NOTHING('this clip is already about as short as the suggestion');
    }

    // A window longer than the clip is meaningless; keep it inside the clip.
    const effectiveWindow = Math.min(windowSec, durationSec * 0.8);
    const win = Math.max(1, Math.round(effectiveWindow / HOP));

    const prefix = [0];
    for (let i = 0; i < score.length; i++) prefix.push(prefix[i] + score[i]);

    // Every window is judged on its own content and then tilted towards the end
    // of the clip, for the reason given at RECENCY_WEIGHT.
    let bestIndex = 0;
    let bestWeighted = -1;
    for (let i = 0; i + win <= score.length; i++) {
      const mean = (prefix[i + win] - prefix[i]) / win;
      const centre = (i + win / 2) / score.length;
      const lateness = Math.max(0, centre - (1 - RECENCY_TAIL)) / RECENCY_TAIL;
      const weighted = mean * (1 + RECENCY_WEIGHT * lateness);

      if (weighted > bestWeighted) {
        bestWeighted = weighted;
        bestIndex = i;
      }
    }

    // How far the loudest moment inside the winner stands above the clip's own
    // normal. Everything hangs off this; see MIN_PEAK_Z.
    let peakIndex = bestIndex;
    for (let i = bestIndex; i < Math.min(raw.length, bestIndex + win); i++) {
      if (raw[i] > raw[peakIndex]) peakIndex = i;
    }
    const peakZ = raw[peakIndex];

    const confident = spreadLu >= MIN_SPREAD_LU && peakZ >= MIN_PEAK_Z;

    const moments: SuggestedMoment[] = [];
    const ranked = score
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s);
    for (const { s, i } of ranked) {
      if (moments.length >= 3 || s <= 0) break;
      // Keep the three apart so they describe different moments.
      if (moments.some((m) => Math.abs(m.t - times[i]) < 3)) continue;
      moments.push({ t: round(times[i]), score: round(s, 2) });
    }
    moments.sort((a, b) => a.t - b.t);

    return {
      analyzed: true,
      confident,
      reason: confident ? null : 'nothing in this clip really stands out from the rest of it',
      durationSec: round(durationSec),
      window: confident
        ? place(
            bestIndex * HOP,
            effectiveWindow,
            durationSec,
            // The unclipped scores: a knock and an explosion both saturate at
            // 1, and asking a saturated signal where the loud part starts gets
            // you the knock.
            onsetWithin(raw, bestIndex, win) * HOP,
            peakIndex * HOP,
          )
        : null,
      moments: confident ? moments : [],
      spreadLu: round(spreadLu),
      peakZ: round(peakZ, 2),
    };
  }

  /**
   * ffmpeg prints a `frame:` line carrying the timestamp, then the metadata
   * line with the value, so the two have to be stitched back together.
   */
  private parse(text: string): { times: number[]; loudness: number[] } {
    const times: number[] = [];
    const loudness: number[] = [];
    let pendingTime: number | null = null;

    for (const line of text.split(/\r?\n/)) {
      const frame = /^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/.exec(line);
      if (frame) {
        pendingTime = Number(frame[1]);
        continue;
      }
      const value = /^lavfi\.r128\.M=(-?[\d.]+)/.exec(line);
      if (value && pendingTime !== null) {
        times.push(pendingTime);
        loudness.push(Number(value[1]));
        pendingTime = null;
      }
    }
    return { times, loudness };
  }
}

/**
 * Where the loud part starts — meaning the part that made this window win.
 *
 * Found by walking *backwards* from the loudest moment rather than forwards
 * from the window's edge. Forwards finds the first loud thing of any kind, and
 * a window that contains a door slamming and then an explosion would report the
 * door. Backwards finds the beginning of the explosion.
 *
 * Measured against the window's own peak rather than an absolute level, so it
 * means the same thing in a quiet game and a loud one.
 */
function onsetWithin(score: number[], bestIndex: number, win: number): number {
  const end = Math.min(score.length, bestIndex + win);

  let peak = 0;
  let peakIndex = bestIndex;
  for (let i = bestIndex; i < end; i++) {
    if (score[i] > peak) {
      peak = score[i];
      peakIndex = i;
    }
  }
  if (peak <= 0) return bestIndex;

  let onset = peakIndex;
  while (onset > bestIndex && score[onset - 1] >= peak * ONSET_FRACTION) onset--;
  return onset;
}

/**
 * Open the window a beat before the loud part, and do not cut off the payoff.
 *
 * The lead-in only ever moves the window as far back as the onset asks for.
 * The first version slid every window back by `LEAD_IN` unconditionally, which
 * was wrong whenever the best window already started well ahead of the action:
 * a burst at 17 s inside an 11–21 s window came back as 8.5–18.5 s, sliding off
 * the very thing it was pointing at.
 *
 * Then the window is pushed forward if it would end before the peak plus a
 * moment, which matters because the peak is so often near the end of the clip.
 *
 * Sliding rather than stretching throughout: the caller asked for a window of a
 * given length and should get one.
 */
function place(
  start: number,
  length: number,
  durationSec: number,
  onset: number,
  peak: number,
): { start: number; end: number } {
  const wanted = onset - LEAD_IN;
  let from = Math.max(0, Math.min(start, wanted));
  let end = Math.min(durationSec, from + length);

  const mustReach = Math.min(durationSec, peak + TAIL_ROOM);
  if (end < mustReach) {
    end = mustReach;
    from = Math.max(0, end - length);
  }

  return { start: round(Math.max(0, end - length)), end: round(end) };
}

function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
