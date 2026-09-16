/**
 * What GoodBit would call the clip you saved right now.
 *
 * This is the bench that decides whether the naming is safe to ship.
 * GoodBit takes the game name from the program that was in front while the
 * clip was recording, rather than from whatever happens to be focused at the
 * moment the key is pressed, because by then the user has often alt-tabbed.
 *
 * So: run it beside a real session, changing nothing, and read what it would
 * have decided second by second.
 *
 *   node scripts/foreground-check.mjs            # ten minutes
 *   node scripts/foreground-check.mjs 60         # one minute
 *
 * It prints a line whenever the answer changes, and a tally at the end. What
 * you are looking for is a real game that comes out `Unsorted`, or a launcher
 * (the EA app, Battle.net) holding the foreground while the game renders
 * behind it. Either one means the override table has to ship in the same
 * release rather than the one after it.
 *
 * Like `hud-check.mjs`, this bundles `src/main` with esbuild and calls the
 * shipped code, so the bench and the app cannot drift apart.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const seconds = Number(process.argv[2] ?? 600);
const dir = mkdtempSync(join(tmpdir(), 'goodbit-fg-check-'));

// The app's modules import `electron` for the settings directory, which does
// not exist outside Electron. Only two functions are wanted here, so the
// import is stubbed rather than the app being launched.
const entry = join(dir, 'entry.mjs');
writeFileSync(
  entry,
  `
export { startForegroundHistory, currentForeground, samplesBetween } from ${JSON.stringify(
    join(process.cwd(), 'src/main/services/capture/foregroundHistory.ts').replace(/\\/g, '/'),
  )};
export { gameForExecutable, libraryFolders } from ${JSON.stringify(
    join(process.cwd(), 'src/main/services/capture/gameNames.ts').replace(/\\/g, '/'),
  )};
`,
  'utf-8',
);

const shim = join(dir, 'electron-shim.mjs');
writeFileSync(
  shim,
  `import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = join(process.env.APPDATA ?? process.cwd(), 'GoodBit');
mkdirSync(dir, { recursive: true });
export const app = { getPath: () => dir };
export default { app };
`,
  'utf-8',
);

const bundle = join(dir, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  external: ['better-sqlite3', 'typeorm'],
  alias: { electron: shim },
  logLevel: 'error',
});

const { startForegroundHistory, currentForeground, gameForExecutable, libraryFolders } =
  await import(`file://${bundle.replace(/\\/g, '/')}`);

const videosRoot = process.env.GOODBIT_VIDEOS_ROOT ?? join(process.env.USERPROFILE ?? '', 'Videos');
const existing = libraryFolders(videosRoot);

console.log(`\n  Library: ${videosRoot}`);
console.log(`  Folders already there: ${existing.length ? existing.join(', ') : 'none'}`);
console.log(`  Sampling for ${seconds}s. Play something.\n`);

await startForegroundHistory();

const tally = new Map();
let last = '';

const timer = setInterval(async () => {
  const sample = currentForeground();
  if (!sample?.exePath) return;

  const guess = await gameForExecutable(sample.exePath, existing);
  const line = `${guess.name}  (${guess.source})`;
  tally.set(line, (tally.get(line) ?? 0) + 1);

  if (line !== last) {
    const when = new Date().toLocaleTimeString();
    console.log(`  ${when}  ${line.padEnd(38)} ${sample.exePath}`);
    last = line;
  }
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  console.log('\n  Seconds per answer:\n');
  for (const [line, count] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${line}`);
  }
  console.log('');
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}, seconds * 1000);
