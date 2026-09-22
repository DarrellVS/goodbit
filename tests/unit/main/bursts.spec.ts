import { describe, expect, it } from 'vitest';
import { DEFAULT_BURST_WINDOW_SEC, findBursts } from '../../../src/main/services/bursts.js';

/**
 * Three clips of one moment, because the key was pressed three times.
 *
 * The subtle bug this exists to catch is the merge. A self-join in SQL gives
 * pairs, and three clips sixty seconds apart produce two pairs that both have
 * to become one cluster of three; a fourth produces three pairs. Getting that
 * wrong is invisible on screen, because a cluster split in two looks exactly
 * like two real bursts, and what is on offer is deleting somebody's
 * recordings.
 */

let nextId = 1;

function clip(
  overrides: { at?: number | null; game?: string; durationSec?: number; sizeBytes?: number } = {},
) {
  return {
    id: nextId++,
    game: overrides.game ?? 'Battlefield 6',
    recordedAtMs: overrides.at === undefined ? 0 : overrides.at,
    durationSec: overrides.durationSec ?? 30,
    sizeBytes: overrides.sizeBytes ?? 100,
  };
}

const seconds = (n: number): number => n * 1000;

describe('findBursts', () => {
  it('groups presses that overlap into one cluster, not into pairs', () => {
    // The merge. Sixty seconds apart each time, so every consecutive gap is
    // inside the window and all three are one sitting.
    const a = clip({ at: seconds(0) });
    const b = clip({ at: seconds(60) });
    const c = clip({ at: seconds(120) });

    const [burst, ...rest] = findBursts([a, b, c]);

    expect(rest).toEqual([]);
    expect(burst.clips.map((entry) => entry.id)).toEqual([a.id, b.id, c.id]);
    expect(burst.spanSec).toBe(120);
  });

  it('measures the gap between consecutive clips, not from the first', () => {
    // Five presses a minute apart is one sitting with overlapping footage all
    // the way along. Measured from the first clip it would be a burst of two
    // and three clips nobody is offered.
    const clips = [0, 60, 120, 180, 240].map((at) => clip({ at: seconds(at) }));

    const [burst] = findBursts(clips);
    expect(burst.clips).toHaveLength(5);
  });

  it('splits when the gap is longer than the window', () => {
    const a = clip({ at: seconds(0) });
    const b = clip({ at: seconds(30) });
    const c = clip({ at: seconds(300) });
    const d = clip({ at: seconds(330) });

    const bursts = findBursts([a, b, c, d]);

    expect(bursts).toHaveLength(2);
    expect(bursts.map((burst) => burst.clips.length)).toEqual([2, 2]);
  });

  it('treats a gap exactly at the window as still one burst', () => {
    // A boundary worth pinning. Somebody who sets the window to ninety seconds
    // means "ninety seconds counts", and a `>=` here would quietly make it
    // eighty-nine.
    const a = clip({ at: 0 });
    const b = clip({ at: seconds(DEFAULT_BURST_WINDOW_SEC) });

    expect(findBursts([a, b])).toHaveLength(1);
    expect(findBursts([a, clip({ at: seconds(DEFAULT_BURST_WINDOW_SEC) + 1 })])).toHaveLength(0);
  });

  it('never crosses games, however close the timestamps are', () => {
    // Two games recorded a minute apart is alt-tabbing, not a burst, and the
    // footage has nothing in common.
    const a = clip({ at: 0, game: 'Battlefield 6' });
    const b = clip({ at: seconds(10), game: 'Helldivers 2' });

    expect(findBursts([a, b])).toEqual([]);
  });

  it('drops a clip with no date rather than guessing where it belongs', () => {
    // `recordedAt` is nullable. A clip whose date is unknown cannot be said to
    // be near another one, and putting it in a cluster offers to delete it on
    // the strength of a value that is not there.
    const a = clip({ at: 0 });
    const b = clip({ at: seconds(10) });
    const undated = clip({ at: null });

    const [burst] = findBursts([a, b, undated]);
    expect(burst.clips.map((entry) => entry.id)).toEqual([a.id, b.id]);
  });

  it('does not call a single clip a burst', () => {
    expect(findBursts([clip({ at: 0 })])).toEqual([]);
    expect(findBursts([])).toEqual([]);
  });

  it('suggests the longest clip as the keeper', () => {
    const short = clip({ at: 0, durationSec: 12 });
    const long = clip({ at: seconds(20), durationSec: 41 });
    const middling = clip({ at: seconds(40), durationSec: 30 });

    const [burst] = findBursts([short, long, middling]);
    expect(burst.suggestedKeeperId).toBe(long.id);
  });

  it('counts what keeping one of them gives back, not the whole cluster', () => {
    // The number on screen is a promise about disk space. The total would
    // promise bytes that keeping a clip does not free.
    const keeper = clip({ at: 0, durationSec: 60, sizeBytes: 500 });
    const a = clip({ at: seconds(10), durationSec: 30, sizeBytes: 200 });
    const b = clip({ at: seconds(20), durationSec: 30, sizeBytes: 300 });

    const [burst] = findBursts([keeper, a, b]);
    expect(burst.reclaimableBytes).toBe(500);
  });

  it('puts the biggest saving first, since that is what the screen is for', () => {
    const small = [
      clip({ at: 0, game: 'A', sizeBytes: 10 }),
      clip({ at: seconds(10), game: 'A', sizeBytes: 10 }),
    ];
    const large = [
      clip({ at: 0, game: 'B', sizeBytes: 900 }),
      clip({ at: seconds(10), game: 'B', sizeBytes: 900 }),
    ];

    const bursts = findBursts([...small, ...large]);
    expect(bursts[0].game).toBe('B');
  });

  it('is stable when two clips share a millisecond', () => {
    // Two rows with the same timestamp come back in whatever order SQLite
    // felt like, and a screen that reorders itself between refreshes is one
    // where somebody ticks a keeper and then deletes a different clip.
    const a = clip({ at: seconds(5) });
    const b = clip({ at: seconds(5) });

    const [burst] = findBursts([b, a]);
    expect(burst.clips.map((entry) => entry.id)).toEqual([a.id, b.id]);
  });
});
