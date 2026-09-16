import { describe, expect, it } from 'vitest';
import {
  pointInRect,
  resolveRegion,
  REFERENCE_HEIGHT,
  type Anchor,
  type Region,
} from '../../../src/main/services/highlights/vision/geometry.js';

/**
 * Where a HUD element is, in a way that survives the monitor.
 *
 * CLAUDE.md calls this rule load-bearing and says the obvious alternative was
 * measured and was worse: geometry is in units of frame *height* from an
 * anchor, never fractions of width, because a fraction of width slides a
 * centre element a third of the way across the screen when the aspect goes
 * from 16:9 to 21:9.
 *
 * That claim is exactly the kind of thing that survives a refactor by
 * accident. These tests state it as arithmetic: the same region, resolved
 * against 1920x1080, 2560x1440 and 3440x1440, must land on the same place in
 * the picture, and the two shapes at the same height must be identical.
 */

function region(overrides: Partial<Region> = {}): Region {
  return {
    anchor: 'top-right',
    dx: -0.2,
    dy: 0.05,
    w: 0.15,
    h: 0.08,
    out: [192, 96],
    ...overrides,
  };
}

/** 21:9 and 16:9 at the same height, plus a shorter 16:9. */
const FRAMES = {
  ultrawide: { width: 3440, height: 1440 },
  wide: { width: 2560, height: 1440 },
  small: { width: 1920, height: 1080 },
} as const;

describe('the reference height', () => {
  it('is the height every template was cut at', () => {
    expect(REFERENCE_HEIGHT).toBe(1440);
  });
});

describe('a region resolves to the same place whatever the screen', () => {
  it('keeps a top-right box the same distance from the right edge at one height', () => {
    const r = region();
    const ultrawide = resolveRegion(r, FRAMES.ultrawide.width, FRAMES.ultrawide.height);
    const wide = resolveRegion(r, FRAMES.wide.width, FRAMES.wide.height);

    // This is the aspect-independence claim, stated as a number. Going from
    // 16:9 to 21:9 adds 880 pixels of width and must move this box by none.
    const gapFromRight = (rect: { x: number; w: number }, width: number) => width - rect.x - rect.w;
    expect(gapFromRight(ultrawide, FRAMES.ultrawide.width)).toBe(
      gapFromRight(wide, FRAMES.wide.width),
    );
    expect(ultrawide.w).toBe(wide.w);
    expect(ultrawide.h).toBe(wide.h);
    expect(ultrawide.y).toBe(wide.y);
  });

  it('scales with height, so the box covers the same fraction of the picture', () => {
    const r = region();
    const tall = resolveRegion(r, FRAMES.wide.width, FRAMES.wide.height);
    const short = resolveRegion(r, FRAMES.small.width, FRAMES.small.height);

    // 1080/1440 = 0.75, within the rounding to even numbers that ffmpeg's
    // crop needs on a chroma-subsampled stream.
    expect(short.w / short.h).toBeCloseTo(tall.w / tall.h, 1);
    expect(short.h / FRAMES.small.height).toBeCloseTo(tall.h / FRAMES.wide.height, 2);
    expect(short.y / FRAMES.small.height).toBeCloseTo(tall.y / FRAMES.wide.height, 2);
  });

  it('keeps a centred box centred as the aspect widens', () => {
    // The failure mode the rule exists to prevent. A box that is centred at
    // 16:9 and off-centre at 21:9 is how a HUD read turns into noise.
    const r = region({ anchor: 'top-centre', dx: -0.075, dy: 0.02 });

    const centreOffset = (rect: { x: number; w: number }, width: number) =>
      rect.x + rect.w / 2 - width / 2;

    expect(centreOffset(resolveRegion(r, 3440, 1440), 3440)).toBe(
      centreOffset(resolveRegion(r, 2560, 1440), 2560),
    );
  });
});

describe('what ffmpeg will accept', () => {
  const anchors: Anchor[] = [
    'centre',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'top-centre',
    'bottom-centre',
  ];

  it('gives even width and height, on every anchor', () => {
    // An odd crop on a chroma-subsampled stream is a refusal, not a warning.
    for (const anchor of anchors) {
      const rect = resolveRegion(region({ anchor }), 3440, 1440);
      expect(rect.w % 2).toBe(0);
      expect(rect.h % 2).toBe(0);
    }
  });

  it('never returns a zero-sized box, however small the region asks to be', () => {
    const rect = resolveRegion(region({ w: 0, h: 0.0001 }), 3440, 1440);
    expect(rect.w).toBeGreaterThanOrEqual(2);
    expect(rect.h).toBeGreaterThanOrEqual(2);
  });

  it('never returns a box that hangs off the frame', () => {
    // ffmpeg refuses a crop outside the frame rather than sliding it back on,
    // so the clamping has to happen here.
    const offscreen = [
      region({ anchor: 'top-right', dx: 0.5 }),
      region({ anchor: 'bottom-left', dx: -0.5, dy: 0.5 }),
      region({ anchor: 'top-left', dx: -1, dy: -1 }),
      region({ anchor: 'bottom-right', dx: 2, dy: 2 }),
    ];

    for (const r of offscreen) {
      for (const { width, height } of Object.values(FRAMES)) {
        const rect = resolveRegion(r, width, height);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(width);
        expect(rect.y + rect.h).toBeLessThanOrEqual(height);
      }
    }
  });

  it('clamps a region larger than the frame to the frame', () => {
    const rect = resolveRegion(region({ anchor: 'top-left', dx: 0, dy: 0, w: 9, h: 9 }), 1920, 1080);

    expect(rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});

describe('a point inside a sampled crop', () => {
  it('lands in the same spot whatever the source resolution was', () => {
    // The reason `out` is fixed: a count of lit pixels at a given coordinate
    // has to mean the same thing on every recording.
    const r = region({ anchor: 'top-right', dx: -0.2, dy: 0.05, w: 0.15, h: 0.08 });
    const point = { anchor: 'top-right' as Anchor, dx: -0.15, dy: 0.07 };
    const sampled = { width: 192, height: 96 };

    const onUltrawide = pointInRect(
      point,
      resolveRegion(r, 3440, 1440),
      3440,
      1440,
      sampled,
    );
    const onSmall = pointInRect(point, resolveRegion(r, 1920, 1080), 1920, 1080, sampled);

    expect(onSmall.x).toBeCloseTo(onUltrawide.x, 0);
    expect(onSmall.y).toBeCloseTo(onUltrawide.y, 0);
  });

  it('puts the anchor itself at the crop origin', () => {
    const r = region({ anchor: 'top-left', dx: 0, dy: 0, w: 0.1, h: 0.1 });
    const rect = resolveRegion(r, 2560, 1440);

    const at = pointInRect({ anchor: 'top-left', dx: 0, dy: 0 }, rect, 2560, 1440, {
      width: 100,
      height: 100,
    });

    expect(at).toEqual({ x: 0, y: 0 });
  });
});
