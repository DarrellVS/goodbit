/**
 * Run a candidate HUD signal over a lot of real clips at once.
 *
 * One line per clip: whether the signal fired, when, and where that sits in
 * the clip. A signal worth shipping fires on most clips of a game where
 * something happened, rarely on the rest, and lands near the end, which is
 * where a replay buffer's moment lives.
 *
 *   node scripts/visual-scan.mjs "Battlefield 6" --limit 40 --fps 4
 *   node scripts/visual-scan.mjs "Battlefield 6" --json tmp/bf6-visual.json
 *
 * Read-only as far as the recordings are concerned.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { probeClip, whiteMask, stickiness, BF6_REGIONS } from './visual-lab.mjs';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;

/**
 * Ink that stays put.
 *
 * `ink` is the share of the region that is bright and near-grey; `stuck` is
 * how much of that ink landed on itself since the last sample. Scenery can be
 * as bright as a HUD for seconds on end, but it slides with the camera, so
 * the pair separates an overlay from a sunlit wall, which brightness alone
 * could not.
 */
export function inkSeries(region) {
  const { frames, width, height } = region;
  const masks = frames.map((f) => whiteMask(f, width, height));
  const ink = masks.map((m) => {
    let n = 0;
    for (let i = 0; i < m.length; i++) n += m[i];
    return n / m.length;
  });
  const stuck = masks.map((m, i) => stickiness(masks[i - 1], m));
  return { ink, stuck };
}

/**
 * `maxInk` is what keeps a lit wall out: a banner is glyphs, so it covers a
 * fraction of a percent of the box, never a tenth of it.
 */
export const DEFAULTS = { minInk: 0.002, maxInk: 0.04, minStuck: 0.2, minRun: 3 };

/** Every stretch where the ink is present and pinned for long enough. */
export function findOverlayRuns({ ink, stuck }, fps, opts = {}) {
  const { minInk, maxInk, minStuck, minRun } = { ...DEFAULTS, ...opts };
  const held = ink.map((v, i) => v >= minInk && v <= maxInk && stuck[i] >= minStuck);

  const runs = [];
  let start = -1;
  for (let i = 0; i <= held.length; i++) {
    if (held[i]) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && i - start >= minRun) {
      // Walk back over the fade-in: the overlay animates up to full strength,
      // so the first sample that is clearly lit is closer to the event than
      // the first sample that satisfied every test.
      const peak = Math.max(...ink.slice(start, i));
      let onset = start;
      // At most a second: the fade-in is a few frames, and without a limit a
      // clip that is mildly bright throughout walks all the way back to zero.
      const floor = Math.max(0, start - Math.round(fps));
      while (onset > floor && ink[onset - 1] >= peak * 0.25) onset--;
      runs.push({
        startSec: onset / fps,
        endSec: i / fps,
        samples: i - start,
        peakInk: peak,
        meanStuck: stuck.slice(start, i).reduce((a, b) => a + b, 0) / (i - start),
      });
    }
    start = -1;
  }
  return runs;
}

if (import.meta.url === `file:///${(process.argv[1] ?? '').replace(/\\/g, '/')}`) {
  const game = process.argv[2];
  if (!game) {
    console.error('usage: node scripts/visual-scan.mjs "<Game folder>" [--limit N] [--fps 4] [--json out.json]');
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

  const dir = join(ROOT, game);
  if (!existsSync(dir)) {
    console.error(`no such folder: ${dir}`);
    process.exit(2);
  }

  const files = readdirSync(dir)
    .filter((f) => VIDEO.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, limit);

  const rows = [];
  console.log(['clip', 'dur', 'runs', 'first', 'last', 'pos', 'ink%', 'stuck'].join('\t'));

  for (const file of files) {
    const name = file.split(/[\\/]/).pop().replace(/\.(mp4|mov|mkv)$/i, '');
    let probed;
    try {
      probed = probeClip(file, { fps, regions: { kill: BF6_REGIONS.kill } });
    } catch (error) {
      console.log([name.slice(0, 36), 'ERR', String(error.message).replace(/\s+/g, ' ').slice(0, 50)].join('\t'));
      continue;
    }
    const series = inkSeries(probed.regions.kill);
    const runs = findOverlayRuns(series, fps);
    const last = runs[runs.length - 1];

    rows.push({ file, name, durationSec: probed.durationSec, runs });
    console.log([
      name.slice(0, 36),
      probed.durationSec.toFixed(1),
      runs.length,
      runs.length ? runs[0].startSec.toFixed(1) : '-',
      last ? last.startSec.toFixed(1) : '-',
      last ? (last.startSec / probed.durationSec).toFixed(2) : '-',
      last ? (last.peakInk * 100).toFixed(2) : '-',
      last ? last.meanStuck.toFixed(2) : '-',
    ].join('\t'));
  }

  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(rows, null, 2), 'utf-8');
    console.error(`\nwrote ${jsonOut}`);
  }

  const withRuns = rows.filter((r) => r.runs.length).length;
  console.error(`\n${withRuns}/${rows.length} clips had at least one overlay run`);
}
