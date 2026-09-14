/**
 * What stage one threw away.
 *
 * Runs the skull matcher over *every* sampled frame of the clips where the
 * cheap banner test found nothing, which is the only way to tell a clip with
 * no kill in it from a kill the first stage missed. Slow on purpose: this is a
 * bench, not the app.
 *
 *   node scripts/visual-kills-recall.mjs tmp/bf6-kills.json --min 0.9
 */
import { readFileSync } from 'node:fs';
import { probeClip } from './visual-lab.mjs';
import { BANNER, loadTemplate, skullScores } from './visual-kills.mjs';

const jsonPath = process.argv[2];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const min = arg('--min', 0.9);
const fps = arg('--fps', 4);

const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const quiet = rows.filter((r) => !r.runs?.length);
const template = loadTemplate();

console.log(`${quiet.length} clips had no banner run; matching every frame\n`);
console.log(['clip', 'dur', 'best', 'at', 'pos', 'over'].join('\t'));

for (const row of quiet) {
  let probed;
  try {
    probed = probeClip(row.file, { fps, regions: { banner: BANNER } });
  } catch (error) {
    console.log([row.name.slice(0, 34), 'ERR', String(error.message).replace(/\s+/g, ' ').slice(0, 40)].join('\t'));
    continue;
  }
  const region = probed.regions.banner;
  const indices = Array.from({ length: region.count }, (_, i) => i);
  const geometry = { ...region.rect, frameWidth: probed.width };
  const scores = skullScores(region, geometry, probed.height, template, indices);
  const best = scores.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
  const over = scores.filter((s) => s.score >= min).length;

  console.log([
    row.name.slice(0, 34),
    probed.durationSec.toFixed(1),
    best ? best.score.toFixed(3) : '-',
    best ? (best.index / fps).toFixed(1) : '-',
    best ? (best.index / fps / probed.durationSec).toFixed(2) : '-',
    over,
  ].join('\t'));
}
