import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WING_LAYOUT,
  TILES,
  TILE_IDS,
  WING_HANDLE,
  WING_REACH,
  WING_WIDTH,
  canPlace,
  firstFit,
  notchWingsMode,
  resolveWingLayout,
  rotated,
  tileSize,
  wingRects,
  type Placement,
} from '../../../src/shared/notchWings.js';
import { WING_CLOSED, stepWing, type WingHover } from '../../../src/main/services/notch/hover.js';

describe('tile shapes', () => {
  it('lays every two-cell tile wide unless it is stood up', () => {
    const oblong = TILE_IDS.filter((id) => TILES[id].kind === 'oblong');
    expect(oblong.length).toBeGreaterThan(0);
    for (const id of oblong) {
      expect(tileSize({ id })).toEqual({ w: 2, h: 1 });
      expect(tileSize({ id, tall: true })).toEqual({ w: 1, h: 2 });
    }
  });

  it('ignores standing up for tiles that are not two cells', () => {
    expect(tileSize({ id: 'star', tall: true })).toEqual({ w: 1, h: 1 });
    expect(tileSize({ id: 'session', tall: true })).toEqual({ w: 2, h: 2 });
  });

  it('ships a default where every wing is full and nothing overlaps', () => {
    for (const wing of [DEFAULT_WING_LAYOUT.left, DEFAULT_WING_LAYOUT.right]) {
      const placed: Placement[] = [];
      for (const p of wing) {
        expect(canPlace(placed, p)).toBe(true);
        placed.push(p);
      }
      expect(firstFit(placed, 'obs')).toBeNull();
    }
  });
});

describe('what fits', () => {
  const wing: Placement[] = [{ id: 'recent', x: 0, y: 0 }];

  it('refuses a tile over one already there', () => {
    expect(canPlace(wing, { id: 'star', x: 1, y: 0 })).toBe(false);
    expect(canPlace(wing, { id: 'star', x: 1, y: 1 })).toBe(true);
  });

  it('refuses a tile hanging off the grid', () => {
    expect(canPlace([], { id: 'jobs', x: 1, y: 0 })).toBe(false);
    expect(canPlace([], { id: 'jobs', x: 0, y: 1, tall: true })).toBe(false);
    expect(canPlace([], { id: 'session', x: 0, y: 1 })).toBe(false);
  });

  it('refuses the same tile twice in one wing', () => {
    expect(canPlace(wing, { id: 'recent', x: 0, y: 1 })).toBe(false);
  });

  it('lets a tile move within its own wing without colliding with itself', () => {
    expect(canPlace(wing, { id: 'recent', x: 0, y: 1 }, 0)).toBe(true);
  });
});

describe('turning a tile', () => {
  it('stands a tile up at its own corner when that fits', () => {
    expect(rotated([{ id: 'jobs', x: 0, y: 0 }], 0)).toEqual({ id: 'jobs', x: 0, y: 0, tall: true });
  });

  it('moves it to the first place it fits when its corner is taken', () => {
    const wing: Placement[] = [
      { id: 'jobs', x: 0, y: 0 },
      { id: 'star', x: 0, y: 1 },
    ];
    expect(rotated(wing, 0)).toEqual({ id: 'jobs', x: 1, y: 0, tall: true });
  });

  it('says so when it fits nowhere', () => {
    const wing: Placement[] = [
      { id: 'jobs', x: 0, y: 0 },
      { id: 'star', x: 0, y: 1 },
      { id: 'obs', x: 1, y: 1 },
    ];
    expect(rotated(wing, 0)).toBeNull();
  });

  it('does nothing to a tile that has one shape', () => {
    expect(rotated([{ id: 'star', x: 0, y: 0 }], 0)).toBeNull();
  });
});

describe('reading a layout out of settings.json', () => {
  it('is the default when unset', () => {
    expect(resolveWingLayout(undefined)).toEqual(DEFAULT_WING_LAYOUT);
  });

  it('keeps an empty wing empty', () => {
    expect(resolveWingLayout({ left: [], right: [] })).toEqual({ left: [], right: [] });
  });

  it('drops what cannot be drawn and keeps the rest', () => {
    const layout = resolveWingLayout({
      left: [
        { id: 'recent', x: 0, y: 0 },
        { id: 'nonsense', x: 0, y: 1 },
        { id: 'star', x: 0, y: 0 },
        { id: 'drive', x: 5, y: 1 },
        { id: 'obs', x: 1, y: 1 },
      ],
      right: 'broken',
    });
    expect(layout).toEqual({ left: [{ id: 'recent', x: 0, y: 0 }, { id: 'obs', x: 1, y: 1 }], right: [] });
  });

  it('keeps a standing tile standing, and only an oblong one', () => {
    const layout = resolveWingLayout({
      left: [
        { id: 'jobs', x: 0, y: 0, tall: true },
        { id: 'star', x: 1, y: 0, tall: true },
      ],
      right: [],
    });
    expect(layout.left).toEqual([
      { id: 'jobs', x: 0, y: 0, tall: true },
      { id: 'star', x: 1, y: 0 },
    ]);
  });

  it('reads the mode, on hover when unset or unknown', () => {
    expect(notchWingsMode({})).toBe('hover');
    expect(notchWingsMode({ notchWings: 'always' })).toBe('always');
    expect(notchWingsMode({ notchWings: 'off' })).toBe('off');
    expect(notchWingsMode({ notchWings: 'sideways' })).toBe('hover');
  });
});

describe('where the wings sit', () => {
  const island = { width: 420, height: 194 };
  const along = 1040;

  it('puts each handle beside the island, centred on its height', () => {
    const left = wingRects('left', along, island);
    const right = wingRects('right', along, island);
    const islandLeft = (along - island.width) / 2;
    expect(left.handle.x + left.handle.width).toBe(islandLeft - WING_HANDLE.gap);
    expect(right.handle.x).toBe(islandLeft + island.width + WING_HANDLE.gap);
    expect(left.handle.y + left.handle.height / 2).toBe(island.height / 2);
  });

  it('opens from a zone as tall as the island, reaching out from its edge', () => {
    const islandLeft = (along - island.width) / 2;
    const left = wingRects('left', along, island).zone;
    const right = wingRects('right', along, island).zone;
    expect(left).toEqual({ x: islandLeft - WING_REACH, y: 0, width: WING_REACH, height: island.height });
    expect(right).toEqual({ x: islandLeft + island.width, y: 0, width: WING_REACH, height: island.height });
    // The pill is inside the zone it stands for.
    const pill = wingRects('left', along, island).handle;
    expect(pill.x).toBeGreaterThanOrEqual(left.x);
    expect(pill.x + pill.width).toBeLessThanOrEqual(left.x + left.width);
  });

  it('makes a wing shorter than the island and centred on it', () => {
    const { panel } = wingRects('right', along, island);
    expect(panel.height).toBeLessThan(island.height);
    expect(panel.y + panel.height / 2).toBe(island.height / 2);
    expect(panel.width).toBe(WING_WIDTH);
  });

  it('keeps both wings on the stage', () => {
    expect(wingRects('left', along, island).panel.x).toBeGreaterThanOrEqual(0);
    const right = wingRects('right', along, island).panel;
    expect(right.x + right.width).toBeLessThanOrEqual(along);
  });
});

describe('opening a wing from its handle', () => {
  const handle = { x: 100, y: 60, width: 16, height: 56 };
  const panel = { x: 106, y: 6, width: 228, height: 182 };

  function run(points: Array<[number, { x: number; y: number }]>, start: WingHover = WING_CLOSED): WingHover {
    let state = start;
    for (const [now, point] of points) state = stepWing(state, { now, point, handle, panel, dwellMs: 130, leaveMs: 320 });
    return state;
  }

  it('opens once the pointer has rested on the handle', () => {
    const on = { x: 108, y: 88 };
    expect(run([[0, on], [100, on]]).phase).toBe('dwelling');
    expect(run([[0, on], [130, on]]).phase).toBe('open');
  });

  it('does not open for a pointer that only crosses the handle', () => {
    expect(run([[0, { x: 108, y: 88 }], [50, { x: 60, y: 88 }], [200, { x: 60, y: 88 }]]).phase).toBe('closed');
  });

  it('stays open while the pointer is on the wing, and folds a grace after it leaves', () => {
    const open: WingHover = { phase: 'open', outsideSince: null };
    expect(run([[0, { x: 200, y: 100 }], [1000, { x: 200, y: 100 }]], open).phase).toBe('open');
    expect(run([[0, { x: 600, y: 100 }], [319, { x: 600, y: 100 }]], open).phase).toBe('open');
    expect(run([[0, { x: 600, y: 100 }], [320, { x: 600, y: 100 }]], open).phase).toBe('closed');
  });

  it('forgives coming back within the grace', () => {
    const open: WingHover = { phase: 'open', outsideSince: null };
    const state = run([[0, { x: 600, y: 100 }], [300, { x: 200, y: 100 }], [700, { x: 200, y: 100 }]], open);
    expect(state.phase).toBe('open');
  });
});
