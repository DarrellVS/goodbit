import { AppDataSource } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';

/**
 * How much a moment has to stand out *in this game* before it counts.
 *
 * The fixed bar treats every game the same, and games are not the same. A
 * racing game is a constant engine, so nothing ever stands far above its own
 * median; a quiet horror game is silence punctuated by stings, so everything
 * does. Measured across the library: Ride's clips peak at 0.61 above their own
 * normal at the median and never clear 0.94, while In Sound Mind's sit at 4.77
 * — which meant the fixed bar flagged *every single* In Sound Mind clip as a
 * highlight, and none of them as a rest.
 *
 * So a clip must clear the absolute floor and also beat what is ordinary for
 * its own game. Below `MIN_CLIPS` the game has not shown enough of itself and
 * only the floor applies.
 */

/** Too few clips and the median is noise rather than a description of the game. */
const MIN_CLIPS = 8;

/** Recomputed at most this often; the shape of a game does not move quickly. */
const MAX_AGE_MS = 10 * 60_000;

interface GameStats {
  medianPeakZ: number;
  clips: number;
}

const cache = new Map<string, { at: number; stats: GameStats | null }>();

/**
 * The median peak z of a game's clips, from whatever the analysis has already
 * cached. Never triggers analysis of its own: this is a description of what is
 * known, not a reason to go and listen to a hundred files.
 */
export async function gameStats(
  game: string,
  peakZOf: (filePath: string) => number | null,
): Promise<GameStats | null> {
  const found = cache.get(game);
  if (found && Date.now() - found.at < MAX_AGE_MS) return found.stats;

  let stats: GameStats | null = null;

  try {
    const clips = await AppDataSource.getRepository(Clip).find({
      where: { game },
      select: { id: true, filePath: true },
      take: 400,
    });

    const values: number[] = [];
    for (const clip of clips) {
      const z = peakZOf(clip.filePath);
      if (z !== null && Number.isFinite(z)) values.push(z);
    }

    if (values.length >= MIN_CLIPS) {
      values.sort((a, b) => a - b);
      stats = { medianPeakZ: values[Math.floor(values.length / 2)], clips: values.length };
    }
  } catch {
    // A calibration that cannot be computed simply does not apply.
  }

  cache.set(game, { at: Date.now(), stats });
  return stats;
}

/** Forget what is known about a game, so the next ask recomputes. */
export function forgetGame(game?: string): void {
  if (game) cache.delete(game);
  else cache.clear();
}
