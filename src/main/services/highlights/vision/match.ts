import type { Template } from './templates.js';

/**
 * Finding a known picture inside a frame.
 *
 * Zero-mean normalised cross-correlation, which scores 1 for the same shape
 * however bright the scene behind it is and however dark the icon was drawn —
 * the reason a plain brightness test could not do this job. A kill banner over
 * a sunlit wall and the same banner over wet tarmac score alike.
 *
 * Searched coarse first, at a third of the size, then refined around whatever
 * the coarse pass liked. Matching every offset at full size costs about a
 * hundred times more and picked the same spot on every clip it was measured
 * against: an icon that stands out at full resolution still stands out at a
 * third of it.
 */

export interface Match {
  /** -1 to 1. Above ~0.9 means the shape is really there. */
  score: number;
  /** Where the top-left of the match sits inside the searched window. */
  x: number;
  y: number;
  /** The width the template matched at, in window pixels. */
  width: number;
  height: number;
}

const NO_MATCH: Match = { score: -1, x: 0, y: 0, width: 0, height: 0 };

/** How far apart the tried sizes are, either side of the expected one. */
const SIZES = [0.88, 1, 1.14];
const COARSE_STEP = 3;

interface Prepared {
  data: Float64Array;
  norm: number;
  width: number;
  height: number;
}

function centre(values: Float64Array): { data: Float64Array; norm: number } {
  let mean = 0;
  for (let i = 0; i < values.length; i++) mean += values[i];
  mean /= values.length;

  const data = new Float64Array(values.length);
  let ss = 0;
  for (let i = 0; i < values.length; i++) {
    data[i] = values[i] - mean;
    ss += data[i] * data[i];
  }
  return { data, norm: Math.sqrt(ss) };
}

/** Nearest-neighbour resample; the shapes here are blunt enough for it. */
function resample(
  source: ArrayLike<number>,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): Float64Array {
  const out = new Float64Array(toWidth * toHeight);
  for (let y = 0; y < toHeight; y++) {
    const sy = Math.min(fromHeight - 1, Math.round((y * fromHeight) / toHeight));
    for (let x = 0; x < toWidth; x++) {
      const sx = Math.min(fromWidth - 1, Math.round((x * fromWidth) / toWidth));
      out[y * toWidth + x] = source[sy * fromWidth + sx];
    }
  }
  return out;
}

function prepare(template: Template, width: number, height: number): Prepared | null {
  const scaled = resample(template.data, template.width, template.height, width, height);
  const { data, norm } = centre(scaled);
  return norm ? { data, norm, width, height } : null;
}

/** Box-filter a plane down by an integer factor. */
function shrink(
  plane: Float64Array,
  width: number,
  height: number,
  factor: number,
): { data: Float64Array; width: number; height: number } {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * width + x * factor;
        for (let dx = 0; dx < factor; dx++) sum += plane[row + dx];
      }
      out[y * w + x] = sum / (factor * factor);
    }
  }
  return { data: out, width: w, height: h };
}

function scoreAt(
  plane: Float64Array,
  planeWidth: number,
  ox: number,
  oy: number,
  template: Prepared,
): number {
  const { width, height, data: tpl, norm: tplNorm } = template;

  let mean = 0;
  for (let y = 0; y < height; y++) {
    const row = (oy + y) * planeWidth + ox;
    for (let x = 0; x < width; x++) mean += plane[row + x];
  }
  mean /= width * height;

  let dot = 0;
  let ss = 0;
  for (let y = 0; y < height; y++) {
    const row = (oy + y) * planeWidth + ox;
    const trow = y * width;
    for (let x = 0; x < width; x++) {
      const v = plane[row + x] - mean;
      ss += v * v;
      dot += v * tpl[trow + x];
    }
  }
  const norm = Math.sqrt(ss);
  return norm ? dot / (norm * tplNorm) : 0;
}

export interface MatchOptions {
  /** The width the template is expected to appear at, in window pixels. */
  expectedWidth: number;
  /** Sizes to try, as multiples of the expected one. */
  sizes?: number[];
}

/**
 * The best match for `template` anywhere in a greyscale window.
 *
 * `expectedWidth` comes from the caller because only it knows how the frame
 * was scaled on the way in; the aspect of the template is preserved from
 * there.
 */
export function findTemplate(
  window: Float64Array,
  windowWidth: number,
  windowHeight: number,
  template: Template,
  { expectedWidth, sizes = SIZES }: MatchOptions,
): Match {
  const aspect = template.height / template.width;
  const coarse = shrink(window, windowWidth, windowHeight, COARSE_STEP);

  const candidates: Array<{ width: number; height: number; x: number; y: number }> = [];
  for (const size of sizes) {
    const width = Math.round(expectedWidth * size);
    const height = Math.round(width * aspect);
    if (width < 10 || height < 6 || width > windowWidth || height > windowHeight) continue;

    const smallWidth = Math.max(5, Math.round(width / COARSE_STEP));
    const smallHeight = Math.max(4, Math.round(height / COARSE_STEP));
    if (smallWidth > coarse.width || smallHeight > coarse.height) continue;
    const small = prepare(template, smallWidth, smallHeight);
    if (!small) continue;

    let best = { score: -1, x: 0, y: 0 };
    for (let oy = 0; oy + smallHeight <= coarse.height; oy++) {
      for (let ox = 0; ox + smallWidth <= coarse.width; ox++) {
        const score = scoreAt(coarse.data, coarse.width, ox, oy, small);
        if (score > best.score) best = { score, x: ox, y: oy };
      }
    }
    candidates.push({ width, height, x: best.x * COARSE_STEP, y: best.y * COARSE_STEP });
  }

  let best: Match = NO_MATCH;
  for (const candidate of candidates) {
    const full = prepare(template, candidate.width, candidate.height);
    if (!full) continue;
    // A coarse offset is three full-size ones, and the true peak can sit
    // either side of it.
    const reach = COARSE_STEP + 1;
    const maxX = windowWidth - candidate.width;
    const maxY = windowHeight - candidate.height;
    for (let oy = Math.max(0, candidate.y - reach); oy <= Math.min(maxY, candidate.y + reach); oy++) {
      for (let ox = Math.max(0, candidate.x - reach); ox <= Math.min(maxX, candidate.x + reach); ox++) {
        const score = scoreAt(window, windowWidth, ox, oy, full);
        if (score > best.score) {
          best = { score, x: ox, y: oy, width: candidate.width, height: candidate.height };
        }
      }
    }
  }
  return best;
}
