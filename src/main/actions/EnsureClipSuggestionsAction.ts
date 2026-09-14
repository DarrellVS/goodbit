import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { AnalyzeClipAction, type AnalyzeClipOutput } from './AnalyzeClipAction.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';
import { decide } from '../services/highlights/decide.js';
import { gameStats } from '../services/highlights/calibration.js';

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
  basis: 'rule' | 'model';
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

    const analysis = await this.measure(clip.filePath, windowSec, refresh);

    if (!analysis.analyzed || !analysis.features) {
      return { ...analysis, confident: false, bar: 0, basis: 'rule' };
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
    });

    return {
      ...analysis,
      confident: verdict.confident,
      reason: verdict.reason,
      window: verdict.confident ? analysis.window : null,
      moments: verdict.confident ? analysis.moments : [],
      bar: Math.round(verdict.bar * 100) / 100,
      basis: verdict.basis,
    };
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
