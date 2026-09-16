import { describe, expect, it } from 'vitest';
import { planGoodBitsAfterTrim } from '../../../src/main/services/goodBitsAfterTrim.js';

/**
 * What a cut does to the marks on the clip it cuts.
 *
 * A trim replaces the file with a range of itself, so every timestamp on that
 * clip moves. `TrimAndSwapClipAction` did not know the `good_bit` table
 * existed, so a mark at 20 to 25 survived a cut to 0 to 10 unchanged and then
 * pointed at footage that is not in the file.
 *
 * **Nothing about that reads as broken**, which is why it is worth a test
 * rather than a glance: the band still draws, at a place where nothing
 * happens, and the only way to notice is to press it.
 */

const mark = (id: number, startSec: number, endSec: number) => ({ id, startSec, endSec });

describe('a mark inside the cut moves with it', () => {
  it('shifts by the start of the range that was kept', () => {
    // Keeping 10 to 20 means the new file begins where 10 was, so a mark at
    // 12 to 15 is now at 2 to 5.
    const plan = planGoodBitsAfterTrim([mark(1, 12, 15)], 10, 20);

    expect(plan.dropped).toEqual([]);
    expect(plan.moved).toEqual([{ id: 1, startSec: 2, endSec: 5, clamped: false }]);
  });

  it('leaves a mark alone when the cut starts at zero', () => {
    const plan = planGoodBitsAfterTrim([mark(1, 4, 6)], 0, 10);

    expect(plan.moved[0]).toMatchObject({ startSec: 4, endSec: 6, clamped: false });
  });

  it('comes back in clip order, whatever order the rows were in', () => {
    const plan = planGoodBitsAfterTrim([mark(1, 18, 19), mark(2, 11, 12)], 10, 20);

    expect(plan.moved.map((m) => m.id)).toEqual([2, 1]);
  });

  it('does not carry float noise into the database', () => {
    // Subtracting one float from another gives things like 4.300000000000001,
    // and a range that reads 0:04 to 0:06 in the app should not hold fifteen
    // digits in a column.
    const plan = planGoodBitsAfterTrim([mark(1, 14.3, 16.7)], 10, 20);

    expect(plan.moved[0]!.startSec).toBe(4.3);
    expect(plan.moved[0]!.endSec).toBe(6.7);
  });
});

describe('a mark outside the cut is gone', () => {
  it('drops one entirely after the kept range', () => {
    const plan = planGoodBitsAfterTrim([mark(1, 22, 25)], 0, 10);

    expect(plan.moved).toEqual([]);
    expect(plan.dropped).toEqual([1]);
  });

  it('drops one entirely before it', () => {
    expect(planGoodBitsAfterTrim([mark(1, 2, 5)], 10, 20).dropped).toEqual([1]);
  });

  it('drops one that only touches the boundary', () => {
    // Touching means sharing no footage with the new file, so `<=` and `>=`
    // rather than `<` and `>`.
    expect(planGoodBitsAfterTrim([mark(1, 5, 10)], 10, 20).dropped).toEqual([1]);
    expect(planGoodBitsAfterTrim([mark(2, 20, 25)], 10, 20).dropped).toEqual([2]);
  });
});

describe('a mark that straddles the cut is kept, clamped', () => {
  it('keeps the part that survived, and says it was clamped', () => {
    /*
     * The judgement call in this file. Cutting the first two seconds off a
     * five second mark leaves three seconds of the thing that was marked, and
     * dropping it would throw away a decision over an edge the person moving
     * the handles could see. So it is kept and pulled to the boundary.
     */
    const plan = planGoodBitsAfterTrim([mark(1, 8, 13)], 10, 20);

    expect(plan.moved).toEqual([{ id: 1, startSec: 0, endSec: 3, clamped: true }]);
  });

  it('clamps the far edge the same way', () => {
    const plan = planGoodBitsAfterTrim([mark(1, 18, 26)], 10, 20);

    expect(plan.moved).toEqual([{ id: 1, startSec: 8, endSec: 10, clamped: true }]);
  });

  it('keeps a mark that swallows the whole cut', () => {
    // Somebody marked a long stretch and then cut down to the middle of it.
    const plan = planGoodBitsAfterTrim([mark(1, 0, 30)], 10, 20);

    expect(plan.moved).toEqual([{ id: 1, startSec: 0, endSec: 10, clamped: true }]);
  });

  it('drops one whose surviving sliver is too short to be the moment', () => {
    /*
     * A mark that overlaps the cut by five hundredths of a second. That is the
     * edge of a moment rather than the moment, and the server would refuse to
     * create a row that short, so keeping it would leave a band nobody can
     * press pinned to the very start of the new file.
     *
     * My first attempt at this case used `mark(9.95, 15)`, which is clipped at
     * the start and then runs five seconds into the kept range: a survivor,
     * not a sliver. The overlap is what has to be small, not the offset.
     */
    const plan = planGoodBitsAfterTrim([mark(1, 9.95, 10.05)], 10, 20);

    expect(plan.moved).toEqual([]);
    expect(plan.dropped).toEqual([1]);
  });

  it('keeps one whose sliver is just long enough', () => {
    const plan = planGoodBitsAfterTrim([mark(1, 9.5, 10.15)], 10, 20);

    expect(plan.moved).toEqual([{ id: 1, startSec: 0, endSec: 0.15, clamped: true }]);
  });
});

describe('a real clip somebody has been working on', () => {
  it('sorts three marks into the two that survive', () => {
    /*
     * Thirty seconds with three moments marked, cut down to the middle one.
     * The case the whole feature exists for: somebody marked what happened and
     * then kept one of them.
     */
    const plan = planGoodBitsAfterTrim(
      [mark(1, 2, 5), mark(2, 13, 17), mark(3, 24, 28)],
      12,
      20,
    );

    expect(plan.dropped).toEqual([1, 3]);
    expect(plan.moved).toEqual([{ id: 2, startSec: 1, endSec: 5, clamped: false }]);
  });

  it('is empty for a clip with nothing marked', () => {
    expect(planGoodBitsAfterTrim([], 0, 10)).toEqual({ moved: [], dropped: [] });
  });
});
