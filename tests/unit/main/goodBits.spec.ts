import { describe, expect, it } from 'vitest';
import {
  checkRange,
  END_SLACK_SEC,
  GoodBitRangeError,
  MIN_GOOD_BIT_SEC,
  renderBasename,
  requireRange,
  stamp,
} from '../../../src/main/services/goodBits.js';

/**
 * What a GoodBit is allowed to be, and what a render of one is called.
 *
 * The reason this is a module and a spec rather than four lines inside
 * `CreateGoodBitAction`: the table carries `CHECK (endSec > startSec)`, so a
 * bad range is *stopped* either way, and the only question is what the person
 * marking a clip is told when it happens. A constraint violation surfaces as
 * `SQLITE_CONSTRAINT: CHECK constraint failed: CHK_good_bit_range` with a 500
 * around it. Everything asserted below is a sentence somebody can act on, and
 * the boundaries under it are the ones a dragged handle actually lands on.
 */

describe('a range the clip can hold', () => {
  it('accepts an ordinary one and stores it to the millisecond', () => {
    // A cut is asked for at `toFixed(3)` in `TrimVideoAction`, so anything
    // finer than a millisecond is precision the file cannot carry.
    expect(checkRange({ startSec: 4.50049, endSec: 12.8004, durationSec: 30 })).toEqual({
      ok: true,
      startSec: 4.5,
      endSec: 12.8,
    });
  });

  it('refuses a start or an end that is not a number', () => {
    // A JSON body is unchecked and `Number(undefined)` is NaN, which passes
    // every comparison below by failing all of them. Without this the row
    // reaches SQLite with NaN in a `real` column.
    for (const range of [
      { startSec: Number.NaN, endSec: 6 },
      { startSec: 1, endSec: Number.NaN },
      { startSec: 1, endSec: Number.POSITIVE_INFINITY },
    ]) {
      const result = checkRange(range);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBe(
        'a GoodBit needs a start and an end, in seconds',
      );
    }
  });

  it('refuses a start before the clip', () => {
    const result = checkRange({ startSec: -0.5, endSec: 6, durationSec: 30 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('a GoodBit cannot start before the clip does');
  });

  it('refuses a backwards range, which is what the table would refuse', () => {
    // The `CHECK` is the last line of defence and this is the first: the point
    // is the wording, since both of them stop the row.
    const result = checkRange({ startSec: 12, endSec: 4, durationSec: 30 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('at least');
  });

  it('refuses one too short to see or to cut', () => {
    const result = checkRange({ startSec: 3, endSec: 3.05, durationSec: 30 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      `a GoodBit has to be at least ${MIN_GOOD_BIT_SEC} seconds long`,
    );
  });

  it('accepts one sitting exactly on the length floor', () => {
    expect(checkRange({ startSec: 3, endSec: 3 + MIN_GOOD_BIT_SEC, durationSec: 30 }).ok).toBe(true);
  });

  it('accepts a floor-length range whose seconds do not subtract cleanly', () => {
    // `0.3 - 0.2` is 0.09999999999999998, so this is exactly on the floor and
    // a subtraction in seconds refuses it. Nobody dragging a handle could tell
    // why, which is why the comparison happens in whole milliseconds.
    expect(checkRange({ startSec: 0.2, endSec: 0.3, durationSec: 30 }).ok).toBe(true);
  });
});

describe('a range measured against the clip it is in', () => {
  it('clamps an end a frame or two past the stored duration', () => {
    /*
     * `Clip.durationSec` comes from the container header and a `<video>` has
     * its own idea of the same number; they differ by a frame or two on these
     * recordings. Marking to the very end of a clip is a normal thing to do,
     * and refusing it over a rounding difference would be unarguable and
     * unfixable from the UI.
     */
    const result = checkRange({ startSec: 20, endSec: 30.2, durationSec: 30 });

    expect(result).toEqual({ ok: true, startSec: 20, endSec: 30 });
  });

  it('refuses an end well past it', () => {
    const result = checkRange({ startSec: 20, endSec: 30 + END_SLACK_SEC + 0.01, durationSec: 30 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('a GoodBit cannot end after the clip does');
  });

  it('refuses a start at or after the end of the clip', () => {
    // Distinct from the one above on purpose: "your end is past the end" reads
    // as a clamp away from being right, and this is not a range at all.
    const result = checkRange({ startSec: 30, endSec: 40, durationSec: 30 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('a GoodBit cannot start after the clip ends');
  });

  it('takes the range on trust when the clip has never been measured', () => {
    /*
     * `Clip.durationSec` is nullable: the scan fills it in, so a row written
     * before that column existed has not been probed yet. A clip's length is
     * stored and not probed, so the alternative here is an ffprobe on the way
     * to marking a clip, which is a cost paid on every mark to catch a case
     * the next scan fixes on its own.
     */
    for (const durationSec of [null, undefined, 0]) {
      expect(checkRange({ startSec: 100, endSec: 140, durationSec }).ok).toBe(true);
    }
  });
});

describe('the throwing form, which is what an action calls', () => {
  it('hands back the range it will store', () => {
    expect(requireRange({ startSec: 1.2345, endSec: 9.8765, durationSec: 30 })).toEqual({
      startSec: 1.235,
      endSec: 9.877,
    });
  });

  it('throws something a route can answer 400 with', () => {
    // The status rides on the error so that the one thing the route has to
    // know is that it was a bad request, not what kind of bad request.
    try {
      requireRange({ startSec: 5, endSec: 5, durationSec: 30 });
      expect.unreachable('a zero length range has to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GoodBitRangeError);
      expect((error as GoodBitRangeError).status).toBe(400);
      expect((error as GoodBitRangeError).message).toContain('at least');
    }
  });
});

describe('what a rendered GoodBit is called', () => {
  it('is the recording plus what somebody called the GoodBit', () => {
    // Named after the source so the two sort together in the game folder, and
    // it is obvious at a glance which recording a render came out of.
    expect(renderBasename({ stem: 'Replay 2026-08-01', name: 'the tank', startSec: 4, endSec: 9 }))
      .toBe('Replay 2026-08-01 - the tank');
  });

  it('falls back to where it is in the clip when it has no name', () => {
    // Marking is meant to cost one gesture, so most GoodBits have no name. A
    // bare "Replay 2026-08-01" would also collide with the recording itself.
    expect(renderBasename({ stem: 'Replay', name: null, startSec: 74.6, endSec: 91 }))
      .toBe('Replay - 1m14s-1m31s');
  });

  it('strips the characters Windows will not take in a filename', () => {
    // A GoodBit is named in a text field, and `0:20 / 0:26` is a plausible
    // thing to type into one. A colon or a slash there would put the render in
    // another folder, or fail the write outright.
    expect(renderBasename({ stem: 'Clip', name: 'kill: 0/26 <nice>', startSec: 1, endSec: 2 }))
      .toBe('Clip - kill 026 nice');
  });

  it('drops trailing dots, which Windows also refuses', () => {
    expect(renderBasename({ stem: 'Clip', name: 'wait for it...', startSec: 1, endSec: 2 }))
      .toBe('Clip - wait for it');
  });

  it('falls back when the name was nothing but punctuation', () => {
    expect(renderBasename({ stem: 'Clip', name: '???', startSec: 0, endSec: 5 }))
      .toBe('Clip - 0m00s-0m05s');
  });

  it('keeps the whole thing short enough to be a path', () => {
    const basename = renderBasename({
      stem: 'x'.repeat(200),
      name: 'y'.repeat(200),
      startSec: 0,
      endSec: 5,
    });

    // 100 for the recording, 60 for the name, and the separator. Windows gives
    // a path 260 characters in total, and the library sits under a game folder
    // inside a videos root that is somebody else's to choose.
    expect(basename.length).toBe(163);
  });

  it('writes a timestamp a filename can hold', () => {
    // No colon, and minutes rather than a raw second count, because the point
    // of it is that somebody reading the folder can tell the two renders of
    // one recording apart.
    expect(stamp(0)).toBe('0m00s');
    expect(stamp(9.9)).toBe('0m09s');
    expect(stamp(60)).toBe('1m00s');
    expect(stamp(3661)).toBe('61m01s');
  });
});
