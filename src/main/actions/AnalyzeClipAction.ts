import { execFile } from 'node:child_process';
import { FFMPEG_PATH } from '../services/binaries.js';
import { promisify } from 'node:util';
import { BaseAction } from './BaseAction.js';
import type { SuggestedMoment } from '@shared/index.js';
import {
  describe,
  findMoment,
  shape,
  HOP,
  type HighlightFeatures,
} from '../services/highlights/features.js';

const execFileAsync = promisify(execFile);
const FFMPEG = FFMPEG_PATH;

/**
 * Where the interesting part of a clip probably is, from its sound alone.
 *
 * OBS drops thirty-second replay buffers here, and the thing worth keeping is a
 * handful of seconds inside them. Loudness finds it: gunfire, explosions and the
 * moment everyone starts shouting all sit well above whatever that clip calls
 * normal. One `ebur128` pass over the first audio track costs about 100 ms for
 * a thirty second clip, cheap enough to run on the whole library.
 *
 * This measures; it does not judge. Whether the moment is worth suggesting is
 * decided in `services/highlights/decide.ts`, because that answer depends on
 * the game and on any trained model, and both can change without the audio
 * changing. Keeping them apart is what lets the expensive half stay cached.
 *
 * Audio only, and on purpose: it runs on every clip in the library, so it has
 * to stay at a tenth of a second. Looking at pixels costs thirty times that
 * even with the GPU decoding, which is why it happens in `WatchClipHudAction`
 * instead and only for games whose HUD a module knows how to read.
 *
 * An AudioSet tagger (YAMNet) was tried here and is not used: on 88 real clips
 * its classes did not separate the moments worth keeping from the rest, and
 * its strongest `Gunshot`/`Explosion` frame disagreed with the loudness peak on
 * every single accepted clip. `scripts/analysis-tags.mjs` keeps that experiment
 * runnable rather than repeatable by accident.
 */

/**
 * A clip barely longer than the window is already the good bit, usually because
 * someone trimmed it to that. Offering to shave two seconds off it is noise.
 */
export const MIN_ROOM = 1.4;

/**
 * How far to start before the loud part, in seconds.
 *
 * What the sound marks is the *reaction*. The explosion, the shout, the
 * killfeed, and the thing that caused it already happened. Cutting exactly on
 * the spike drops the shot that led to it, so the window opens a beat earlier.
 */
export const LEAD_IN = 2.5;

/** Keep this much of the clip after the peak, so the payoff is not cut off. */
export const TAIL_ROOM = 1.5;

/**
 * The shortest suggestion worth making, in seconds.
 *
 * The window used to be a flat ten seconds, which on a clip whose moment sits
 * near the end means the whole suggestion is the walk up to it: one Battlefield
 * clip with its event at 24.4–25.4 s of a 26.4 s recording came back as
 * 16.4–26.4, eight seconds of nothing followed by the thing.
 *
 * The event itself is short, measured across the accepted clips, a median of
 * 1.0 s above half its own peak, so the length is the lead-in, the event and
 * the tail, floored here. Six is enough for a run-up, the thing, and a beat
 * after it; below that it reads as a jump cut.
 */
export const MIN_WINDOW_SEC = 6;

export interface AnalyzeClipInput {
  filePath: string;
  /** The longest a suggestion may be, in seconds. Shorter ones are normal. */
  windowSec?: number;
}

export interface AnalyzeClipOutput {
  analyzed: boolean;
  /** Set only when the clip could not be measured at all. */
  reason: string | null;
  durationSec: number;
  /** The best candidate, whether or not it turns out to be worth suggesting. */
  window: { start: number; end: number } | null;
  moments: SuggestedMoment[];
  features: HighlightFeatures | null;
  spreadLu: number;
  /** How far the loudest moment stood above the clip's own normal. */
  peakZ: number;
  /** How long the loud part lasted, which sets how long the suggestion is. */
  eventSec: number;
}

const NOTHING = (reason: string): AnalyzeClipOutput => ({
  analyzed: false,
  reason,
  durationSec: 0,
  window: null,
  moments: [],
  features: null,
  spreadLu: 0,
  peakZ: 0,
  eventSec: 0,
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
    if (durationSec < windowSec * MIN_ROOM) {
      return NOTHING('this clip is already about as short as the suggestion');
    }

    const shaped = shape(loudness);
    if (!shaped) return NOTHING('this clip is silent');

    const candidate = findMoment(shaped.z);
    const features = describe(shaped, candidate, durationSec);

    // A window longer than the clip is meaningless; keep it inside the clip.
    const longest = Math.min(windowSec, durationSec * 0.8);
    const length = Math.min(
      longest,
      Math.max(MIN_WINDOW_SEC, LEAD_IN + features.eventSec + TAIL_ROOM),
    );

    const moments: SuggestedMoment[] = [];
    const ranked = shaped.z
      .map((z, i) => ({ s: Math.max(0, Math.min(1, z)), i }))
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
      reason: null,
      durationSec: round(durationSec),
      window: place(length, durationSec, candidate.onsetIndex * HOP, candidate.peakIndex * HOP),
      moments,
      features,
      spreadLu: round(shaped.spreadLu),
      peakZ: round(features.peakZ, 2),
      eventSec: round(features.eventSec),
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
export function place(
  length: number,
  durationSec: number,
  onset: number,
  peak: number,
): { start: number; end: number } {
  let end = Math.min(durationSec, Math.max(0, onset - LEAD_IN) + length);
  end = Math.max(end, Math.min(durationSec, peak + TAIL_ROOM));

  return { start: round(Math.max(0, end - length)), end: round(end) };
}

export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
