import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import {
  AnalyzeClipAction,
  LEAD_IN,
  MIN_WINDOW_SEC,
  TAIL_ROOM,
  place,
  round,
  type AnalyzeClipOutput,
} from './AnalyzeClipAction.js';
import { WatchClipHudAction } from './WatchClipHudAction.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';
import { decide } from '../services/highlights/decide.js';
import { gameStats } from '../services/highlights/calibration.js';
import { watchesScreen, type GameEvent } from '../services/highlights/registry.js';
import type { SuggestedMoment } from '@shared/index.js';

/**
 * Bumped whenever the measurement changes, so answers cached by an older one
 * are ignored rather than served for ever. The *verdict* is not cached — it is
 * recomputed every time from the cached measurement, so a change to the bar or
 * a newly trained model takes effect without re-listening to anything.
 */
const ANALYSIS_VERSION = 4;

export type EnsureClipSuggestionsInput = { clipId: number; windowSec?: number; refresh?: boolean };

/**
 * What the Trim page and the editor actually ask for: a measurement from cache,
 * and a verdict computed fresh on top of it.
 *
 * A listen is cheap but not free, and the Trim page asks for it on every open.
 * The cache sits with the other derived files under `.goodbit-cache/`, keyed by
 * the path and invalidated by the clip's own mtime — the same rule the
 * thumbnails use, so a trimmed-and-swapped clip re-analyses on its own.
 */
export interface SuggestionResult extends AnalyzeClipOutput {
  confident: boolean;
  /** What the moment had to clear, after the game's own calibration. */
  bar: number;
  basis: 'rule' | 'model' | 'hud';
  /** Why this is being suggested, when the grounds are worth saying. */
  evidence: string | null;
  /** What the game itself showed, for a game whose HUD is readable. */
  events: GameEvent[];
  /** True while this game's clips get their screen read as well as heard. */
  watchesScreen: boolean;
}

export class EnsureClipSuggestionsAction extends BaseAction<
  EnsureClipSuggestionsInput,
  SuggestionResult
> {
  async execute({
    clipId,
    windowSec = 10,
    refresh = false,
  }: EnsureClipSuggestionsInput): Promise<SuggestionResult> {
    const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id: clipId });

    const watches = watchesScreen(clip.game);

    // Listening is a tenth of a second and reading the screen is three, so both
    // start together rather than one after the other.
    const [analysis, hud] = await Promise.all([
      this.measure(clip.filePath, windowSec, refresh),
      watches
        ? new WatchClipHudAction()
            .execute({ filePath: clip.filePath, game: clip.game, refresh })
            .catch(() => ({ watched: false, events: [] as GameEvent[], durationSec: 0 }))
        : Promise.resolve({ watched: false, events: [] as GameEvent[], durationSec: 0 }),
    ]);

    if (!analysis.analyzed || !analysis.features) {
      // A clip with no sound — or one too short for the listening half to
      // bother with — can still have a kill on screen, and that is worth
      // suggesting. The duration comes from the video stream here, because the
      // measurement that gave up never worked one out.
      const durationSec = analysis.durationSec || hud.durationSec;
      const anchored = this.fromEvents(hud.events, durationSec, windowSec);
      if (anchored) {
        return {
          ...analysis,
          ...anchored,
          durationSec,
          confident: true,
          reason: null,
          bar: 0,
          basis: 'hud',
          events: hud.events,
          watchesScreen: watches,
        };
      }
      return {
        ...analysis,
        confident: false,
        bar: 0,
        basis: 'rule',
        evidence: null,
        events: hud.events,
        watchesScreen: watches,
      };
    }

    // What is ordinary for this game, from what has already been measured.
    // Never causes a listen of its own.
    const stats = await gameStats(clip.game, (filePath) =>
      this.cachedPeakZ(filePath, windowSec),
    );

    const verdict = decide({
      features: analysis.features,
      game: clip.game,
      gameMedianPeakZ: stats?.medianPeakZ ?? null,
      events: hud.events,
    });

    // When the screen decided it, the window belongs around what the screen
    // showed — not around the loudest second, which on a clip with a kill in
    // it is often a reload or a teammate shouting somewhere else.
    const anchored =
      verdict.anchor && this.placeAround(verdict.anchor, analysis.durationSec, windowSec);

    return {
      ...analysis,
      ...(anchored ?? {}),
      confident: verdict.confident,
      reason: verdict.reason,
      evidence: verdict.evidence,
      window: verdict.confident ? (anchored?.window ?? analysis.window) : null,
      moments: verdict.confident ? (anchored?.moments ?? analysis.moments) : [],
      bar: Math.round(verdict.bar * 100) / 100,
      basis: verdict.basis,
      events: hud.events,
      watchesScreen: watches,
    };
  }

  /**
   * A window built around something the game showed.
   *
   * Same shape as the one built from sound — lead-in, the thing, a beat after
   * — but the "thing" is however long the event took, so three kills in nine
   * seconds produce a window that holds all three.
   */
  private placeAround(
    event: GameEvent,
    durationSec: number,
    windowSec: number,
  ): { window: { start: number; end: number }; moments: SuggestedMoment[] } | null {
    if (!durationSec) return null;
    const until = Math.max(event.atSec, event.untilSec ?? event.atSec);
    const span = until - event.atSec;

    const longest = Math.min(windowSec, Math.max(MIN_WINDOW_SEC, durationSec * 0.95));
    const length = Math.min(longest, Math.max(MIN_WINDOW_SEC, LEAD_IN + span + TAIL_ROOM));

    return {
      window: place(length, durationSec, event.atSec, until),
      moments: [{ t: round(event.atSec), score: round(event.confidence, 2) }],
    };
  }

  /** The same, for a clip that could not be listened to at all. */
  private fromEvents(
    events: GameEvent[],
    durationSec: number,
    windowSec: number,
  ): { window: { start: number; end: number }; moments: SuggestedMoment[]; evidence: string } | null {
    const strongest = events.filter((e) => e.confidence >= 0.8).sort((a, b) => b.confidence - a.confidence)[0];
    if (!strongest) return null;
    const placed = this.placeAround(strongest, durationSec, windowSec);
    return placed ? { ...placed, evidence: strongest.reason } : null;
  }

  private cachePath(filePath: string, windowSec: number): string {
    const key =
      crypto
        .createHash('md5')
        .update(`${filePath}:${windowSec}:${ANALYSIS_VERSION}`)
        .digest('hex') + '.json';
    return path.join(cacheDirFor('analysis'), key);
  }

  private async measure(
    filePath: string,
    windowSec: number,
    refresh: boolean,
  ): Promise<AnalyzeClipOutput> {
    const cachePath = this.cachePath(filePath, windowSec);

    if (!refresh) {
      try {
        const [cStat, vStat] = await Promise.all([
          fsPromises.stat(cachePath),
          fsPromises.stat(filePath),
        ]);
        if (cStat.mtimeMs >= vStat.mtimeMs && cStat.size > 0) {
          return JSON.parse(await fsPromises.readFile(cachePath, 'utf-8')) as AnalyzeClipOutput;
        }
      } catch {
        /* no usable cache; fall through and listen */
      }
    }

    const result = await new AnalyzeClipAction().execute({ filePath, windowSec });

    // A failed write only costs the next caller another listen.
    await fsPromises.writeFile(cachePath, JSON.stringify(result), 'utf-8').catch(() => {});

    return result;
  }

  /**
   * The peak of a clip that has already been listened to, or nothing.
   *
   * Synchronous and deliberately incurious: calibration describes what is
   * known about a game, and must never turn into a hundred ffmpeg passes.
   */
  private cachedPeakZ(filePath: string, windowSec: number): number | null {
    try {
      const cached = JSON.parse(
        readFileSync(this.cachePath(filePath, windowSec), 'utf-8'),
      ) as AnalyzeClipOutput;
      return cached.analyzed && cached.features ? cached.features.peakZ : null;
    } catch {
      return null;
    }
  }
}
