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

