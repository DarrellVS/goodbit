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
import { pathToFileURL } from 'node:url';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = libraryRoot();
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
    "export { MIN_EVENT_CONFIDENCE } from '../src/main/services/highlights/decide.js';",
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

const { moduleFor, readShape, sampleRegions, MIN_EVENT_CONFIDENCE } = await import(
  pathToFileURL(OUT).href,
);

const module = moduleFor(game);
if (!module?.regions || !module.watch) {
  console.error(`no module watches "${game}"`);
  process.exit(2);
}
console.log(`module: ${module.describe}`);

announceRoot(ROOT);

const dir = join(ROOT, game);
if (!existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

/**
 * What a trim leaves behind, which is not a recording.
 *
 * Same test as `ScanAndSyncClipsAction`'s. The library skips these and this
 * bench did not, so a failed trim's leftovers were being measured as if they
 * were clips, and a `.goodbit-trim-` file is a *copy* of one already in the
 * sample: it counts the same footage twice.
 */
const WORKING_FILE = /(^\.goodbit-(trim|bak)-|\.tmp-\d+\.[a-z0-9]+$)/i;

const files = readdirSync(dir)
  .filter((f) => VIDEO.test(f) && !WORKING_FILE.test(f))
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

/*
 * How many clips hold more than one moment.
 *
 * When this was first measured, `decide.ts` sorted the events by confidence and
 * took `[0]`, so every clip with two confident readings in it had one thrown
 * away. **That is what 2.1 changed**: the verdict now carries every confident
 * reading as `anchors`, best first, and a person can keep any of them as a
 * GoodBit. The number below is why that was worth doing and also why it was
 * not worth building a release around.
 *
 * The bar is `decide.ts`'s own `MIN_EVENT_CONFIDENCE`, imported rather than
 * copied: this bench bundles the real `src/main` anyway, and a bench holding
 * its own copy of a threshold is a bench that can quietly disagree with the app
 * about what it measured.
 */
const confident = rows.map((r) => r.events.filter((e) => e.confidence >= MIN_EVENT_CONFIDENCE));
const multi = confident.filter((events) => events.length >= 2).length;
const spread = new Map();
for (const events of confident) {
  const key = Math.min(events.length, 5);
  spread.set(key, (spread.get(key) ?? 0) + 1);
}

console.error(
  `${multi}/${rows.length} clips (${((multi / rows.length) * 100).toFixed(0)}%) hold two or more ` +
    `events at confidence >= ${MIN_EVENT_CONFIDENCE}, all of which decide() now keeps`,
);
console.error(
  'confident events per clip: ' +
    [...spread.keys()]
      .sort((a, b) => a - b)
      .map((n) => `${n === 5 ? '5+' : n}:${spread.get(n)}`)
      .join('  '),
);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2), 'utf-8');
  console.error(`wrote ${jsonOut}`);
}
