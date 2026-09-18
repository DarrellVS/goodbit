import { describe, expect, it } from 'vitest';
import {
  composeMoments,
  type Death,
  type Kill,
} from '../../../src/main/services/highlights/games/battlefield.js';

/**
 * What the Battlefield module makes of a clip once the pixels are behind it.
 *
 * The reading half needs frames and a GPU and lives in `scripts/hud-check.mjs`
 * and `scripts/visual-deaths.mjs`, against the real library. This half takes
 * numbers and returns the ranges somebody is offered, and every rule in it is
 * a decision about what a person would call one moment rather than something
 * re-derivable from the code:
 *
 * - kills close together are one range, because "two kills, five seconds
 *   apart" is one thing that happened and three chips two seconds apart is the
 *   same footage offered three times;
 * - a death close to a kill belongs to that moment, because trading a kill for
 *   your own life is one story;
 * - a death on its own is its own range, because a death twenty seconds after
 *   a kill is a second one.
 *
 * The windows those ranges turn into are `place()`'s, and are tested with it.
 */

/**
 * What a sentence has to say, rather than which wording it picked.
 *
 * The reasons rotate: each shape has a few wordings and a moment gets one of
 * them, chosen from its own numbers so a clip always says the same thing. What
 * must hold is that the sentence names what happened, so these are the two
 * things a reader has to be able to tell apart. `dropped` appears in both
 * ("you dropped someone", "you got dropped"), which is exactly why neither
 * pattern is just that word.
 */
const SAYS_KILL = /kill|dropped someone|got one|two of them|of them in/;
const SAYS_DEATH = /went down|they got you|got dropped/;

function kill(atSec: number, confidence = 0.95): Kill {
  return { atSec, confidence };
}

function death(atSec: number, confidence = 0.96): Death {
  return { atSec, confidence };
}

describe('kills that belong together', () => {
  it('are one range, and the reason counts them', () => {
    const [moment, ...rest] = composeMoments([kill(16), kill(21)], []);

    expect(rest).toEqual([]);
    expect(moment.kind).toBe('multi-kill');
    expect(moment.atSec).toBe(16);
    expect(moment.untilSec).toBe(21);
    expect(moment.reason).toMatch(SAYS_KILL);
    expect(moment.reason).toMatch(/5 seconds/);
    expect(moment.reason).not.toMatch(SAYS_DEATH);
  });

  it('stop belonging together once they are more than six seconds apart', () => {
    const moments = composeMoments([kill(10), kill(16.1)], []);

    expect(moments).toHaveLength(2);
    expect(moments.map((m) => m.kind)).toEqual(['kill', 'kill']);
  });

  it('are still one range at exactly six seconds', () => {
    expect(composeMoments([kill(10), kill(16)], [])).toHaveLength(1);
  });

  it('say how many and how long once there are more than two', () => {
    const [moment] = composeMoments([kill(4), kill(8), kill(13)], []);

    expect(moment.kind).toBe('multi-kill');
    expect(moment.reason).toMatch(/(^|\s)3\s/);
    expect(moment.reason).toMatch(/9 seconds/);
  });

  it('say a kill happened, and nothing about a death', () => {
    const [moment] = composeMoments([kill(12)], []);

    expect(moment.kind).toBe('kill');
    expect(moment.reason).toMatch(SAYS_KILL);
    expect(moment.reason).not.toMatch(SAYS_DEATH);
    // No gap to report when there is only one of them.
    expect(moment.reason).not.toMatch(/seconds/);
    expect(moment.untilSec).toBe(12);
  });
});

describe('a death near a kill', () => {
  it('joins that moment rather than making a second one', () => {
    const moments = composeMoments([kill(12)], [death(13.5)]);

    expect(moments).toHaveLength(1);
    expect(moments[0].kind).toBe('kill');
    expect(moments[0].reason).toMatch(SAYS_KILL);
    expect(moments[0].reason).toMatch(SAYS_DEATH);
  });

  it('stretches the range to cover it', () => {
    const [moment] = composeMoments([kill(12)], [death(13.5)]);

    expect(moment.atSec).toBe(12);
    expect(moment.untilSec).toBe(13.5);
  });

  it('opens the range when it came first', () => {
    const [moment] = composeMoments([kill(12)], [death(10.5)]);

    expect(moment.atSec).toBe(10.5);
    expect(moment.untilSec).toBe(12);
  });

  it('joins at exactly two seconds and not a tenth later', () => {
    expect(composeMoments([kill(12)], [death(14)])).toHaveLength(1);
    expect(composeMoments([kill(12)], [death(14.1)])).toHaveLength(2);
  });

  it('measures from the end of a run of kills, not from its start', () => {
    // The run is 12 to 17, so a death at 18.5 is 1.5 s past the last kill even
    // though it is 6.5 s past the first. Measuring from the start would make
    // this its own range.
    const moments = composeMoments([kill(12), kill(17)], [death(18.5)]);

    expect(moments).toHaveLength(1);
    expect(moments[0].reason).toMatch(/5 seconds/);
    expect(moments[0].reason).toMatch(SAYS_DEATH);
    expect(moments[0].untilSec).toBe(18.5);
  });

  it('goes to the nearer moment when two are in reach', () => {
    const moments = composeMoments([kill(10), kill(20)], [death(21)]);

    expect(moments).toHaveLength(2);
    expect(moments[0].reason).not.toMatch(SAYS_DEATH);
    expect(moments[1].reason).toMatch(SAYS_DEATH);
  });
});

describe('a death on its own', () => {
  it('is its own range, with its own sentence', () => {
    const [moment, ...rest] = composeMoments([], [death(8)]);

    expect(rest).toEqual([]);
    expect(moment.kind).toBe('death');
    expect(moment.atSec).toBe(8);
    expect(moment.untilSec).toBe(8);
    expect(moment.reason).toMatch(SAYS_DEATH);
    expect(moment.reason).not.toMatch(SAYS_KILL);
  });

  it('stays separate from a kill it has nothing to do with', () => {
    const moments = composeMoments([kill(4)], [death(25)]);

    expect(moments.map((m) => m.kind)).toEqual(['kill', 'death']);
  });

  it('carries its own confidence, and a joined one averages with the kills', () => {
    const [alone] = composeMoments([], [death(8, 0.97)]);
    expect(alone.confidence).toBeCloseTo(0.97, 5);

    const [joined] = composeMoments([kill(12, 0.9)], [death(13, 0.98)]);
    expect(joined.confidence).toBeCloseTo(0.94, 5);
  });
});

describe('the wording', () => {
  it('is the same every time for the same moment', () => {
    // A reading is cached against the clip's mtime and read back on every
    // open. A sentence that changed between two of those would look like the
    // analysis had changed its mind.
    const once = composeMoments([kill(12)], [death(13)])[0].reason;
    const twice = composeMoments([kill(12)], [death(13)])[0].reason;

    expect(twice).toBe(once);
  });

  it('is not the same sentence for every clip', () => {
    const said = new Set<string>();
    for (let at = 3; at < 40; at += 1.3) said.add(composeMoments([kill(at)], [])[0].reason);

    // The whole point: one wording for every kill in a library is a label
    // people stop reading.
    expect(said.size).toBeGreaterThan(1);
  });

  it('varies for a death as well, and for the half that follows a kill', () => {
    const deaths = new Set<string>();
    const trades = new Set<string>();
    for (let at = 3; at < 40; at += 1.3) {
      deaths.add(composeMoments([], [death(at)])[0].reason);
      trades.add(composeMoments([kill(at)], [death(at + 1)])[0].reason);
    }

    expect(deaths.size).toBeGreaterThan(1);
    expect(trades.size).toBeGreaterThan(1);
  });

  it('is in the voice the app uses everywhere else', () => {
    const inputs: Array<[Kill[], Death[]]> = [];
    for (let at = 2; at < 30; at += 0.7) {
      inputs.push([[kill(at)], []]);
      inputs.push([[kill(at), kill(at + 3)], []]);
      inputs.push([[kill(at), kill(at + 0.5), kill(at + 4)], []]);
      inputs.push([[], [death(at)]]);
      inputs.push([[kill(at)], [death(at + 1)]]);
    }

    for (const [kills, deaths] of inputs) {
      for (const moment of composeMoments(kills, deaths)) {
        expect(moment.reason).toBe(moment.reason.toLowerCase());
        expect(moment.reason).not.toMatch(/[!?]/);
        // Never says how it knows: a template matching a banner is the app's
        // business rather than the reader's.
        expect(moment.reason).not.toMatch(/banner|template|hud|detect/i);
        expect(moment.reason.length).toBeLessThan(60);
      }
    }
  });
});

describe('what comes back', () => {
  it('is in the order it happened, whatever order it was found in', () => {
    const moments = composeMoments([kill(20)], [death(3), death(30)]);

    expect(moments.map((m) => m.atSec)).toEqual([3, 20, 30]);
  });

  it('is nothing at all when nothing was read', () => {
    expect(composeMoments([], [])).toEqual([]);
  });
});
