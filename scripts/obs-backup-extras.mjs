/**
 * The OBS bits that do not live in `%APPDATA%\obs-studio`.
 *
 * Found while clearing up for a clean install: a Stream Deck plugin under
 * `%PROGRAMDATA%\obs-studio\plugins`, put there by Elgato's own installer
 * rather than by OBS, and whatever the uninstaller left in Program Files.
 * Neither is in the main backup, because neither is where OBS keeps its
 * configuration, and both would have been deleted unrecorded.
 *
 *   node scripts/obs-backup-extras.mjs <backup folder>
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

const destination = process.argv[2];
if (!destination) {
  console.error('Give me the backup folder to add to.');
  process.exit(1);
}

const EXTRAS = [
  {
    from: path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'obs-studio'),
    as: 'programdata-obs-studio',
    note: 'Third-party plugins, installed system wide. The Stream Deck plugin lives here.',
  },
  {
    from: 'C:\\Program Files\\obs-studio',
    as: 'program-files-leftover',
    note: 'Whatever the uninstaller left behind in the install folder.',
  },
];

function walk(root, prefix = '') {
  const entries = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) entries.push(...walk(root, relative));
    else if (entry.isFile()) entries.push(relative);
  }
  return entries;
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

mkdirSync(destination, { recursive: true });

const added = [];
for (const extra of EXTRAS) {
  if (!existsSync(extra.from)) {
    console.log(`not here: ${extra.from}`);
    continue;
  }
  console.log(`Copying ${extra.from}`);
  cpSync(extra.from, path.join(destination, extra.as), { recursive: true });
  added.push(extra);
}

if (!added.length) {
  console.log('Nothing to add.');
  process.exit(0);
}

/*
 * The manifest is written before anything is hashed.
 *
 * The other way round records a hash for a file this then appends to, so the
 * archive fails its own verification. Which it did, and which is the point of
 * having one.
 */
const MARKER = 'Added afterwards, from outside the OBS configuration folder';
const manifestPath = path.join(destination, 'MANIFEST.txt');

const counted = walk(destination).filter(
  (file) => file !== 'hashes.json' && file !== 'MANIFEST.txt',
);
const countedBytes = counted.reduce(
  (total, file) => total + statSync(path.join(destination, file)).size,
  0,
);

// Re-running must not stack a second copy of this section on the first.
const existing = readFileSync(manifestPath, 'utf-8');
const base = existing.includes(MARKER) ? existing.slice(0, existing.indexOf(MARKER)) : existing;

const extraNotes = [
  MARKER,
  ...added.map((extra) => `  ${extra.as}/  <- ${extra.from}\n      ${extra.note}`),
  '',
  `Files now: ${counted.length + 2}, ${(countedBytes / 1024 / 1024).toFixed(1)} MB`,
  '',
  'The Stream Deck plugin is installed by the Stream Deck software, so it comes',
  'back on its own if that is reinstalled or repaired. This copy is the quick way.',
  '',
].join('\n');
writeFileSync(manifestPath, `${base}${extraNotes}`, 'utf-8');

// Everything, now that the manifest is final.
const files = walk(destination).filter((file) => file !== 'hashes.json');
const hashes = Object.fromEntries(files.map((file) => [file, hash(path.join(destination, file))]));
const bytes = files.reduce((total, file) => total + statSync(path.join(destination, file)).size, 0);
writeFileSync(path.join(destination, 'hashes.json'), JSON.stringify(hashes, null, 2), 'utf-8');

/* Rebuild and re-verify the archive. */
const archive = `${destination}.zip`;
if (existsSync(archive)) rmSync(archive);

console.log('Compressing');
await run('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Compress-Archive -Path '${destination.replace(/'/g, "''")}\\*' -DestinationPath '${archive.replace(/'/g, "''")}' -CompressionLevel Optimal`,
]);

console.log('Reading it back');
const check = mkdtempSync(path.join(os.tmpdir(), 'goodbit-obs-verify-'));
await run('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${check.replace(/'/g, "''")}' -Force`,
]);

let bad = 0;
for (const [file, expected] of Object.entries(hashes)) {
  const unpacked = path.join(check, file);
  if (!existsSync(unpacked) || hash(unpacked) !== expected) {
    bad += 1;
    console.error(`  not readable back: ${file}`);
  }
}
rmSync(check, { recursive: true, force: true });

console.log('');
console.log(`Archive: ${archive}`);
console.log(`Files:   ${files.length}, ${(bytes / 1024 / 1024).toFixed(1)} MB`);

if (bad) {
  console.error(`\nVERIFICATION FAILED: ${bad} files.`);
  process.exit(1);
}
console.log('\nVerified: every file read back from the archive matches the original.');
