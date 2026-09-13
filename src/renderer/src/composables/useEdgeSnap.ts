import type { TimelineAudio, TimelineClip } from '../types/editor';

/**
 * Snapping for the music lane.
 *
 * The video lane is gapless and reflows on its own, so it needs none of this.
 * Music placements float freely, which means lining a track up with a cut or
 * with the playhead is otherwise done by eye at whatever zoom happens to be set.
 *
 * The threshold is given in pixels and converted to seconds by the caller's
 * scale, so the snap feels the same however far in the timeline is zoomed.
 */

/** How close, in pixels on screen, before an edge grabs. */
export const SNAP_PIXELS = 8;

export interface SnapContext {
  clips: readonly TimelineClip[];
  audio: readonly TimelineAudio[];
  currentTime: number;
  /** Pixels per second at the current zoom. */
  pixelsPerSecond: number;
  /** The placement being dragged, which must not snap to itself. */
  ignoreAudioId?: string;
}

export interface SnapResult {
  time: number;
  /** True when an edge grabbed, so the caller can show a guide line. */
  snapped: boolean;
}

/** Every time a dragged edge could usefully line up with. */
export function snapTargets(ctx: SnapContext): number[] {
  const targets = new Set<number>([0, ctx.currentTime]);

  for (const clip of ctx.clips) {
    targets.add(clip.startTime);
    targets.add(clip.startTime + clip.duration);
  }

  for (const item of ctx.audio) {
    if (item.id === ctx.ignoreAudioId) continue;
    targets.add(item.startTime);
    targets.add(item.startTime + item.duration);
  }

  return [...targets].filter((t) => Number.isFinite(t) && t >= 0);
}

/**
 * Pull `time` onto the nearest target, if one is close enough.
 *
 * `alsoSnapEnd` lets a placement's trailing edge grab too: dragging a track so
 * its *end* meets the last cut is as common as lining up its start, and without
 * it the only way to do that is arithmetic.
 */
export function snapTime(
  time: number,
  ctx: SnapContext,
  opts: { duration?: number; disabled?: boolean } = {},
): SnapResult {
  if (opts.disabled || ctx.pixelsPerSecond <= 0) return { time, snapped: false };

  const tolerance = SNAP_PIXELS / ctx.pixelsPerSecond;
  const targets = snapTargets(ctx);

  let best: number | null = null;
  let bestDistance = tolerance;

  for (const target of targets) {
    const startDistance = Math.abs(time - target);
    if (startDistance <= bestDistance) {
      bestDistance = startDistance;
      best = target;
    }

    if (opts.duration !== undefined) {
      const endDistance = Math.abs(time + opts.duration - target);
      if (endDistance <= bestDistance) {
        bestDistance = endDistance;
        best = target - opts.duration;
      }
    }
  }

  if (best === null) return { time, snapped: false };
  return { time: Math.max(0, best), snapped: true };
}
