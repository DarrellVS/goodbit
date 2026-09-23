/**
 * The notch's wings: two panels of tiles, one either side of the open island.
 *
 * The island answers "what just happened"; the wings answer the next two
 * questions somebody at a quiet desktop has, what else is there to cut and is
 * the machine fine, without opening the app. Each wing is a 2x2 grid and a
 * tile is one cell, a row or column of two, or all four.
 *
 * Worked out here rather than in main or in Settings because both need the same
 * answers: which tiles exist and what shape they take, whether a layout read
 * out of `settings.json` is one that can be drawn, where the shapes land on
 * the stage. Two copies of those rules is how the configurator shows a layout
 * the notch then refuses to draw. Pure, so `tests/unit` owns it.
 *
 * ## Shapes
 *
 * A tile is `small` (1x1), `large` (2x2) or `oblong`. An oblong tile lies wide
 * (2x1) unless somebody stands it up (1x2), and every one of them can do both:
 * the grid is square, so which way a pair of cells runs is a matter of what
 * else is in the wing, not of the tile. Wide by default, because text reads
 * along a row.
 */

export type NotchWingsMode = 'off' | 'hover' | 'always';

export type WingSide = 'left' | 'right';

export type TileId =
  | 'recent'
  | 'session'
  | 'found'
  | 'jobs'
  | 'drive'
  | 'play'
  | 'tags'
  | 'star'
  | 'share'
  | 'views'
  | 'obs'
  | 'week';

export type TileKind = 'small' | 'oblong' | 'large';

export interface TileSpec {
  kind: TileKind;
  name: string;
  /** One sentence for the configurator. */
  description: string;
  /** What has to be set up before the tile means anything. */
  needs?: 'publisher' | 'steam';
}

/**
 * Every tile there is, in the order the configurator lists them.
 *
 * Each one reads something GoodBit already owns or is one press on an Action
 * that already exists. Things that were considered and left out, and why, are
 * in CLAUDE.md under the notch.
 */
export const TILES: Record<TileId, TileSpec> = {
  session: {
    kind: 'large',
    name: 'Tonight',
    description: "Today's clips from the game you played last, marked where GoodBits were found.",
  },
  recent: {
    kind: 'oblong',
    name: 'Recent clips',
    description: 'The clips before the latest. Press one to trim it.',
  },
  jobs: {
    kind: 'oblong',
    name: 'Running jobs',
    description: 'Exports and trims in progress, with the time left.',
  },
  play: {
    kind: 'oblong',
    name: 'Play again',
    description: 'The last game you recorded, launched through Steam.',
    needs: 'steam',
  },
  tags: {
    kind: 'oblong',
    name: 'Tag the latest',
    description: 'Your most used tags. Press one to add it to the latest clip.',
  },
  views: {
    kind: 'oblong',
    name: 'Views',
    description: 'How often your published clips were watched, and which one most.',
    needs: 'publisher',
  },
  week: {
    kind: 'oblong',
    name: 'This week',
    description: 'Clips from the last seven days, and the games they came from.',
  },
  found: {
    kind: 'small',
    name: 'Found GoodBits',
    description: "What reading today's clips found. Press it to go through them.",
  },
  drive: {
    kind: 'small',
    name: 'Drive',
    description: 'The space left, as hours of recording at your own bitrate.',
  },
  star: {
    kind: 'small',
    name: 'Star the latest',
    description: 'Star or unstar the latest clip.',
  },
  share: {
    kind: 'small',
    name: 'Share the latest',
    description: 'Publish the latest clip and copy its link.',
    needs: 'publisher',
  },
  obs: {
    kind: 'small',
    name: 'OBS',
    description: 'Whether OBS is running, and the key that saves a clip.',
  },
};

export const TILE_IDS = Object.keys(TILES) as TileId[];

export function isTileId(value: unknown): value is TileId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TILES, value);
}

export interface Placement {
  id: TileId;
  x: number;
  y: number;
  /** An oblong tile stood up, 1x2. Meaningless for the others. */
  tall?: boolean;
}

export interface WingLayout {
  left: Placement[];
  right: Placement[];
}

export interface TileSize {
  w: 1 | 2;
  h: 1 | 2;
}

export function tileSize(placement: Pick<Placement, 'id' | 'tall'>): TileSize {
  const kind = TILES[placement.id].kind;
  if (kind === 'small') return { w: 1, h: 1 };
  if (kind === 'large') return { w: 2, h: 2 };
  return placement.tall ? { w: 1, h: 2 } : { w: 2, h: 1 };
}

/** Clips on the left, the machine on the right. */
export const DEFAULT_WING_LAYOUT: WingLayout = {
  left: [
    { id: 'recent', x: 0, y: 0 },
    { id: 'found', x: 0, y: 1 },
    { id: 'star', x: 1, y: 1 },
  ],
  right: [
    { id: 'jobs', x: 0, y: 0 },
    { id: 'drive', x: 0, y: 1 },
    { id: 'obs', x: 1, y: 1 },
  ],
};

function cells(placement: Placement): Array<[number, number]> {
  const { w, h } = tileSize(placement);
  const out: Array<[number, number]> = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push([placement.x + dx, placement.y + dy]);
  return out;
}

/**
 * Whether a tile can go at `x, y` in a wing.
 *
 * `skip` is the index of a placement to ignore, which is the tile being moved
 * within its own wing: it should not collide with where it came from.
 */
export function canPlace(wing: Placement[], candidate: Placement, skip = -1): boolean {
  const { w, h } = tileSize(candidate);
  if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return false;
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + w > 2 || candidate.y + h > 2) return false;
  const taken = new Set<string>();
  for (let i = 0; i < wing.length; i++) {
    if (i === skip) continue;
    if (wing[i].id === candidate.id) return false;
    for (const [cx, cy] of cells(wing[i])) taken.add(`${cx},${cy}`);
  }
  return cells(candidate).every(([cx, cy]) => !taken.has(`${cx},${cy}`));
}

/** The first place a tile fits, reading left to right and top to bottom. */
export function firstFit(wing: Placement[], id: TileId, tall = false): Placement | null {
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const candidate: Placement = { id, x, y, ...(tall ? { tall } : {}) };
      if (canPlace(wing, candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Stand an oblong tile up or lay it down, where it is.
 *
 * Kept at its own corner when that fits, and moved to the first place that does
 * when not, so the button never silently does nothing. Null when it fits
 * nowhere, which the configurator shows as a disabled button.
 */
export function rotated(wing: Placement[], index: number): Placement | null {
  const current = wing[index];
  if (!current || TILES[current.id].kind !== 'oblong') return null;
  const turned: Placement = { id: current.id, x: current.x, y: current.y, tall: !current.tall };
  const { w, h } = tileSize(turned);
  turned.x = Math.min(turned.x, 2 - w);
  turned.y = Math.min(turned.y, 2 - h);
  if (canPlace(wing, turned, index)) return turned;
  const others = wing.filter((_, i) => i !== index);
  return firstFit(others, current.id, turned.tall);
}

function cleanWing(raw: unknown): Placement[] {
  if (!Array.isArray(raw)) return [];
  const out: Placement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, x, y, tall } = item as Record<string, unknown>;
    if (!isTileId(id)) continue;
    const candidate: Placement = { id, x: Number(x), y: Number(y) };
    if (tall === true && TILES[id].kind === 'oblong') candidate.tall = true;
    if (canPlace(out, candidate)) out.push(candidate);
  }
  return out;
}

/**
 * A layout that can be drawn, out of whatever `settings.json` holds.
 *
 * Unset is the default layout. Anything else is taken tile by tile: unknown
 * tiles, tiles off the grid and tiles overlapping one placed before them are
 * dropped rather than failing the whole wing, since a hand-edited file with one
 * typo should not empty both panels. An explicitly empty wing stays empty.
 */
export function resolveWingLayout(raw: unknown): WingLayout {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_WING_LAYOUT);
  const { left, right } = raw as Record<string, unknown>;
  return { left: cleanWing(left), right: cleanWing(right) };
}

export function notchWingsMode(settings: { notchWings?: unknown }): NotchWingsMode {
  const value = settings.notchWings;
  return value === 'off' || value === 'always' ? value : 'hover';
}

/*
 * Geometry, in stage pixels with y = 0 at the screen edge. Main tests the
 * pointer against these and the page draws at them, so they are one set of
 * numbers.
 */

/** One cell of a wing, the gap between cells and the wing's own padding. Rows share what height is left. */
export const WING_CELL = { width: 103, gap: 6, pad: 8 } as const;
/** A wing is this wide; its height follows the island's. */
export const WING_WIDTH = WING_CELL.pad * 2 + WING_CELL.width * 2 + WING_CELL.gap;
/** How much shorter than the island a wing is, top and bottom together. */
export const WING_INSET = 12;
/** The pill either side of the island that says a wing is there. */
export const WING_HANDLE = { width: 16, height: 56, gap: 3 } as const;
/**
 * How far out from the island's edge resting the pointer opens a wing, over
 * the island's whole height.
 *
 * Much bigger than the pill it stands for. Aiming at a 6 pixel pill beside a
 * card is fiddly, and "move off the side of the island and wait" is a gesture
 * nobody has to aim at all.
 */
export const WING_REACH = 120;
/** Between a handle's outer edge and its wing. */
export const WING_OFFSET = 6;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WingRects {
  /** Where the pill is drawn. */
  handle: Rect;
  /** Where resting the pointer opens the wing. */
  zone: Rect;
  panel: Rect;
}

/**
 * Where a handle and its wing sit on a stage `along` wide, beside an island
 * `island.width` by `island.height` hanging from the middle of the edge.
 */
export function wingRects(
  side: WingSide,
  along: number,
  island: { width: number; height: number },
): WingRects {
  const islandLeft = (along - island.width) / 2;
  const handleY = (island.height - WING_HANDLE.height) / 2;
  const panelY = WING_INSET / 2;
  const panelHeight = island.height - WING_INSET;
  if (side === 'left') {
    const handleX = islandLeft - WING_HANDLE.gap - WING_HANDLE.width;
    return {
      handle: { x: handleX, y: handleY, width: WING_HANDLE.width, height: WING_HANDLE.height },
      zone: { x: islandLeft - WING_REACH, y: 0, width: WING_REACH, height: island.height },
      panel: { x: handleX + WING_HANDLE.width - WING_OFFSET - WING_WIDTH, y: panelY, width: WING_WIDTH, height: panelHeight },
    };
  }
  const handleX = islandLeft + island.width + WING_HANDLE.gap;
  return {
    handle: { x: handleX, y: handleY, width: WING_HANDLE.width, height: WING_HANDLE.height },
    zone: { x: islandLeft + island.width, y: 0, width: WING_REACH, height: island.height },
    panel: { x: handleX + WING_OFFSET, y: panelY, width: WING_WIDTH, height: panelHeight },
  };
}
