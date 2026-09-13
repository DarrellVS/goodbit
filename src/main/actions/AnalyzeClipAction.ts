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

/** How far apart the quiet and loud parts must be before a clip has anything to say, in LU. */
const MIN_SPREAD_LU = 4;
/** How much better than average the window must be. Below this it is not pointing at anything. */
const MIN_LIFT = 0.08;
/** ebur128 reports momentary loudness every 100 ms. */
const HOP = 0.1;

/**
 * How far to start before the loud part, in seconds.
 *
 * What the sound marks is the *reaction* — the explosion, the shout, the
 * killfeed — and the thing that caused it already happened. Cutting exactly on
 * the spike drops the shot that led to it, so the window opens a beat earlier.
 */
const LEAD_IN = 2.5;
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
  lift: number;
}

const NOTHING = (reason: string): AnalyzeClipOutput => ({
  analyzed: false,
  confident: false,
  reason,
  durationSec: 0,
  window: null,
  moments: [],
  spreadLu: 0,
  lift: 0,
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
    const score = loudness.map((x) => Math.max(0, Math.min(1, (x - median) / scale)));

    // A window longer than the clip is meaningless; keep it inside the clip.
    const effectiveWindow = Math.min(windowSec, durationSec * 0.8);
    const win = Math.max(1, Math.round(effectiveWindow / HOP));

    const prefix = [0];
    for (let i = 0; i < score.length; i++) prefix.push(prefix[i] + score[i]);

    let bestIndex = 0;
    let bestSum = -1;
    for (let i = 0; i + win <= score.length; i++) {
      const sum = prefix[i + win] - prefix[i];
      if (sum > bestSum) {
        bestSum = sum;
        bestIndex = i;
      }
    }

    const meanScore = bestSum / win;
    const overallMean = score.reduce((a, b) => a + b, 0) / score.length;
    // Is the window actually better than just taking the clip as it comes?
    const lift = meanScore - overallMean;
    const confident = spreadLu >= MIN_SPREAD_LU && lift >= MIN_LIFT;

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
      reason: confident ? null : 'the sound of this clip never really changes',
      durationSec: round(durationSec),
      window: confident ? withLeadIn(bestIndex * HOP, effectiveWindow, durationSec) : null,
      moments: confident ? moments : [],
      spreadLu: round(spreadLu),
      lift: round(lift, 3),
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
 * Open the window a beat before the loud part, keeping its length.
 *
 * Sliding rather than stretching: the caller asked for a window of a given
 * length and should get one. Pushed back up against the end of the clip when
 * there is not enough room in front.
 */
function withLeadIn(
  start: number,
  length: number,
  durationSec: number,
): { start: number; end: number } {
  const shifted = Math.max(0, start - LEAD_IN);
  const end = Math.min(durationSec, shifted + length);

  return { start: round(Math.max(0, end - length)), end: round(end) };
}

function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
