/**
 * Squeeze a real recording with the *shipped* compression and read back what
 * landed.
 *
 * This is the one operation in the app that replaces the only copy of a moment
 * and gives nothing back but disk space, so what has to be proved is not that
 * ffmpeg accepted the arguments. It is that the file left behind is the same
 * recording, smaller.
 *
 * Five questions, and each one is a failure that would otherwise be silent:
 *
 * **Is it the same length?** A truncated encode is what a full disk or a killed
 * process leaves behind: a file that plays, opens on the right frame and stops
 * early. Its size looks like a spectacular saving, and the tile looks right.
 *
 * **Did the sound survive?** A recording made through GoodBit's own OBS setup
 * carries one track per source, which is the whole reason that setup exists.
 * `-c:a copy` and `-map 0:a?` keep six tracks as six; without them the clip
 * plays perfectly and the multi-track recording is gone, and nothing says so
 * until somebody tries to mute voice chat next month.
 *
 * **Is it green?** NVDEC refuses files it looks like it should take, and it
 * decodes the discard-flagged pre-roll an old lossless cut left behind against
 * a keyframe that is no longer there. `decodeArgs` falls back to software for
 * those; this checks the frame rather than trusting it.
 *
 * **Is it grey?** OBS writes PQ/bt2020 and reading that as sRGB washes the
 * picture out. Everywhere else that is an ugly export; here it is baked into
 * the recording with no original left to redo it from.
 *
 * **Is it actually smaller?** A clip already below the share preset comes back
 * bigger, and replacing it would spend quality to gain nothing.
 *
 *   node scripts/compress-check.mjs
 *   node scripts/compress-check.mjs "Battlefield 6"
 *
 * **Read-only as far as the library is concerned.** The recording is copied to
 * a throw-away folder and the copy is what gets replaced.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, utimesSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const execFileAsync = promisify(execFile);

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;
const TMP = join(process.cwd(), 'tmp', 'compress-check');
const BUNDLE = join(TMP, 'compress-bundle.mjs');

const game = process.argv[2] ?? 'Battlefield 6';

/** Long enough that the encode is a real one rather than a few frames. */
const MIN_SOURCE_SEC = 15;
/** A frame at 60, plus slack for container rounding. */
const TOLERANCE = 0.5;

const ffprobe = (await import('ffprobe-static')).default.path;
const ffmpeg = (await import('ffmpeg-static')).default;

const probe = async (args) => (await execFileAsync(ffprobe, ['-v', 'error', ...args])).stdout.trim();
const seconds = (file) =>
  probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).then(Number);
const audioTracks = async (file) =>
  (await probe(['-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]))
    .split(/\r?\n/)
    .filter(Boolean).length;

const failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label + (detail ? `  ${detail}` : ''));
};

/**
 * One frame as a small RGB bitmap, the same way `export-check.mjs` reads one.
 *
 * 64x32, because every question here is about averages and none of them needs
 * a pixel.
 */
async function frame(file, atSec) {
  const { stdout } = await execFileAsync(
    ffmpeg,
    ['-v', 'error', '-ss', atSec.toFixed(3), '-i', file, '-vf', 'scale=64:32', '-frames:v', '1',
     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 24 },
  );

  let r = 0, g = 0, b = 0, saturation = 0;
  const pixels = Math.floor(stdout.length / 3);
  for (let i = 0; i < pixels; i++) {
    const red = stdout[i * 3], green = stdout[i * 3 + 1], blue = stdout[i * 3 + 2];
    r += red; g += green; b += blue;
    saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  return {
    rgb: [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)],
    saturation: saturation / pixels,
  };
}

/** The same test `trim-check.mjs` uses: a decoder rendering missing references. */
const isGreen = ({ rgb: [r, g, b] }) => g > 60 && g - r > 40 && g - b > 40;

/* ------------------------------------------------------------ the source */

announceRoot(ROOT);
// A file instead of a game folder runs the bench on that exact recording,
// which is how a clip somebody reports as not compressing gets reproduced.
const givenFile = VIDEO.test(game) && existsSync(game) ? game : null;
const dir = givenFile ? join(givenFile, '..') : join(ROOT, game);
if (!existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

let source = givenFile;
for (const name of givenFile ? [] : readdirSync(dir).filter((f) => VIDEO.test(f) && !f.startsWith('.'))) {
  const candidate = join(dir, name);
  if ((await seconds(candidate)) >= MIN_SOURCE_SEC) {
    source = candidate;
    break;
  }
}
if (!source) {
  console.error(`no recording of at least ${MIN_SOURCE_SEC}s in ${dir}`);
  process.exit(2);
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const library = join(tmpdir(), `goodbit-compress-check-${Date.now()}`);
const profile = join(library, '.profile');
const folder = givenFile ? 'Clips' : game;
mkdirSync(join(library, folder), { recursive: true });
mkdirSync(profile, { recursive: true });

const working = join(library, folder, source.split(/[\\/]/).pop());
copyFileSync(source, working);

/*
 * The recording's own date, put on the copy and then asserted after.
 *
 * A compression writes a new file, whose mtime is the moment the job finished.
 * Taking that as the clip's date moves an August recording into today's group,
 * and the row is the only place that can remember otherwise.
 */
const sourceStat = statSync(source);
utimesSync(working, sourceStat.atime, sourceStat.mtime);

process.env.GOODBIT_USER_DATA = profile;

const entry = join(TMP, 'entry.ts');
writeFileSync(
  entry,
  [
    "export { initDatabase, AppDataSource } from '../../src/main/data-source.js';",
    "export { Clip } from '../../src/main/entity/Clip.js';",
    "export { CompressClipAction } from '../../src/main/actions/CompressClipAction.js';",
    '',
  ].join('\n'),
  'utf-8',
);

const shim = join(TMP, 'electron-shim.mjs');
writeFileSync(
  shim,
  [
    'import { rm } from "node:fs/promises";',
    'export const app = {',
    "  getPath: () => process.env.GOODBIT_USER_DATA ?? '.',",
    "  getVersion: () => '0.0.0-compress-check',",
    "  getName: () => 'GoodBit',",
    '};',
    // The real one moves a file to the Recycle Bin. There is no bin to check
    // here and leaving the original in place would make the rename fail, so it
    // is deleted, and the bench asserts the sequence rather than the bin.
    // Refuses a forward-slash path exactly as the real one does on Windows, which is
    // how every compression in a real library failed while this bench passed.
    'export const shell = { trashItem: async (p) => { if (process.platform === "win32" && p.includes("/")) throw new Error("Failed to parse path"); await rm(p, { force: true }); } };',
    "export const screen = { getPrimaryDisplay: () => ({ id: 0, label: '' }), getAllDisplays: () => [] };",
    'export default { app, shell, screen };',
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
  outfile: BUNDLE,
  logLevel: 'warning',
  alias: { electron: shim, '@shared': join(process.cwd(), 'src', 'shared') },
  // The entities are decorated classes and the root tsconfig is a
  // references-only file, so esbuild has to be pointed at the one carrying
  // `experimentalDecorators`. See `export-check.mjs` and `migration-check.mjs`.
  tsconfig: 'tsconfig.node.json',
});

const { initDatabase, Clip, CompressClipAction } = await import(pathToFileURL(BUNDLE).href);

writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({ videosRoot: library, audioRoot: join(library, '.audio') }),
  'utf-8',
);

const dataSource = await initDatabase();
const repo = dataSource.getRepository(Clip);

const before = {
  bytes: statSync(working).size,
  seconds: await seconds(working),
  tracks: await audioTracks(working),
  mtime: statSync(working).mtime,
};

const clip = await repo.save(
  repo.create({
    // Stored the way a real library stores it: fast-glob hands back forward slashes.
    filePath: working.split(String.fromCharCode(92)).join("/"),
    relPath: working.slice(library.length + 1),
    filename: working.split(/[\\/]/).pop(),
    extension: 'mp4',
    game: folder,
    sizeBytes: before.bytes,
    durationSec: before.seconds,
    fileModifiedAt: before.mtime,
    recordedAt: before.mtime,
    published: false,
    starred: false,
  }),
);

console.log(`source: ${source}`);
console.log(
  `        ${(before.bytes / 1e6).toFixed(1)} MB, ${before.seconds.toFixed(2)}s, ` +
    `${before.tracks} audio ${before.tracks === 1 ? 'track' : 'tracks'}\n`,
);

const started = Date.now();
const result = await new CompressClipAction().execute({ clipId: clip.id });
const took = (Date.now() - started) / 1000;

const after = {
  bytes: statSync(working).size,
  seconds: await seconds(working),
  tracks: await audioTracks(working),
};
const row = await repo.findOneBy({ id: clip.id });

console.log('compressed');
console.log(`  size      ${(before.bytes / 1e6).toFixed(1)} MB to ${(after.bytes / 1e6).toFixed(1)} MB, ` +
  `${Math.round((1 - after.bytes / before.bytes) * 100)}% saved`);
console.log(`  length    ${before.seconds.toFixed(3)}s to ${after.seconds.toFixed(3)}s`);
console.log(`  audio     ${before.tracks} to ${after.tracks}`);
console.log(`  took      ${took.toFixed(1)}s, ${(took / before.seconds).toFixed(2)}s per second of footage\n`);

ok('the file was replaced', result.replaced === true, result.reason ?? '');
ok(
  'and is meaningfully smaller',
  after.bytes < before.bytes * 0.95,
  `${(after.bytes / 1e6).toFixed(1)} MB against ${(before.bytes / 1e6).toFixed(1)} MB`,
);
ok(
  'and is the same recording, not a truncated one',
  Math.abs(after.seconds - before.seconds) <= TOLERANCE,
  `${after.seconds.toFixed(3)}s against ${before.seconds.toFixed(3)}s`,
);
ok(
  'and every audio track survived',
  after.tracks === before.tracks,
  `${after.tracks} against ${before.tracks}`,
);

/*
 * The date, which is the thing a scan would undo.
 *
 * `recordedAt` on the row is the recording's own; `fileModifiedAt` follows the
 * new bytes, deliberately, because forcing the mtime backwards makes it lie
 * about a file that has just changed and every derived cache is invalidated by
 * comparing against it.
 */
const keptDate = row && new Date(row.recordedAt).getTime() === before.mtime.getTime();
ok('the recording kept its own date', Boolean(keptDate), row ? String(row.recordedAt) : 'no row');
ok(
  'and the row knows the file changed',
  Boolean(row && new Date(row.fileModifiedAt).getTime() !== before.mtime.getTime()),
);
ok('and the row carries the new size', row?.sizeBytes === after.bytes, String(row?.sizeBytes));

const opening = await frame(working, 0.1);
const middle = await frame(working, Math.min(5, after.seconds / 2));
console.log(`\n  frame 0   rgb ${opening.rgb.join(' ')}   saturation ${opening.saturation.toFixed(1)}`);
console.log(`  middle    rgb ${middle.rgb.join(' ')}   saturation ${middle.saturation.toFixed(1)}`);

ok('the opening frame is not green', !isGreen(opening), opening.rgb.join(' '));
ok('nor is the middle', !isGreen(middle), middle.rgb.join(' '));
/*
 * Not washed out. An HDR source read as sRGB collapses towards grey, and the
 * floor is deliberately low: this is a picture, not a test card, and a genuinely
 * dim night-time frame is allowed to be dull. What it catches is the total
 * collapse a missing tone map produces.
 */
ok('and the picture has colour in it', middle.saturation > 3, middle.saturation.toFixed(1));

/* ---------------------------------------- a clip that is already small */

console.log('\na clip already smaller than the preset aims for');
const small = join(library, folder, 'already-small.mp4');
await execFileAsync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=4',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
  '-c:v', 'libx264', '-crf', '40', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
  small,
]);

const smallRow = await repo.save(
  repo.create({
    filePath: small,
    relPath: small.slice(library.length + 1),
    filename: 'already-small.mp4',
    extension: 'mp4',
    game: folder,
    sizeBytes: statSync(small).size,
    durationSec: 4,
    fileModifiedAt: statSync(small).mtime,
    recordedAt: statSync(small).mtime,
    published: false,
    starred: false,
  }),
);

const smallBytes = statSync(small).size;
const smallResult = await new CompressClipAction().execute({ clipId: smallRow.id });

console.log(`  ${(smallBytes / 1e6).toFixed(2)} MB, replaced=${smallResult.replaced}, reason=${smallResult.reason ?? 'none'}`);
ok(
  'is left alone rather than re-encoded for nothing',
  smallResult.replaced === false && smallResult.reason === 'not-smaller',
  smallResult.reason ?? 'replaced',
);
ok('and its file is untouched', statSync(small).size === smallBytes);

/* ----------------------------------------------------------------- tidy up */

await dataSource.destroy();
rmSync(library, { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
