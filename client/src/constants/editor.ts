export const EDITOR_CONSTANTS = {
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

