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
import { confidentEvents, decide } from '../services/highlights/decide.js';
import { score as modelScore } from '../services/highlights/model.js';
import { gameStats } from '../services/highlights/calibration.js';
import { watchesScreen, type GameEvent } from '../services/highlights/registry.js';
import type { SuggestedGoodBit } from '@shared/index.js';

/**
 * Bumped whenever the measurement changes, so answers cached by an older one
 * are ignored rather than served for ever. The *verdict* is not cached, it is
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
 * the path and invalidated by the clip's own mtime. The same rule the
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
  /**
   * The readings sure enough to act on, best first. `events` filtered by
   * `decide.ts`'s own floor, so nobody downstream has to know what it is.
   *
   * The whole list rather than the winner, because the expensive half has
   * already run: a clip with three kills in it knows it has three, and until
   * 2.1 two of them were sorted and dropped. Each one can become a GoodBit.
   */
  anchors: GameEvent[];
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
      // A clip with no sound, or one too short for the listening half to
      // bother with, can still have a kill on screen, and that is worth
      // suggesting. The duration comes from the video stream here, because the
      // measurement that gave up never worked one out.
      const durationSec = analysis.durationSec || hud.durationSec;
      const anchors = confidentEvents(hud.events);
      const anchored = this.fromEvents(anchors, durationSec, windowSec);
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
          anchors,
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
        anchors,
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
      // Handed in rather than imported by `decide.ts`, which has to stay a
      // function of its arguments; finding a trained model means a path from
      // `electron` and a `statSync`. See the note at the top of `decide.ts`.
      score: modelScore,
    });

    // When the screen decided it, the window belongs around what the screen
    // showed, not around the loudest second, which on a clip with a kill in
    // it is often a reload or a teammate shouting somewhere else.
    const anchored = verdict.anchors.length
      ? this.placeAround(verdict.anchors, analysis.durationSec, windowSec)
      : null;

    return {
      ...analysis,
      ...(anchored ?? {}),
      confident: verdict.confident,
      reason: verdict.reason,
      evidence: verdict.evidence,
      window: verdict.confident ? (anchored?.window ?? analysis.window) : null,
      goodBits: verdict.confident ? (anchored?.goodBits ?? analysis.goodBits) : [],
      bar: Math.round(verdict.bar * 100) / 100,
      basis: verdict.basis,
      events: hud.events,
      anchors: verdict.anchors,
      watchesScreen: watches,
    };
  }

  /**
   * A window built around everything the game showed, not only the best of it.
   *
   * Same shape as the one built from sound, lead-in, the thing, a beat after,
   * with two differences that come from the screen being able to enumerate
   * what happened where the sound cannot.
   *
   * **It spans every reading.** It used to be placed around the strongest one
   * alone, so a clip with a kill at 0:04 and another at 0:22 offered a ten
   * second window over one of them and said nothing about the other, and
   * pressing *Use it* cut the second one off. Readings that belong to one
   * moment are already merged by the module, so two anchors really are two
   * things that happened, and the honest cut keeps both: from the first one's
   * lead-in to the last one's tail.
   *
   * **`windowSec` only caps a single moment.** It is the answer to "how much
   * of this clip is the good bit", which is a question about one of them. Two
   * moments twenty seconds apart are twenty seconds apart however long the
   * good bit is, and clamping there would drop one of them again, quietly.
   *
   * Every reading also becomes a suggested mark, in time order, so the row of
   * chips under the banner is the list of what was found rather than a repeat
   * of the headline.
   */
  private placeAround(
    events: GameEvent[],
    durationSec: number,
    windowSec: number,
  ): { window: { start: number; end: number }; goodBits: SuggestedGoodBit[] } | null {
    if (!durationSec || !events.length) return null;

    const inTime = [...events].sort((a, b) => a.atSec - b.atSec);
    const first = inTime[0];
    const last = inTime[inTime.length - 1];
    const until = Math.max(last.atSec, last.untilSec ?? last.atSec);
    const span = until - first.atSec;

    const room = Math.max(MIN_WINDOW_SEC, durationSec * 0.95);
    const longest = inTime.length > 1 ? room : Math.min(windowSec, room);
    const length = Math.min(longest, Math.max(MIN_WINDOW_SEC, LEAD_IN + span + TAIL_ROOM));

    return {
      window: place(length, durationSec, first.atSec, until),
      goodBits: inTime.map((event) => ({
        t: round(event.atSec),
        score: round(event.confidence, 2),
      })),
    };
  }

  /**
   * The same, for a clip that could not be listened to at all.
   *
   * Takes the already-ranked list rather than the raw events: the confidence
   * floor belongs to `decide.ts` and this had its own copy of the number,
   * which is a threshold in two places waiting to disagree.
   */
  private fromEvents(
    anchors: GameEvent[],
    durationSec: number,
    windowSec: number,
  ): {
    window: { start: number; end: number };
    goodBits: SuggestedGoodBit[];
    evidence: string;
  } | null {
    const strongest = anchors[0];
    if (!strongest) return null;
    const placed = this.placeAround(anchors, durationSec, windowSec);
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
          return fromCache(JSON.parse(await fsPromises.readFile(cachePath, 'utf-8')));
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

/**
 * A cached measurement, whatever version of this app wrote it.
 *
 * The loudest instants in a clip were called `moments` before the vocabulary
 * settled on GoodBits, and every analysis cached by a 1.x build has them under
 * the old key. `ANALYSIS_VERSION` is deliberately not bumped for this: the
 * measurement did not change, only its field name, and a bump would make every
 * clip in every library re-listen to prove the same numbers. Reading both keys
 * costs one `??`; the alternative is a jump-chip row that is silently empty on
 * exactly the clips that were analysed before the update.
 */
function fromCache(parsed: unknown): AnalyzeClipOutput {
  const cached = parsed as AnalyzeClipOutput & { moments?: SuggestedGoodBit[] };
  return { ...cached, goodBits: cached.goodBits ?? cached.moments ?? [] };
}
