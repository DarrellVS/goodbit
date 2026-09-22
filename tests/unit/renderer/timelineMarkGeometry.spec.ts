import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  bandPosition,
  markOnTrimmedBlock,
} from '../../../src/renderer/src/utils/goodBits';

/**
 * Where a mark sits on a timeline block.
 *
 * The editor had no knowledge of GoodBits at all before this, so nothing was
 * being stripped: nothing was ever loaded. What is new is the one thing that
 * genuinely differs from a library card, which is that a block shows a
 * *window* of its clip rather than all of it. The same mark therefore belongs
 * at a different place and a different width on the two, and getting that
 * wrong is invisible in exactly the way this project keeps running into: the
 * band still draws, over a moment where nothing happens.
 */

const span = (startSec: number, endSec: number) => ({ startSec, endSec });

describe('markOnTrimmedBlock', () => {
  it('maps a mark against the window, not against the recording', () => {
    // The whole point. On a thirty second recording trimmed to 10..20, a mark
    // at 12..14 is a fifth of the way into the block and a tenth of it wide.
    // Against the recording it would be 40% along and 7% wide, which is the
    // answer `bandPosition` gives and the wrong one here.
    const onBlock = markOnTrimmedBlock(span(12, 14), 10, 20);
    expect(onBlock).toEqual({ leftPercent: 20, widthPercent: 20 });

    const onCard = bandPosition(span(12, 14), 30);
    expect(Math.round(onCard.leftPercent)).toBe(40);
  });

  it('fills the block when the trim is the mark', () => {
    expect(markOnTrimmedBlock(span(10, 20), 10, 20)).toEqual({
      leftPercent: 0,
      widthPercent: 100,
    });
  });

  it('keeps a mark that straddles a handle, clamped to it', () => {
    /*
     * The rule `services/goodBitsAfterTrim.ts` already settled for the
     * trimmer: cutting two seconds off a five second mark leaves three seconds
     * of the thing that was marked. A second rule here that dropped it instead
     * would be two answers to one question, and the one the user can see being
     * dragged is this one.
     */
    expect(markOnTrimmedBlock(span(8, 14), 10, 20)).toEqual({
      leftPercent: 0,
      widthPercent: 40,
    });

    expect(markOnTrimmedBlock(span(16, 26), 10, 20)).toEqual({
      leftPercent: 60,
      widthPercent: 40,
    });
  });

  it('draws nothing for a mark outside the window', () => {
    expect(markOnTrimmedBlock(span(0, 5), 10, 20)).toBeNull();
    expect(markOnTrimmedBlock(span(25, 30), 10, 20)).toBeNull();
  });

  it('draws nothing for a mark that only touches a handle', () => {
    // No footage in common with what the block is showing, so a band at the
    // very edge would point at a moment the block does not contain.
    expect(markOnTrimmedBlock(span(5, 10), 10, 20)).toBeNull();
    expect(markOnTrimmedBlock(span(20, 25), 10, 20)).toBeNull();
  });

  it('refuses a window of no length rather than dividing by it', () => {
    expect(markOnTrimmedBlock(span(1, 2), 10, 10)).toBeNull();
    expect(markOnTrimmedBlock(span(1, 2), 20, 10)).toBeNull();
    expect(markOnTrimmedBlock(span(1, 2), Number.NaN, 10)).toBeNull();
  });

  it('moves as the handles move, which is the thing to watch on screen', () => {
    // Same mark, three trims. It should walk right across the block as the
    // window slides left past it.
    const mark = span(14, 16);
    expect(markOnTrimmedBlock(mark, 10, 20)!.leftPercent).toBe(40);
    expect(markOnTrimmedBlock(mark, 12, 22)!.leftPercent).toBe(20);
    expect(markOnTrimmedBlock(mark, 14, 24)!.leftPercent).toBe(0);
  });
});

describe('assignLanes, on a block', () => {
  it('stacks overlapping marks rather than drawing them on top of each other', () => {
    // The timeline block is the taller strip `assignLanes` was written for, so
    // this is reuse rather than a second implementation. Asserted here because
    // this is the first caller that actually has the height for three rows.
    const lanes = assignLanes([span(0, 5), span(2, 7), span(3, 9)]);
    expect(lanes.map((entry) => entry.lane)).toEqual([0, 1, 2]);
  });

  it('puts marks that do not overlap on one row', () => {
    const lanes = assignLanes([span(0, 2), span(3, 5), span(6, 8)]);
    expect(lanes.every((entry) => entry.lane === 0)).toBe(true);
  });
});
