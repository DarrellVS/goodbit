/**
 * What GoodBit makes of this machine's Steam.
 *
 * Which library folders resolve to an appid, and which of those have artwork
 * cached. In the style of `obs-check.mjs`: a diagnostic printed against the
 * real machine, not an assertion, because the answer is different on every
 * machine and the useful output is the list of misses.
 *
 *   node scripts/steam-check.mjs
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'goodbit-steam-check-'));

const entry = join(dir, 'entry.mjs');
writeFileSync(
  entry,
  `export { appIdForGame } from ${JSON.stringify(
    join(process.cwd(), 'src/main/services/steam/appIds.ts').replace(/\\/g, '/'),
  )};
export { artworkFor, steamArtworkAvailable } from ${JSON.stringify(
    join(process.cwd(), 'src/main/services/steam/artwork.ts').replace(/\\/g, '/'),
  )};`,
  'utf-8',
);

// The modules reach `electron` for the settings folder; only the Steam side is
// wanted here, so it is stubbed rather than the app being launched.
const shim = join(dir, 'electron.mjs');
writeFileSync(
  shim,
  `export const app = { getPath: () => process.cwd(), getVersion: () => '0' };
export default { app };`,
  'utf-8',
);

const bundle = join(dir, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  external: ['better-sqlite3', 'sqlite3', 'typeorm'],
  alias: { electron: shim },
  logLevel: 'error',
});

const { appIdForGame, artworkFor, steamArtworkAvailable } = await import(
  `file://${bundle.replace(/\\/g, '/')}`
);

const root = process.argv[2] ?? join(process.env.USERPROFILE ?? '', 'Videos');
console.log(`\n  Library: ${root}`);
console.log(`  Steam artwork cache: ${(await steamArtworkAvailable()) ? 'found' : 'not found'}\n`);

const folders = existsSync(root)
  ? readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  : [];

let matched = 0;
let withArt = 0;
const misses = [];

for (const folder of folders) {
  const appId = await appIdForGame(folder);
  if (!appId) {
    misses.push(folder);
    continue;
  }

  matched += 1;
  const art = await artworkFor(appId);
  const kinds = Object.keys(art);
  if (kinds.length) withArt += 1;

  console.log(
    `  ${folder.padEnd(30)} ${appId.padEnd(8)} ${kinds.length ? kinds.join(', ') : 'no art cached'}`,
  );
}

console.log(`\n  ${matched} of ${folders.length} folders are Steam games`);
console.log(`  ${withArt} of those have artwork on this disk\n`);

if (misses.length) {
  console.log('  Not matched (many of these are correctly not games):');
  for (const miss of misses) console.log(`    ${miss}`);
  console.log('');
}

rmSync(dir, { recursive: true, force: true });
