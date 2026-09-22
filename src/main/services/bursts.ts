/**
 * Several clips of one moment, because the key was pressed three times.
 *
 * The replay buffer holds the last thirty seconds, so pressing the key twice
 * ten seconds apart writes two files with twenty seconds of the same footage in
 * both. Nobody does that on purpose; it happens because the first press did not
 * obviously work, or because the thing kept being good. What lands is three
 * copies of one play, at a few hundred megabytes each.
 *
 * **The clustering is here, as a pure function over timestamps, and
 * deliberately not in SQL.** A self-join gives *pairs*: three clips sixty
 * seconds apart produce two pairs that both have to be merged into one cluster
 * of three, and a fourth clip produces three. Doing that merge in SQL is a
 * recursive CTE for something that is one pass over an ordered list, and the
 * off-by-one in it would be invisible, because a wrongly split cluster looks
 * exactly like two real bursts.
 *
 * `tests/unit/main/bursts.spec.ts` owns the rules.
 */

export interface BurstCandidate {
  id: number;
  game: string;
  /** Milliseconds. The caller resolves which date this is; see below. */
  recordedAtMs: number | null;
  durationSec?: number | null;
  sizeBytes: number;
}

export interface BurstCluster<T extends BurstCandidate = BurstCandidate> {
  game: string;
  /** Oldest first, which is the order they were saved in. */
  clips: T[];
  /** Seconds from the first clip of the burst to the last. */
  spanSec: number;
  /** What deleting everything but the keeper would give back. */
  reclaimableBytes: number;
  /**
   * The longest clip, pre-selected as the one to keep.
   *
   * A suggestion, not a decision: it is right often enough to save the work of
   * choosing and wrong often enough that the screen has to let somebody change
   * it in one press. The others are about to be destroyed, so a guess presented
   * as an answer is the wrong shape entirely.
   */
  suggestedKeeperId: number;
}

/** Ninety seconds. Two presses further apart than this are two moments. */
export const DEFAULT_BURST_WINDOW_SEC = 90;

/**
 * Group clips saved within `windowSec` of each other, per game.
 *
 * The gap is measured between *consecutive* clips, not from the first one, so
 * five presses sixty seconds apart are one burst of five rather than a burst
 * of two and three singles. That is the right answer: it is one sitting, and
 * the footage overlaps all the way along.
 *
 * A clip with no timestamp is dropped rather than guessed at. `recordedAt` is
 * nullable, and a clip whose date is unknown cannot be said to be near another
 * one; putting it in a cluster would offer to delete it on the strength of a
 * value that is not there.
 *
 * Clusters of one are not bursts and are not returned.
 */
export function findBursts<T extends BurstCandidate>(
  clips: readonly T[],
  windowSec: number = DEFAULT_BURST_WINDOW_SEC,
): BurstCluster<T>[] {
  const windowMs = Math.max(1, windowSec) * 1000;

  const byGame = new Map<string, T[]>();
  for (const clip of clips) {
    if (clip.recordedAtMs === null || !Number.isFinite(clip.recordedAtMs)) continue;
    const list = byGame.get(clip.game);
    if (list) list.push(clip);
    else byGame.set(clip.game, [clip]);
  }

  const clusters: BurstCluster<T>[] = [];

  for (const [game, list] of byGame) {
    // Oldest first, and by id where two clips share a millisecond, so the
    // result is stable rather than dependent on what the database returned.
    const ordered = [...list].sort(
      (a, b) => a.recordedAtMs! - b.recordedAtMs! || a.id - b.id,
    );

    let run: T[] = [];

    const flush = (): void => {
      if (run.length > 1) clusters.push(describe(game, run));
      run = [];
    };

    for (const clip of ordered) {
      const previous = run[run.length - 1];
      if (previous && clip.recordedAtMs! - previous.recordedAtMs! > windowMs) flush();
      run.push(clip);
    }
    flush();
  }

  // Biggest saving first: this screen exists to free space, so the cluster
  // worth acting on should not be somewhere down the page.
  return clusters.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
}

function describe<T extends BurstCandidate>(game: string, run: T[]): BurstCluster<T> {
  const keeper = run.reduce((best, clip) =>
    (clip.durationSec ?? 0) > (best.durationSec ?? 0) ? clip : best,
  );

  const total = run.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0);

  return {
    game,
    clips: run,
    spanSec: (run[run.length - 1].recordedAtMs! - run[0].recordedAtMs!) / 1000,
    // What keeping one of them gives back, which is the number this screen is
    // about. Not the total, which would promise space that keeping a clip does
    // not free.
    reclaimableBytes: total - (keeper.sizeBytes || 0),
    suggestedKeeperId: keeper.id,
  };
}
