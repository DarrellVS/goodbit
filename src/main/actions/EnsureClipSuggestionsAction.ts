import path from 'node:path';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { AnalyzeClipAction, type AnalyzeClipOutput } from './AnalyzeClipAction.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';

/**
 * Bumped whenever the rule changes, so cached answers from an older one are
 * ignored rather than served for ever.
 */
const ANALYSIS_VERSION = 3;

export type EnsureClipSuggestionsInput = { clipId: number; windowSec?: number; refresh?: boolean };

/**
 * The analysis of a clip, from cache when the file has not changed.
 *
 * A listen is cheap but not free, and the Trim page asks for it on every open.
 * The cache sits with the other derived files under `.goodbit-cache/`, keyed by
 * the path and invalidated by the clip's own mtime — the same rule the
 * thumbnails use, so a trimmed-and-swapped clip re-analyses on its own.
 */
export class EnsureClipSuggestionsAction extends BaseAction<
  EnsureClipSuggestionsInput,
  AnalyzeClipOutput
> {
  async execute({ clipId, windowSec = 10, refresh = false }: EnsureClipSuggestionsInput): Promise<AnalyzeClipOutput> {
    const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id: clipId });

    const cacheDir = cacheDirFor('analysis');
    // The window length is part of the key: a 5 s and a 10 s answer are
    // different answers about the same clip. So is the version of the rule —
    // an answer cached by an older one is not an answer to the same question,
    // and without this a change to the analysis is invisible until every file's
    // mtime happens to change.
    const key =
      crypto
        .createHash('md5')
        .update(`${clip.filePath}:${windowSec}:${ANALYSIS_VERSION}`)
        .digest('hex') + '.json';
    const cachePath = path.join(cacheDir, key);

    if (!refresh) {
      try {
        const [cStat, vStat] = await Promise.all([
          fsPromises.stat(cachePath),
          fsPromises.stat(clip.filePath),
        ]);
        if (cStat.mtimeMs >= vStat.mtimeMs && cStat.size > 0) {
          return JSON.parse(await fsPromises.readFile(cachePath, 'utf-8')) as AnalyzeClipOutput;
        }
      } catch {
        /* no usable cache; fall through and analyse */
      }
    }

    const result = await new AnalyzeClipAction().execute({
      filePath: clip.filePath,
      windowSec,
    });

    // A failed write only costs the next caller another listen.
    await fsPromises.writeFile(cachePath, JSON.stringify(result), 'utf-8').catch(() => {});

    return result;
  }
}
