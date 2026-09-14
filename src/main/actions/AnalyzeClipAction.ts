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
 * How long a moment is, for ranking.
 *
 * Not a single 100 ms sample, which lets one door slam beat a firefight, and
 * not the whole window, which was the bug this replaced.
 */
const MOMENT_SEC = 1.5;

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

    const n = raw.length;
    const prefix = [0];
    for (let i = 0; i < n; i++) prefix.push(prefix[i] + raw[i]);

    // Find the moment, then build the window around it.
    //
    // The previous version scored every possible ten second window by its mean
    // and took the best, which asks a question about averages when the thing
    // being looked for is a spike: a long mild stretch beats a short loud one.
    // A clip of Unrailed peaks at 2.15 around 24 s and idles near 1.5 from 4 to
    // 8 s, and the window mean preferred the idle — the suggestion opened on
    // nothing while the moment everyone reacted to sat outside it.
    const span = Math.max(1, Math.round(MOMENT_SEC / HOP));
    const moment: number[] = [];
    for (let i = 0; i < n; i++) {
      const from = Math.max(0, i - Math.floor(span / 2));
      const to = Math.min(n, from + span);
      moment.push((prefix[to] - prefix[from]) / (to - from));
    }

    // The same thumb on the scale as before, applied to the moment rather than
    // to a window average. See RECENCY_WEIGHT.
    let bestIndex = 0;
    let bestWeighted = -Infinity;
    for (let i = 0; i < n; i++) {
      const position = i / n;
      const lateness = Math.max(0, position - (1 - RECENCY_TAIL)) / RECENCY_TAIL;
      const weighted = moment[i] * (1 + RECENCY_WEIGHT * lateness);

      if (weighted > bestWeighted) {
        bestWeighted = weighted;
        bestIndex = i;
      }
    }

    // The loudest instant inside that moment is what the window is built
    // around. Everything hangs off how far it stands out; see MIN_PEAK_Z.
    let peakIndex = bestIndex;
    for (let i = Math.max(0, bestIndex - span); i < Math.min(n, bestIndex + span); i++) {
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
            effectiveWindow,
            durationSec,
            // The unclipped scores: a knock and an explosion both saturate at
            // 1, and asking a saturated signal where the loud part starts gets
            // you the knock.
            onsetBefore(raw, peakIndex) * HOP,
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
 * Where the loud part starts.
 *
 * Found by walking *backwards* from the loudest instant. Forwards from some
 * earlier edge finds the first loud thing of any kind, so a stretch containing a
 * door slamming and then an explosion would report the door. Backwards finds
 * the beginning of the explosion.
 *
 * Measured against the peak itself rather than an absolute level, so it means
 * the same thing in a quiet game and a loud one.
 */
function onsetBefore(score: number[], peakIndex: number): number {
  const peak = score[peakIndex];
  if (!(peak > 0)) return peakIndex;

  let onset = peakIndex;
  while (onset > 0 && score[onset - 1] >= peak * ONSET_FRACTION) onset--;
  return onset;
}

/**
 * Open the window a beat before the loud part, and never cut off the payoff.
 *
 * Three things have to hold at once: the window opens `LEAD_IN` before the
 * sound starts, because the sound is the reaction and its cause came first; the
 * peak plus a moment stays inside it, because the peak is so often near the end
 * of the clip; and it is the length that was asked for, sliding back off the end
 * of the clip when there is no room in front of it.
 *
 * That last one was missing and produced three second suggestions on clips
 * whose moment was at the very end.
 */
function place(
  length: number,
  durationSec: number,
  onset: number,
  peak: number,
): { start: number; end: number } {
  let end = Math.min(durationSec, Math.max(0, onset - LEAD_IN) + length);
  end = Math.max(end, Math.min(durationSec, peak + TAIL_ROOM));

  return { start: round(Math.max(0, end - length)), end: round(end) };
}

function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
