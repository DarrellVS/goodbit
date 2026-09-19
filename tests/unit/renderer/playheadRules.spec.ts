import { describe, expect, it } from 'vitest';
import {
  BEFORE_RANGE_SLOP,
  correctPlayhead,
  playFrom,
} from '@renderer/composables/media/playheadRules';

const RANGE: [number, number] = [3.766, 5.05];

function state(over: Partial<Parameters<typeof correctPlayhead>[0]> = {}) {
  return {
    time: 4,
    range: RANGE,
    paused: false,
    seeking: false,
    locked: false,
    ...over,
  };
}

/**
 * Why the trim preview stopped playing, written down so it cannot come back.
 *
 * Asking a `<video>` for a time does not put it at that time: it lands on the
 * frame containing it, up to one frame earlier. Seeking to a range start of
 * 3.766 left `currentTime` at 3.750, `currentTime < startTime` read as "before
 * the range", and the correction seeked to 3.766 again and landed at 3.750
 * again. Every `timeupdate` re-seeked, so playback never crossed the start.
 *
 * On screen that was a player that did nothing when Space was pressed, with the
 * playhead invisible because it was resting under the range handle drawn at the
 * same place, and it came back the moment somebody clicked the strip, which put
 * the head somewhere the comparison was happy with.
 */
describe('keeping the playhead inside the trim range', () => {
  it('leaves a head resting a frame short of the start alone', () => {
    // One frame at 60 fps below the start, which is exactly where a seek to
    // the start lands. Correcting this is the bug.
    expect(correctPlayhead(state({ time: RANGE[0] - 1 / 60 }))).toBeNull();

    // And at 24 fps, where a frame is two and a half times longer.
    expect(correctPlayhead(state({ time: RANGE[0] - 1 / 24 }))).toBeNull();
  });

  it('still brings it back when somebody scrubbed away from the range', () => {
    const correction = correctPlayhead(state({ time: RANGE[0] - BEFORE_RANGE_SLOP - 0.01 }));
    expect(correction).toEqual({ seekTo: RANGE[0], play: false });
  });

  it('does not start a clip playing just because the head was moved back', () => {
    // Scrubbing before the range while paused must stay paused: play is the
    // loop's decision, and this is not the loop.
    const correction = correctPlayhead(state({ time: 0, paused: true }));
    expect(correction?.play).toBe(false);
  });

  it('loops at the end, and resumes only if the loop paused it', () => {
    expect(correctPlayhead(state({ time: RANGE[1], paused: true }))).toEqual({
      seekTo: RANGE[0],
      play: true,
    });

    // Already playing: put it back and leave it running.
    expect(correctPlayhead(state({ time: RANGE[1], paused: false }))).toEqual({
      seekTo: RANGE[0],
      play: false,
    });
  });

  it('will not restart a clip whose file is being claimed', () => {
    // A trim ends by renaming over this exact file, so the loop must not put
    // the player back on it after the lock has paused it.
    expect(correctPlayhead(state({ time: RANGE[1], paused: true, locked: true }))).toEqual({
      seekTo: RANGE[0],
      play: false,
    });
  });

  it('says nothing while a seek is already on its way', () => {
    // Otherwise one correction becomes a queue of them, which is the shape the
    // original bug took.
    expect(correctPlayhead(state({ time: 0, seeking: true }))).toBeNull();
    expect(correctPlayhead(state({ time: RANGE[1], seeking: true }))).toBeNull();
  });

  it('does nothing at all in the middle, which is nearly every call', () => {
    expect(correctPlayhead(state({ time: 4.2 }))).toBeNull();
  });
});

describe('where pressing play starts from', () => {
  it('carries on from a head resting a frame short of the start', () => {
    // The press that used to do nothing.
    expect(playFrom(RANGE[0] - 1 / 60, RANGE)).toBeNull();
  });

  it('returns to the start from outside the range', () => {
    expect(playFrom(0, RANGE)).toBe(RANGE[0]);
    expect(playFrom(RANGE[1] + 1, RANGE)).toBe(RANGE[0]);
  });

  it('returns to the start when it is sitting on the end', () => {
    // Otherwise play would run the last hundredth of a second and stop.
    expect(playFrom(RANGE[1], RANGE)).toBe(RANGE[0]);
  });

  it('carries on from the middle', () => {
    expect(playFrom(4.2, RANGE)).toBeNull();
  });
});
