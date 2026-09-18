export const EDITOR_CONSTANTS = {
  /**
   * The gutter at each end of the timeline, and the origin of time zero.
   *
   * Everything in `Timeline.vue` measures from here: the first ruler tick, the
   * playhead at `currentTime` of zero, the left edge of both lanes, and the
   * subtraction that turns a click back into a second. It is one number
   * because four things have to land on the same pixel, and they have twice
   * drifted apart when it was two numbers.
   *
   * 12 is the gutter, and it was never the problem: the lanes had simply
   * stopped using it. 24 and 16 were both tried while chasing the symptom and
   * both read as too much space once the alignment underneath was right.
   */
  TIMELINE_OFFSET_PX: 12,
  /**
   * The breathing room inside a lane, before its first block and after its
   * last.
   *
   * The blocks are inset 6px top and bottom and were inset by nothing at the
   * left, so a clip at 0:00 sat hard against the lane's own rounded corner.
   *
   * It cannot be padding on the lane. An absolutely positioned child resolves
   * `left` against its containing block's *padding box*, so padding the lane
   * moves every block with it and changes nothing. What moves is the origin:
   * this is added to `TIMELINE_OFFSET_PX` wherever a second becomes a pixel,
   * and the lane grows by it at both ends.
   *
   * Which means it has to be added in six places, and a miss shows up as the
   * picture playing out of step with the ruler: the first ruler tick, the
   * playhead at zero, the click-to-time subtraction, a clip's `left`, a music
   * block's `left`, and the start of the overrun hatch. `TIMELINE_ZERO_PX` is
   * the sum, and nothing should be adding these two together by hand.
   */
  TIMELINE_LANE_INSET_PX: 8,
  PIXELS_PER_SECOND_BASE: 50,
  MIN_CLIP_DURATION: 0.1,
  DEFAULT_VIDEO_DURATION: 30,
  VIDEO_LOAD_TIMEOUT_MS: 5000,
  ZOOM: {
    MIN: 0.25,
    MAX: 3,
    STEP: 0.25,
  },
  SKIP_SECONDS: 5,
  PLAYBACK_SYNC_THRESHOLD: 0.1,
} as const;

/**
 * Time zero, in pixels from the scrolling container's own left edge.
 *
 * The gutter plus the lane's inset. Everything that turns a second into a
 * pixel, or a pixel back into a second, starts here.
 */
export const TIMELINE_ZERO_PX =
  EDITOR_CONSTANTS.TIMELINE_OFFSET_PX + EDITOR_CONSTANTS.TIMELINE_LANE_INSET_PX;

export const RULER_INTERVALS = new Map([
  [0, 10],
  [0.5, 5],
  [1, 1],
]);

export function getRulerInterval(zoom: number): number {
  for (const [threshold, interval] of RULER_INTERVALS) {
    if (zoom < threshold) return interval;
  }
  return 1;
}

