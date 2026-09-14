/**
 * Render what a detector actually pointed at, so it can be judged by eye.
 *
 * Takes the JSON `visual-scan.mjs` writes and builds contact sheets: one tile
 * per detected run, cropped to the region the rule watched, at the moment it
 * fired. A rule is only worth shipping once these sheets show the thing it
 * claims to find, numbers alone have been wrong before.
 *
 *   node scripts/visual-verify.mjs tmp/bf6-visual.json --out tmp/verify --per-sheet 8
 *   node scripts/visual-verify.mjs tmp/bf6-visual.json --misses      # clips with no run
 *
 * Read-only as far as the recordings are concerned.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { probeInfo, resolveRegion, BF6_REGIONS } from './visual-lab.mjs';

const FFMPEG = ffmpegPath;
const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node scripts/visual-verify.mjs <scan.json> [--out dir] [--per-sheet 8] [--misses]');
  process.exit(2);
}
const str = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = str('--out', join('tmp', 'verify'));
const perSheet = Number(str('--per-sheet', 8));
const misses = process.argv.includes('--misses');

const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/**
 * A tile is the watched region plus a margin around it, so the sheet shows
 * both what the rule measured and enough of the frame to judge it.
 */
const MARGIN = 1.6;

const tiles = [];
for (const row of rows) {
  const picks = misses
    ? row.runs.length ? [] : [{ startSec: row.durationSec * 0.85 }]
    : row.runs;
  for (const run of picks) {
    tiles.push({ file: row.file, name: row.name, at: run.startSec + 0.5, run });
  }
}

if (!tiles.length) {
  console.error('nothing to render');
  process.exit(0);
}

const TILE_W = 760;
const TILE_H = 200;
let made = 0;
const paths = [];

for (const tile of tiles) {
  let info;
  try {
    info = probeInfo(tile.file);
  } catch {
    continue;
  }
  const base = resolveRegion(BF6_REGIONS.kill, info.width, info.height);
  const w = Math.min(info.width, Math.round(base.w * MARGIN / 2) * 2);
  const h = Math.min(info.height, Math.round(base.h * MARGIN / 2) * 2);
  const x = Math.min(Math.max(0, base.x - Math.round((w - base.w) / 2)), info.width - w);
  const y = Math.min(Math.max(0, base.y - Math.round((h - base.h) / 2)), info.height - h);

  const out = join(outDir, `tile_${String(made).padStart(3, '0')}.png`);
  try {
    execFileSync(
      FFMPEG,
      ['-hide_banner', '-v', 'error', '-y', '-ss', String(Math.max(0, tile.at)), '-i', tile.file,
       '-frames:v', '1',
       '-vf', `${info.isHdr ? `${TONEMAP},` : ''}crop=${w}:${h}:${x}:${y},scale=${TILE_W}:${TILE_H}`,
       out],
      { stdio: 'pipe' },
    );
  } catch {
    continue;
  }
  paths.push(out);
  console.log(`${String(made).padStart(3, '0')}  ${tile.name}  @${tile.at.toFixed(1)}s` +
    (tile.run.peakInk ? `  ink ${(tile.run.peakInk * 100).toFixed(2)}%  stuck ${tile.run.meanStuck.toFixed(2)}` : ''));
  made++;
}

for (let i = 0; i < paths.length; i += perSheet) {
  const group = paths.slice(i, i + perSheet);
  const sheet = join(outDir, `sheet_${String(i / perSheet).padStart(2, '0')}.png`);
  // vstack needs two; a leftover tile is a sheet of its own.
  execFileSync(
    FFMPEG,
    group.length > 1
      ? ['-hide_banner', '-v', 'error', '-y',
         ...group.flatMap((p) => ['-i', p]),
         '-filter_complex', `${group.map((_, k) => `[${k}]`).join('')}vstack=inputs=${group.length}`,
         sheet]
      : ['-hide_banner', '-v', 'error', '-y', '-i', group[0], sheet],
    { stdio: 'pipe' },
  );
  console.log(`sheet: ${sheet}  (tiles ${i}..${i + group.length - 1})`);
}
