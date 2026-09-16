/**
 * The two-stage kill detector, run over a lot of real clips.
 *
 * Stage one is cheap and finds *a* score banner: bright near-grey ink that
 * stays pinned to the screen while the world moves behind it. Stage two only
 * runs on those frames and asks the one question that separates a kill from a
 * spot, a spawn or a captured flag, is the icon a skull?, by matching a
 * template built from confirmed kills.
 *
 *   node scripts/visual-kills.mjs "Battlefield 6" --limit 40 --json tmp/bf6-kills.json
 *
 * Read-only as far as the recordings are concerned.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { probeClip, whiteMask, stickiness } from './visual-lab.mjs';
import { findOverlayRuns } from './visual-scan.mjs';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;

/** Where the template was cut from, so everything else can scale off it. */
export const REFERENCE_HEIGHT = 1440;
export const TEMPLATE_SIZE = 64;

/**
 * The box stage one watches, and where the icon sits inside it.
 *
 * In units of frame height from the middle of the frame, a HUD scales with
 * height and holds its place, so these land correctly at 16:9 and 21:9 alike.
 */
export const BANNER = { anchor: 'centre', dx: -0.35, dy: 0.08, w: 0.45, h: 0.10, out: [504, 112] };
export const ICON = { dx: (1414 - 1720) / 1440, dy: (933 - 720) / 1440 };

/** Frame-height-relative slack, to survive a different HUD scale. */
const SEARCH = 0.022;
const SCALES = [0.88, 1, 1.14];

export function loadTemplate(path = join('tmp', 'frames', 'skull64.raw')) {
  const bytes = readFileSync(path);
  const size = Math.round(Math.sqrt(bytes.length));
  return { size, data: Float64Array.from(bytes) };
}

/** Nearest-neighbour resample of a square patch. */
function resample(patch, from, to) {
  const out = new Float64Array(to * to);
  for (let y = 0; y < to; y++) {
    const sy = Math.min(from - 1, Math.round((y * from) / to));
    for (let x = 0; x < to; x++) {
      out[y * to + x] = patch[sy * from + Math.min(from - 1, Math.round((x * from) / to))];
    }
  }
  return out;
}

function normalise(values) {
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let ss = 0;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    out[i] = values[i] - mean;
    ss += out[i] * out[i];
  }
  return { data: out, norm: Math.sqrt(ss) };
}

/** Box-filter a greyscale plane down by an integer factor. */
function shrink(plane, width, height, factor) {
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

/** One zero-mean normalised cross-correlation, at one place and one size. */
function scoreAt(window, windowWidth, patch, size, ox, oy, scaled) {
  let mean = 0;
  for (let y = 0; y < size; y++) {
    const row = (oy + y) * windowWidth + ox;
    for (let x = 0; x < size; x++) mean += window[row + x];
  }
  mean /= size * size;

  let dot = 0;
  let ss = 0;
  for (let y = 0; y < size; y++) {
    const row = (oy + y) * windowWidth + ox;
    const trow = y * size;
    for (let x = 0; x < size; x++) {
      const v = window[row + x] - mean;
      ss += v * v;
      dot += v * scaled.data[trow + x];
    }
  }
  void patch;
  const norm = Math.sqrt(ss);
  return norm ? dot / (norm * scaled.norm) : 0;
}

/**
 * The best zero-mean normalised cross-correlation of `template` anywhere in
 * `window`, over a few sizes.
 *
 * Normalised, so it does not care that the icon is drawn over a bright wall in
 * one clip and a dark floor in the next, only that the shape is the shape.
 *
 * Searched coarse first, at a third of the size, then refined around whatever
 * the coarse pass liked. Matching every offset at full size costs a hundred
 * times more and picks the same spot: an icon that stands out at full
 * resolution still stands out at a third of it.
 */
export function matchTemplate(window, windowWidth, windowHeight, template, scales = SCALES) {
  const STEP = 3;
  const coarse = shrink(window, windowWidth, windowHeight, STEP);

  const candidates = [];
  for (const scale of scales) {
    const size = Math.round(template.size * scale);
    if (size < 10 || size > windowWidth || size > windowHeight) continue;

    const small = Math.max(5, Math.round(size / STEP));
    if (small > coarse.width || small > coarse.height) continue;
    const scaledSmall = normalise(resample(template.data, template.size, small));
    if (!scaledSmall.norm) continue;

    let bestHere = { score: -1, x: 0, y: 0 };
    for (let oy = 0; oy + small <= coarse.height; oy++) {
      for (let ox = 0; ox + small <= coarse.width; ox++) {
        const score = scoreAt(coarse.data, coarse.width, null, small, ox, oy, scaledSmall);
        if (score > bestHere.score) bestHere = { score, x: ox, y: oy };
      }
    }
    candidates.push({ scale, size, coarse: bestHere });
  }

  let best = { score: -1, x: 0, y: 0, scale: 1 };
  for (const candidate of candidates) {
    const { size, scale } = candidate;
    const scaled = normalise(resample(template.data, template.size, size));
    if (!scaled.norm) continue;
    // Around the coarse pick, plus its own step, since a third-size offset is
    // three full-size ones and the true peak may sit either side.
    const cx = candidate.coarse.x * STEP;
    const cy = candidate.coarse.y * STEP;
    const reach = STEP + 1;
    for (let oy = Math.max(0, cy - reach); oy <= Math.min(windowHeight - size, cy + reach); oy++) {
      for (let ox = Math.max(0, cx - reach); ox <= Math.min(windowWidth - size, cx + reach); ox++) {
        const score = scoreAt(window, windowWidth, null, size, ox, oy, scaled);
        if (score > best.score) best = { score, x: ox, y: oy, scale };
      }
    }
  }
  return best;
}

/** Grey values of one region frame, for the matcher. */
export function toGrey(frame, width, height) {
  const out = new Float64Array(width * height);
  for (let i = 0, p = 0; i < frame.length; i += 3, p++) {
    out[p] = 0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2];
  }
  return out;
}

/**
 * Stage two: does the banner in these frames carry a skull?
 *
 * `region` is the stage-one box as sampled, `geometry` its pixel rect in the
 * source frame, so the icon's spot can be worked out in the sampled scale.
 */
export function skullScores(region, geometry, frameHeight, template, indices) {
  const { width, height, frames } = region;
  // The sampled box is the crop rescaled, so a source pixel is this many
  // sampled pixels across.
  const sx = width / geometry.w;
  const sy = height / geometry.h;
  const scale = frameHeight / REFERENCE_HEIGHT;

  const centreX = frameHeight * (16 / 9) / 2; // unused; kept explicit below
  void centreX;

  const results = [];
  for (const i of indices) {
    const frame = frames[i];
    if (!frame) continue;
    const grey = toGrey(frame, width, height);

    // Icon centre in source pixels, then in sampled pixels inside the box.
    const iconSourceX = geometry.frameWidth / 2 + ICON.dx * frameHeight;
    const iconSourceY = frameHeight / 2 + ICON.dy * frameHeight;
    const cx = (iconSourceX - geometry.x) * sx;
    const cy = (iconSourceY - geometry.y) * sy;

    const half = (TEMPLATE_SIZE * scale) / 2;
    const slack = SEARCH * frameHeight;
    const x0 = Math.max(0, Math.round((cx - half - slack * sx)));
    const y0 = Math.max(0, Math.round((cy - half - slack * sy)));
    const x1 = Math.min(width, Math.round(cx + half + slack * sx));
    const y1 = Math.min(height, Math.round(cy + half + slack * sy));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 12 || h < 12) continue;

    const window = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) window[y * w + x] = grey[(y0 + y) * width + x0 + x];
    }
    // The template was cut at the reference height; the sampled box shrank it
    // further, so match at the size it actually appears.
    const appear = Math.max(8, Math.round(TEMPLATE_SIZE * scale * sx));
    const sizes = SCALES.map((s) => (appear * s) / template.size);
    results.push({ index: i, ...matchTemplate(window, w, h, template, sizes) });
  }
  return results;
}

if (import.meta.url === `file:///${(process.argv[1] ?? '').replace(/\\/g, '/')}`) {
  const game = process.argv[2];
  if (!game) {
    console.error('usage: node scripts/visual-kills.mjs "<Game folder>" [--limit N] [--json out.json]');
    process.exit(2);
  }
  const num = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
  };
  const str = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const limit = num('--limit', 40);
  const fps = num('--fps', 4);
  const jsonOut = str('--json');
  const template = loadTemplate();

  const dir = join(ROOT, game);
  const files = readdirSync(dir)
    .filter((f) => VIDEO.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, limit);

  const rows = [];
  console.log(['clip', 'dur', 'banners', 'best', 'at', 'pos'].join('\t'));

  for (const file of files) {
    const name = file.split(/[\\/]/).pop().replace(/\.(mp4|mov|mkv)$/i, '');
    let probed;
    try {
      probed = probeClip(file, { fps, regions: { banner: BANNER } });
    } catch (error) {
      console.log([name.slice(0, 34), 'ERR', String(error.message).replace(/\s+/g, ' ').slice(0, 44)].join('\t'));
      continue;
    }
    const region = probed.regions.banner;
    const masks = region.frames.map((f) => whiteMask(f, region.width, region.height));
    const ink = masks.map((m) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n / m.length; });
    const stuck = masks.map((m, i) => stickiness(masks[i - 1], m));
    const runs = findOverlayRuns({ ink, stuck }, fps);

    const indices = [];
    for (const run of runs) {
      for (let i = Math.round(run.startSec * fps); i < Math.round(run.endSec * fps); i++) {
        if (i >= 0 && i < region.count) indices.push(i);
      }
    }
    const geometry = { ...region.rect, frameWidth: probed.width };
    const scores = skullScores(region, geometry, probed.height, template, indices);
    const best = scores.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);

    rows.push({
      file, name, durationSec: probed.durationSec, fps,
      runs, scores: scores.map((s) => ({ atSec: s.index / fps, score: s.score })),
    });
    console.log([
      name.slice(0, 34),
      probed.durationSec.toFixed(1),
      runs.length,
      best ? best.score.toFixed(3) : '-',
      best ? (best.index / fps).toFixed(1) : '-',
      best ? (best.index / fps / probed.durationSec).toFixed(2) : '-',
    ].join('\t'));
  }

  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(rows, null, 2), 'utf-8');
    console.error(`wrote ${jsonOut}`);
  }
}
