/**
 * Show what the skull matcher scored, so the threshold is set by looking
 * rather than by taste.
 *
 *   node scripts/visual-kills-verify.mjs tmp/bf6-kills.json --out tmp/kills
 *
 * One tile per clip's best match, ordered by score, cropped to the banner and
 * its surroundings. Read the sheets top to bottom and the cut between a kill
 * and a spot, a spawn or a flag is wherever the skulls stop.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { probeInfo, resolveRegion } from './visual-lab.mjs';
import { BANNER } from './visual-kills.mjs';

const FFMPEG = ffmpegPath;
const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node scripts/visual-kills-verify.mjs <kills.json> [--out dir] [--per-sheet 8]');
  process.exit(2);
}
const str = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = str('--out', join('tmp', 'kills'));
const perSheet = Number(str('--per-sheet', 8));

const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const picks = [];
for (const row of rows) {
  if (!row.scores?.length) continue;
  const best = row.scores.reduce((a, b) => (b.score > a.score ? b : a));
  // Keep the grab inside the file: a match on the final sample sits within a
  // frame of the end, and seeking past it renders nothing.
  const at = Math.max(0, Math.min(best.atSec + 0.25, (row.durationSec ?? 0) - 0.15));
  picks.push({ file: row.file, name: row.name, at, score: best.score });
}
picks.sort((a, b) => b.score - a.score);

const TILE_W = 820;
const TILE_H = 190;
const paths = [];

picks.forEach((pick, index) => {
  let info;
  try {
    info = probeInfo(pick.file);
  } catch {
    return;
  }
  const base = resolveRegion(BANNER, info.width, info.height);
  const w = Math.min(info.width, Math.round(base.w * 1.5 / 2) * 2);
  const h = Math.min(info.height, Math.round(base.h * 1.7 / 2) * 2);
  const x = Math.min(Math.max(0, base.x - Math.round((w - base.w) / 2)), info.width - w);
  const y = Math.min(Math.max(0, base.y - Math.round((h - base.h) / 2)), info.height - h);

  const out = join(outDir, `k_${String(index).padStart(3, '0')}.png`);
  try {
    execFileSync(
      FFMPEG,
      ['-hide_banner', '-v', 'error', '-y', '-ss', String(Math.max(0, pick.at)), '-i', pick.file,
       '-frames:v', '1',
       '-vf', `${info.isHdr ? `${TONEMAP},` : ''}crop=${w}:${h}:${x}:${y},scale=${TILE_W}:${TILE_H}`,
       out],
      { stdio: 'pipe' },
    );
  } catch {
    return;
  }
  paths.push(out);
  console.log(`${String(index).padStart(3, '0')}  ${pick.score.toFixed(3)}  ${pick.name}  @${pick.at.toFixed(1)}s`);
});

for (let i = 0; i < paths.length; i += perSheet) {
  const group = paths.slice(i, i + perSheet);
  const sheet = join(outDir, `sheet_${String(i / perSheet).padStart(2, '0')}.png`);
  execFileSync(
    FFMPEG,
    group.length > 1
      ? ['-hide_banner', '-v', 'error', '-y', ...group.flatMap((p) => ['-i', p]),
         '-filter_complex', `${group.map((_, k) => `[${k}]`).join('')}vstack=inputs=${group.length}`, sheet]
      : ['-hide_banner', '-v', 'error', '-y', '-i', group[0], sheet],
    { stdio: 'pipe' },
  );
  console.log(`sheet: ${sheet}  (${i}..${i + group.length - 1})`);
}
