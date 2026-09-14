/**
 * Where on the screen a HUD element lives, in a way that survives the monitor.
 *
 * Never fractions of width. A game lays its HUD out in units that scale with
 * screen *height* and pins each piece to an edge or to the middle, so the same
 * numbers land on the same pixels at 1920x1080 and at 3440x1440, while a
 * fraction of width slides a centre element a third of the way across the
 * screen when the aspect changes from 16:9 to 21:9.
 *
 * The reference is 1440 tall: every template was cut at that height, and a
 * source of another height scales by `frameHeight / REFERENCE_HEIGHT`.
 */

export const REFERENCE_HEIGHT = 1440;

export type Anchor =
  | 'centre'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-centre'
  | 'bottom-centre';

export interface Region {
  anchor: Anchor;
  /** Offsets from the anchor, in units of frame height. x grows right, y down. */
  dx: number;
  dy: number;
  /** Size, in units of frame height. */
  w: number;
  h: number;
  /**
   * The size this box is sampled at. Fixing it means a count of lit pixels
   * means the same thing whatever the source resolution was.
   */
  out: [number, number];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function anchorPoint(anchor: Anchor, width: number, height: number): [number, number] {
  switch (anchor) {
    case 'centre': return [width / 2, height / 2];
    case 'top-left': return [0, 0];
    case 'top-right': return [width, 0];
    case 'bottom-left': return [0, height];
    case 'bottom-right': return [width, height];
    case 'top-centre': return [width / 2, 0];
    case 'bottom-centre': return [width / 2, height];
  }
}

/** The pixel rectangle a region resolves to on a frame of this size. */
export function resolveRegion(region: Region, width: number, height: number): Rect {
  const [ax, ay] = anchorPoint(region.anchor, width, height);
  // ffmpeg's crop wants even numbers on a chroma-subsampled stream.
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

  const w = Math.min(even(region.w * height), width);
  const h = Math.min(even(region.h * height), height);
  // Clamped rather than left to ffmpeg, which refuses a crop that hangs off
  // the frame instead of sliding it back on.
  const x = Math.min(Math.max(0, Math.round(ax + region.dx * height)), width - w);
  const y = Math.min(Math.max(0, Math.round(ay + region.dy * height)), height - h);
  return { x, y, w, h };
}

/** A point given in region units, as a pixel position inside a resolved rect. */
export function pointInRect(
  point: { dx: number; dy: number; anchor: Anchor },
  rect: Rect,
  frameWidth: number,
  frameHeight: number,
  sampled: { width: number; height: number },
): { x: number; y: number } {
  const [ax, ay] = anchorPoint(point.anchor, frameWidth, frameHeight);
  const sourceX = ax + point.dx * frameHeight;
  const sourceY = ay + point.dy * frameHeight;
  return {
    x: (sourceX - rect.x) * (sampled.width / rect.w),
    y: (sourceY - rect.y) * (sampled.height / rect.h),
  };
}
