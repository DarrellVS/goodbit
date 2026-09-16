/**
 * Does the matcher still need to be told where the icon sits?
 *
 * Runs the same clips twice: once searching a small window around the place
 * the icon sat in this library, once searching the whole banner box. If the
 * wide search separates kills from everything else just as cleanly, the
 * detector can drop an assumption about HUD layout, which is the assumption
 * most likely to be wrong on someone else's monitor.
 *
 *   node scripts/visual-kills-sweep.mjs "Battlefield 6" --limit 40
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { probeClip } from './visual-lab.mjs';
import { BANNER, ICON, REFERENCE_HEIGHT, TEMPLATE_SIZE, loadTemplate, matchTemplate, toGrey } from './visual-kills.mjs';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;

const game = process.argv[2] ?? 'Battlefield 6';
const num = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const limit = num('--limit', 40);
const fps = num('--fps', 4);
const template = loadTemplate();

const files = readdirSync(join(ROOT, game))
  .filter((f) => VIDEO.test(f))
  .map((f) => join(ROOT, game, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .slice(0, limit);

/** Best score over the frames; `slackUnits` null searches the whole box. */
function best(region, geometry, frameHeight, frameWidth, slackUnits) {
  const { width, height, frames } = region;
  const sx = width / geometry.w;
  const sy = height / geometry.h;
  const appear = Math.max(8, Math.round(TEMPLATE_SIZE * (frameHeight / REFERENCE_HEIGHT) * sx));
  const sizes = [0.88, 1, 1.14].map((s) => (appear * s) / template.size);

  let top = { score: -1, atSec: 0 };
  frames.forEach((frame, i) => {
    const grey = toGrey(frame, width, height);
    let x0 = 0, y0 = 0, x1 = width, y1 = height;
    if (slackUnits !== null) {
      const cx = (frameWidth / 2 + ICON.dx * frameHeight - geometry.x) * sx;
      const cy = (frameHeight / 2 + ICON.dy * frameHeight - geometry.y) * sy;
      const half = appear / 2;
      const slack = slackUnits * frameHeight;
      x0 = Math.max(0, Math.round(cx - half - slack * sx));
      y0 = Math.max(0, Math.round(cy - half - slack * sy));
      x1 = Math.min(width, Math.round(cx + half + slack * sx));
      y1 = Math.min(height, Math.round(cy + half + slack * sy));
    }
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 12 || h < 12) return;
    const window = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) window[y * w + x] = grey[(y0 + y) * width + x0 + x];
    }
    const match = matchTemplate(window, w, h, template, sizes);
    if (match.score > top.score) top = { score: match.score, atSec: i / fps };
  });
  return top;
}

const rows = [];
console.log(['clip', 'dur', 'tight', 'at', 'wide', 'at'].join('\t'));
for (const file of files) {
  const name = file.split(/[\\/]/).pop().replace(/\.(mp4|mov|mkv)$/i, '');
  let probed;
  try {
    probed = probeClip(file, { fps, regions: { banner: BANNER } });
  } catch {
    console.log([name.slice(0, 34), 'ERR'].join('\t'));
    continue;
  }
  const region = probed.regions.banner;
  const geometry = region.rect;
  const tight = best(region, geometry, probed.height, probed.width, 0.022);
  const wide = best(region, geometry, probed.height, probed.width, null);
  rows.push({ file, name, durationSec: probed.durationSec, tight, wide });
  console.log([
    name.slice(0, 34), probed.durationSec.toFixed(1),
    tight.score.toFixed(3), tight.atSec.toFixed(1),
    wide.score.toFixed(3), wide.atSec.toFixed(1),
  ].join('\t'));
}

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/bf6-sweep.json', JSON.stringify(rows, null, 2), 'utf-8');
console.error('wrote tmp/bf6-sweep.json');
