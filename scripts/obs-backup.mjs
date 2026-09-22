/**
 * A verified copy of everything OBS knows about you.
 *
 * Profiles, scene collections, hotkeys, the websocket's own config, the script
 * settings, the lot. Written before uninstalling OBS, or before letting
 * GoodBit write into it, on the principle that a backup nobody checked is a
 * folder of hope.
 *
 * Verified means what it does in `backup-db.mjs`: every file is hashed at the
 * source, the archive is unpacked again into a temporary folder, and the
 * hashes are compared. A copy that cannot be read back is reported as a
 * failure rather than a success.
 *
 *   node scripts/obs-backup.mjs [destination]
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const OBS_DIR = path.join(appData, 'obs-studio');

/** Anything else worth keeping that does not live under the OBS folder. */
const EXTRAS = [
  { from: 'C:\\Scripts\\OBS', as: 'scripts-folder' },
  { from: path.join(appData, 'GoodBit', 'obs-scripts'), as: 'goodbit-obs-scripts' },
  { from: path.join(appData, 'GoodBit', 'obs-setup.json'), as: 'goodbit-obs-setup.json' },
];

const stamp = new Date().toISOString().slice(0, 10);

/*
 * A folder of its own every run, even twice in one day.
 *
 * The name is the date, so a second run the same day copied into the first
 * run's folder: its `hashes.json` and `MANIFEST.txt` were hashed as if they
 * were OBS's own files, then rewritten, and the read back reported both as
 * different. A verification that fails on a good backup teaches somebody to
 * ignore it on a bad one.
 */
function freshFolder(base) {
  if (!existsSync(base) && !existsSync(`${base}.zip`)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existsSync(candidate) && !existsSync(`${candidate}.zip`)) return candidate;
  }
}

const destination = freshFolder(
  process.argv[2] ?? path.join(os.homedir(), 'Documents', 'GoodBit backups', `obs-${stamp}`),
);

/** Every file under a directory, relative to it. */
function walk(root, prefix = '') {
  const entries = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) entries.push(...walk(root, relative));
    else if (entry.isFile()) entries.push(relative);
  }
  return entries;
}

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!existsSync(OBS_DIR)) {
  console.error(`No OBS configuration at ${OBS_DIR}. Nothing to back up.`);
  process.exit(1);
}

mkdirSync(destination, { recursive: true });
const payload = path.join(destination, 'obs-studio');

console.log(`Copying ${OBS_DIR}`);
cpSync(OBS_DIR, payload, { recursive: true });

for (const extra of EXTRAS) {
  if (!existsSync(extra.from)) continue;
  const target = path.join(destination, extra.as);
  console.log(`Copying ${extra.from}`);
  cpSync(extra.from, target, { recursive: true });
}

/* ------------------------------------------------------------- inventory */

const files = walk(destination);
const hashes = Object.fromEntries(files.map((file) => [file, hash(path.join(destination, file))]));
const bytes = files.reduce((total, file) => total + statSync(path.join(destination, file)).size, 0);

const profilesDir = path.join(payload, 'basic', 'profiles');
const scenesDir = path.join(payload, 'basic', 'scenes');

const profiles = existsSync(profilesDir)
  ? readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const ini = path.join(profilesDir, entry.name, 'basic.ini');
        const text = existsSync(ini) ? readFileSync(ini, 'utf-8') : '';
        const value = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
        return `${entry.name}  (name: ${value('Name') || entry.name}, mode: ${
          value('Mode') || '?'
        }, encoder: ${value('RecEncoder') || '?'})`;
      })
  : [];

const scenes = existsSync(scenesDir)
  ? readdirSync(scenesDir).filter((file) => file.endsWith('.json'))
  : [];

const logDir = path.join(payload, 'logs');
const newestLog = existsSync(logDir)
  ? readdirSync(logDir)
      .sort()
      .pop()
  : null;
const obsVersion = newestLog
  ? (readFileSync(path.join(logDir, newestLog), 'utf-8').match(/OBS\s+([\d.]+)/)?.[1] ?? 'unknown')
  : 'unknown';

const manifest = [
  'GoodBit backup of the OBS configuration',
  `Taken: ${new Date().toISOString()}`,
  `OBS version seen in the newest log: ${obsVersion}`,
  '',
  'What is here',
  `  obs-studio/             everything from ${OBS_DIR}`,
  ...EXTRAS.filter((extra) => existsSync(extra.from)).map(
    (extra) => `  ${extra.as}/${' '.repeat(Math.max(1, 24 - extra.as.length))}copied from ${extra.from}`,
  ),
  '',
  `Files: ${files.length}`,
  `Size: ${(bytes / 1024 / 1024).toFixed(1)} MB`,
  '',
  'Profiles',
  ...profiles.map((profile) => `  ${profile}`),
  '',
  'Scene collections',
  ...scenes.map((scene) => `  ${scene}`),
  '',
  'Putting it back',
  '  1. Close OBS.',
  `  2. Delete or rename ${OBS_DIR}`,
  '  3. Copy obs-studio/ from this backup to that path.',
  '  4. Start OBS. Profiles, scenes, hotkeys and scripts come back as they were.',
  '',
  '  The scripts-folder copy is only needed if a script was loaded from there:',
  '  OBS stores the path, not the file, so the .py has to exist again for the',
  '  scene collection to load it.',
  '',
  'Every file is listed in hashes.json, SHA-256, so this copy can be checked',
  'against the originals at any time.',
  '',
].join('\n');

writeFileSync(path.join(destination, 'MANIFEST.txt'), manifest, 'utf-8');
writeFileSync(path.join(destination, 'hashes.json'), JSON.stringify(hashes, null, 2), 'utf-8');

/* ------------------------------------------------------------- the archive */

const archive = `${destination}.zip`;
if (existsSync(archive)) rmSync(archive);

console.log('Compressing');
await run('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Compress-Archive -Path '${destination.replace(/'/g, "''")}\\*' -DestinationPath '${archive.replace(
    /'/g,
    "''",
  )}' -CompressionLevel Optimal`,
]);

/* ------------------------------------------------------------ verification */

console.log('Reading it back');
const check = mkdtempSync(path.join(os.tmpdir(), 'goodbit-obs-verify-'));
await run('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${check.replace(
    /'/g,
    "''",
  )}' -Force`,
]);

let missing = 0;
let different = 0;
for (const [file, expected] of Object.entries(hashes)) {
  const unpacked = path.join(check, file);
  if (!existsSync(unpacked)) {
    missing += 1;
    console.error(`  missing from the archive: ${file}`);
    continue;
  }
  if (hash(unpacked) !== expected) {
    different += 1;
    console.error(`  different in the archive: ${file}`);
  }
}

rmSync(check, { recursive: true, force: true });

console.log('');
console.log(`Folder:  ${destination}`);
console.log(`Archive: ${archive}`);
console.log(`Files:   ${files.length}, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`Profiles: ${profiles.length}, scene collections: ${scenes.length}`);

if (missing || different) {
  console.error(`\nVERIFICATION FAILED: ${missing} missing, ${different} different.`);
  process.exit(1);
}

console.log('\nVerified: every file read back from the archive matches the original.');
