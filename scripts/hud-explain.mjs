/**
 * Why the shipped detector said what it said, frame by frame.
 *
 * Prints every test the Battlefield module applies for one clip, so a miss can
 * be traced to the test that rejected it rather than guessed at.
 *
 *   node scripts/hud-explain.mjs "<clip path>" [--from 20] [--to 29]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const filePath = process.argv[2];
if (!filePath) {
  console.error('usage: node scripts/hud-explain.mjs "<clip>" [--from N] [--to N]');
  process.exit(2);
}
const num = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const from = num('--from', 0);
const to = num('--to', Infinity);

const OUT = join(process.cwd(), 'tmp', 'hud-explain-bundle.mjs');
const entry = join(process.cwd(), 'tmp', 'hud-explain-entry.ts');
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
writeFileSync(
  entry,
  [
    "export { moduleFor } from '../src/main/services/highlights/registry.js';",
    "export { readShape, sampleRegions } from '../src/main/services/highlights/vision/sample.js';",
    "export { crop, greyscale, glyphSaturation } from '../src/main/services/highlights/vision/pixels.js';",
    "export { findTemplate } from '../src/main/services/highlights/vision/match.js';",
    "export { BF_SKULL, BF_KILL_LABEL } from '../src/main/services/highlights/vision/templates.js';",
    "export { REFERENCE_HEIGHT } from '../src/main/services/highlights/vision/geometry.js';",
    "import '../src/main/services/highlights/games/index.js';",
    '',
  ].join('\n'),
  'utf-8',
);

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: OUT,
  logLevel: 'warning',
});

const m = await import(pathToFileURL(OUT).href);
const module = m.moduleFor('Battlefield 6');
const HUD = module.regions.hud;

const shape = await m.readShape(filePath);
console.log(`${shape.width}x${shape.height}  ${shape.durationSec.toFixed(1)}s  hdr=${shape.isHdr}`);

const fps = 4;
const regions = await m.sampleRegions({ filePath, regions: module.regions, fps, shape });
const hud = regions.hud;
console.log(`sampled ${hud.frames.length} frames of ${hud.width}x${hud.height} from ${JSON.stringify(hud.rect)}`);

const REF = m.REFERENCE_HEIGHT;
const ICON = { dx: (1414 - 1720) / REF, dy: (933 - 720) / REF };
const BAND = { top: (986 - 720) / REF, bottom: (1072 - 720) / REF };
const skullWidth = (m.BF_SKULL.width * HUD.out[0]) / (HUD.w * REF);
const labelWidth = (m.BF_KILL_LABEL.width * HUD.out[0]) / (HUD.w * REF);

const perX = hud.width / hud.rect.w;
const perY = hud.height / hud.rect.h;
const iconX = (shape.width / 2 + ICON.dx * shape.height - hud.rect.x) * perX;
const iconY = (shape.height / 2 + ICON.dy * shape.height - hud.rect.y) * perY;
const slackX = 0.022 * shape.height * perX;
const slackY = 0.022 * shape.height * perY;
const bx = Math.max(0, Math.round(iconX - skullWidth / 2 - slackX));
const by = Math.max(0, Math.round(iconY - skullWidth / 2 - slackY));
const bw = Math.min(hud.width, Math.round(iconX + skullWidth / 2 + slackX)) - bx;
const bh = Math.min(hud.height, Math.round(iconY + skullWidth / 2 + slackY)) - by;
const labelTop = Math.max(0, Math.round((shape.height / 2 + BAND.top * shape.height - hud.rect.y) * perY));
const labelBottom = Math.min(hud.height, Math.round((shape.height / 2 + BAND.bottom * shape.height - hud.rect.y) * perY));
const labelH = labelBottom - labelTop;

console.log(`icon box ${bw}x${bh} at ${bx},${by}   label band y ${labelTop}..${labelBottom}`);
console.log(['t', 'skull', 'sat', 'label', 'verdict'].join('\t'));

hud.frames.forEach((frame, i) => {
  const t = i / fps;
  if (t < from || t > to) return;
  const grey = m.greyscale(frame);
  const win = m.crop(grey, frame.width, { x: bx, y: by, w: bw, h: bh });
  const skull = m.findTemplate(win, bw, bh, m.BF_SKULL, { expectedWidth: skullWidth });
  const sat = m.glyphSaturation(frame, { x: bx + skull.x, y: by + skull.y, w: skull.width, h: skull.height });
  const band = m.crop(grey, frame.width, { x: 0, y: labelTop, w: frame.width, h: labelH });
  const label = m.findTemplate(band, frame.width, labelH, m.BF_KILL_LABEL, { expectedWidth: labelWidth }).score;

  let verdict = '';
  if (skull.score < 0.8) verdict = 'skull too weak';
  else if (sat > 0.3) verdict = 'coloured, assist';
  else if (skull.score >= 0.9 || label >= 0.74) verdict = 'HIT';
  else verdict = 'no label to confirm';

  console.log([t.toFixed(2), skull.score.toFixed(3), sat.toFixed(2), label.toFixed(3), verdict].join('\t'));
});
