import path from 'node:path';
import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';
import { moduleFor, type GameEvent } from '../services/highlights/registry.js';
import { readShape, sampleRegions } from '../services/highlights/vision/sample.js';
import '../services/highlights/games/index.js';

/**
 * Reading what a game put on the screen.
 *
 * Loudness can only report that a clip got loud. A kill banner is the game
 * itself confirming what happened, which is both a better anchor for where the
 * moment is and the only way a suggestion can say *why* it is being made.
 *
 * This runs only for games that have a module with boxes to watch, every
 * other clip is never decoded, which is what keeps the cost off the library as
 * a whole. For the games that do, it costs about an eighth of a second per
 * second of footage with a GPU, so a half-minute clip is around three seconds.
 * That is far more than listening, so the answer is cached beside the other
 * derived files and keyed by the clip's own mtime, a trimmed clip re-reads
 * itself, everything else reads once.
 */

/**
 * Bumped when the detection changes in a way that would give a different
 * answer for the same frames: a new template, a moved box, a different
 * threshold.
 *
 * 2: Battlefield reads deaths as well as kills, which is two new boxes and two
 * new templates. Every clip anybody had already opened held a cached answer
 * that predates them, and without this the app would have gone on reporting
 * kills only for exactly the clips its owner looks at most.
 *
 * 3: a kill banner over bright ground gets a second, high-passed reading. The
 * clip that prompted it had been opened, so its cached answer was the miss.
 */
const HUD_VERSION = 3;

/**
 * Samples a second.
 *
 * A banner holds for two or three seconds, and the rule wants two samples
 * inside one before it believes anything, so four a second leaves room to
 * spare. Raising it does not make the decode cheaper. Every frame is decoded
 * either way, but it does make the matching cost more for nothing.
 */
const FPS = 4;

export interface WatchClipHudInput {
  filePath: string;
  game: string;
  refresh?: boolean;
  signal?: AbortSignal;
}

export interface WatchClipHudOutput {
  /** False when this game has no module, or nothing could be decoded. */
  watched: boolean;
  events: GameEvent[];
  /**
   * How long the clip is, as the video stream reports it.
   *
   * Carried because the listening half gives up on a clip too short to suggest
   * anything and then knows no duration at all, while the screen may still
   * have something to point at, and a window cannot be placed without one.
   */
  durationSec: number;
}

interface Cached extends WatchClipHudOutput {
  version: number;
}

const NOTHING: WatchClipHudOutput = { watched: false, events: [], durationSec: 0 };

export class WatchClipHudAction extends BaseAction<WatchClipHudInput, WatchClipHudOutput> {
  async execute({ filePath, game, refresh = false, signal }: WatchClipHudInput): Promise<WatchClipHudOutput> {
    const module = moduleFor(game);
    if (!module?.regions || !module.watch) return NOTHING;

    const cachePath = this.cachePath(filePath);
    if (!refresh) {
      const cached = await this.readCache(cachePath, filePath);
      if (cached) {
        return { watched: cached.watched, events: cached.events, durationSec: cached.durationSec ?? 0 };
      }
    }

    const shape = await readShape(filePath);
    if (!shape || !shape.width || !shape.height) return NOTHING;
    const durationSec = shape.durationSec;

    const regions = await sampleRegions({
      filePath,
      regions: module.regions,
      fps: FPS,
      shape,
      signal,
    });
    if (!Object.keys(regions).length) return { ...NOTHING, durationSec };

    let events: GameEvent[] = [];
    try {
      events = module.watch({
        regions,
        fps: FPS,
        frameWidth: shape.width,
        frameHeight: shape.height,
        durationSec: shape.durationSec,
      });
    } catch (error) {
      // A module that throws must not take the whole suggestion down with it.
      console.error(`[hud] ${game} module failed:`, error);
      return { ...NOTHING, durationSec };
    }

    const result: WatchClipHudOutput = { watched: true, events, durationSec };
    // A failed write only costs the next caller another read.
    await fsPromises
      .writeFile(cachePath, JSON.stringify({ ...result, version: HUD_VERSION }), 'utf-8')
      .catch(() => {});
    return result;
  }

  private cachePath(filePath: string): string {
    const key =
      crypto.createHash('md5').update(`${filePath}:hud:${HUD_VERSION}`).digest('hex') + '.hud.json';
    return path.join(cacheDirFor('analysis'), key);
  }

  private async readCache(cachePath: string, filePath: string): Promise<Cached | null> {
    try {
      const [cacheStat, videoStat] = await Promise.all([
        fsPromises.stat(cachePath),
        fsPromises.stat(filePath),
      ]);
      if (cacheStat.mtimeMs < videoStat.mtimeMs || cacheStat.size === 0) return null;
      const parsed = JSON.parse(await fsPromises.readFile(cachePath, 'utf-8')) as Cached;
      return parsed.version === HUD_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }
}
