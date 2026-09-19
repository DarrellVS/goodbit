/**
 * Where the playhead is allowed to be, and what to do when it is not there.
 *
 * The trim preview loops one range out of a longer recording, which means
 * something has to put the playhead back when it runs past the end and when it
 * sits before the start. That correction used to be two comparisons inside the
 * `timeupdate` handler, and it could fight the player:
 *
 * asking a `<video>` for a time does not put it at that time. It lands on the
 * frame containing it, which is up to one frame *earlier* than asked. So
 * seeking to a range start of 3.766 leaves `currentTime` at 3.750, a comparison
 * against the start says "before the range", and the next `timeupdate` seeks to
 * 3.766 again, which lands at 3.750 again. Playback never advances: pressing
 * Space looked like it did nothing, the playhead sat one frame short of the
 * start hidden under the handle drawn there, and the only way out was clicking
 * the strip, which put the head somewhere the comparison was happy with.
 *
 * So the rules live here, as values in and a decision out, and the slop below
 * is the whole point of the change.
 */

/** How close to the end counts as the end. A frame at any rate this app sees. */
export const LOOP_THRESHOLD = 0.02;

/**
 * How far before the start is really before the start.
 *
 * A quarter of a second, which is comfortably more than one frame at any rate
 * (a frame is 42 ms at 24 fps, 17 ms at 60) and comfortably less than anything
 * a person would notice playing before the cut they chose. Under it, the head
 * is where the last seek put it and playback is about to cross the start by
 * itself; over it, somebody scrubbed away and pressing play means come back.
 */
export const BEFORE_RANGE_SLOP = 0.25;

export interface PlayheadState {
  /** `video.currentTime`. */
  time: number;
  range: readonly [number, number];
  /** `video.paused`. */
  paused: boolean;
  /** `video.seeking`. A correction now would stack on one already in flight. */
  seeking: boolean;
  /** Something else is claiming the file, so nothing may start it playing. */
  locked: boolean;
}

export interface PlayheadCorrection {
  /** Where to put the playhead. */
  seekTo: number;
  /** Whether to start it playing once it is there. */
  play: boolean;
}

/**
 * What the loop should do about where the playhead is, or null for nothing.
 *
 * Called on every `timeupdate`, so "nothing" is the answer it gives nearly
 * every time, and giving any other answer when nothing is wrong is what froze
 * the preview.
 */
export function correctPlayhead(state: PlayheadState): PlayheadCorrection | null {
  const [start, end] = state.range;

  // A seek is already on its way to somewhere. Asking for another one before it
  // lands is how one correction becomes a queue of them.
  if (state.seeking) return null;

  if (state.time >= end - LOOP_THRESHOLD) {
    // The loop is what makes the lock more than a pause: pausing alone lasts
    // until the range ends and this would start it again.
    return { seekTo: start, play: state.paused && !state.locked };
  }

  if (state.time < start - BEFORE_RANGE_SLOP) {
    // Only move it. Whether the clip is playing is not this correction's to
    // decide: scrubbing before the range while paused must stay paused.
    return { seekTo: start, play: false };
  }

  return null;
}

/**
 * Where pressing play should start from, or null for "carry on from here".
 *
 * The same slop, for the same reason: pressing Space with the head resting one
 * frame short of the start is asking to play the range, not to re-seek to a
 * place it will land short of again.
 */
export function playFrom(time: number, range: readonly [number, number]): number | null {
  const [start, end] = range;
  if (time < start - BEFORE_RANGE_SLOP) return start;
  if (time >= end - LOOP_THRESHOLD) return start;
  return null;
}
