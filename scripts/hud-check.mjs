/**
 * Run the *shipped* HUD detector over real recordings.
 *
 * The `visual-*.mjs` benches are where the rule was worked out; this is the
 * check that the code which actually ships still finds the same things. It
 * bundles the real modules out of `src/main` with esbuild and drives them
 * directly, so there is one implementation rather than a copy that drifts.
 *
 *   node scripts/hud-check.mjs "Battlefield 6" --limit 40
 *   node scripts/hud-check.mjs "Battlefield 6" --json tmp/hud-check.json
 *
 * Read-only as far as the recordings are concerned.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Videos') : join(homedir(), 'Videos');
const VIDEO = /\.(mp4|mov|mkv)$/i;
const OUT = join(process.cwd(), 'tmp', 'hud-bundle.mjs');

const game = process.argv[2] ?? 'Battlefield 6';
const num = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const str = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const limit = num('--limit', 40);
const jsonOut = str('--json');

// One entry that re-exports what the check needs, bundled with the real code.
const entry = join(process.cwd(), 'tmp', 'hud-entry.ts');
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
writeFileSync(
  entry,
  [
    "export { moduleFor } from '../src/main/services/highlights/registry.js';",
    "export { readShape, sampleRegions } from '../src/main/services/highlights/vision/sample.js';",
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

const { moduleFor, readShape, sampleRegions } = await import(pathToFileURL(OUT).href);

const module = moduleFor(game);
if (!module?.regions || !module.watch) {
  console.error(`no module watches "${game}"`);
  process.exit(2);
}
console.log(`module: ${module.describe}`);

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

const FPS = 4;
const rows = [];
console.log(['clip', 'dur', 'events', 'at', 'pos', 'conf', 'ms', 'reason'].join('\t'));

for (const file of files) {
  const name = file.split(/[\\/]/).pop().replace(/\.(mp4|mov|mkv)$/i, '');
  const shape = await readShape(file);
  if (!shape) {
    console.log([name.slice(0, 30), 'ERR'].join('\t'));
    continue;
  }
  const started = Date.now();
  const regions = await sampleRegions({ filePath: file, regions: module.regions, fps: FPS, shape });
  const events = Object.keys(regions).length
    ? module.watch({
        regions,
        fps: FPS,
        frameWidth: shape.width,
        frameHeight: shape.height,
        durationSec: shape.durationSec,
      })
    : [];
  const ms = Date.now() - started;
  const first = events[0];

  rows.push({ name, file, durationSec: shape.durationSec, ms, events });
  console.log([
    name.slice(0, 30),
    shape.durationSec.toFixed(1),
    events.length,
    first ? first.atSec.toFixed(1) : '-',
    first ? (first.atSec / shape.durationSec).toFixed(2) : '-',
    first ? first.confidence.toFixed(3) : '-',
    ms,
    first ? first.reason : '',
  ].join('\t'));
}

const withEvents = rows.filter((r) => r.events.length).length;
const totalMs = rows.reduce((sum, r) => sum + r.ms, 0);
const totalSec = rows.reduce((sum, r) => sum + r.durationSec, 0);
console.error(
  `\n${withEvents}/${rows.length} clips had an event; ` +
    `${(totalMs / 1000).toFixed(1)}s for ${totalSec.toFixed(0)}s of footage ` +
    `(${(totalMs / 1000 / totalSec).toFixed(3)}s per second)`,
);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2), 'utf-8');
  console.error(`wrote ${jsonOut}`);
}
