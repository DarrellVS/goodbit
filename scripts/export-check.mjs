/**
 * Render a short movie with the *shipped* export, twice, and read back what
 * landed.
 *
 * The export rework exists for one reason: the old shape, one encoded segment
 * per clip joined by the concat demuxer, cannot express a transition, because
 * `xfade` needs overlapping frames from two sources and the concat demuxer only
 * ever puts one finished file after another. So the thing to prove is not that
 * a filter graph parses. It is that the movie on disk is the one that was asked
 * for, and that what sits at the seam is a dissolve rather than a cut.
 *
 * Four questions, and each one has been the wrong answer at some point in this
 * codebase:
 *
 * **Is it as long as it was asked for?** A dissolve is taken out of both of its
 * neighbours, so two one second dissolves over three five second clips is a
 * thirteen second movie, not fifteen. `xfade` at `offset=0` outputs
 * `in0 + in1 - duration`, so an input that is not bounded gives a segment that
 * runs to the end of the recording instead of to the end of the blend, and the
 * container duration is the only thing that says so.
 *
 * **Is the dissolve actually there?** The definition of a cross dissolve is
 * that the middle of it is halfway between the two sources, so that is what is
 * measured: the blend's midpoint frame against the average of the two source
 * frames it came from. A cut would sit on one of them. This is the check that
 * cannot be argued with.
 *
 * **Is it green?** `decodeArgs` falls back to software for a source carrying a
 * discard flagged pre-roll, because NVDEC decodes those frames against a
 * keyframe that is no longer in the file and renders them flat green. A
 * transition reads two files and has to ask that question twice.
 *
 * **Is it grey?** OBS writes PQ/bt2020 and reading that as sRGB is what made
 * every export washed out. A transition decodes two streams at once, so getting
 * it wrong on one side leaves half the dissolve grey. The saturation of the
 * blend is compared to the segments either side of it, which came through the
 * known-good cut path.
 *
 *   node scripts/export-check.mjs
 *   node scripts/export-check.mjs "Battlefield 6"
 *   node scripts/export-check.mjs --source <folder>
 *
 * **Read-only as far as the library is concerned.** The recordings are copied
 * out to a throw-away library under the system temp directory, and the render,
 * the database and the settings all live in a `GOODBIT_USER_DATA` profile of
 * this run's own, which is the same override the app and the e2e suite honour.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const execFileAsync = promisify(execFile);

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;
const TMP = join(process.cwd(), 'tmp', 'export-check');
const BUNDLE = join(TMP, 'export-bundle.mjs');

const game = process.argv.find((arg, at) => at >= 2 && !arg.startsWith('--') && process.argv[at - 1] !== '--source')
  ?? 'Battlefield 6';

/** Three clips, five seconds each, which is the shape of a real short movie. */
const CLIP_COUNT = 3;
const TRIM_START = 6;
const TRIM_LENGTH = 5;
const DISSOLVE = 1;
/** Long enough that a five second cut starting at six is not the opening GOP. */
const MIN_SOURCE_SEC = 20;
/** One frame at 60, plus slack for container rounding. */
const TOLERANCE = 0.08;

const ffprobe = (await import('ffprobe-static')).default.path;
const ffmpeg = (await import('ffmpeg-static')).default;

const probe = async (args) => (await execFileAsync(ffprobe, ['-v', 'error', ...args])).stdout.trim();
const seconds = (file) =>
  probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).then(Number);

const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,' +
  'zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/**
 * One frame, as a small RGB bitmap this script can do arithmetic on.
 *
 * 64x32 rather than full size: the questions here are all about averages and
 * differences, none of them need a pixel, and decoding one 3440x1440 frame per
 * question adds minutes to a bench whose whole point is being runnable.
 */
async function frame(file, atSec, { tonemap = false } = {}) {
  const chain = [tonemap ? TONEMAP : null, 'scale=64:32'].filter(Boolean).join(',');
  const { stdout } = await execFileAsync(
    ffmpeg,
    ['-v', 'error', '-ss', atSec.toFixed(3), '-i', file, '-vf', chain, '-frames:v', '1',
     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 24 },
  );
  return stdout;
}

/** Mean absolute difference per channel, 0..255. */
function difference(a, b) {
  const n = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.abs(a[i] - b[i]);
  return total / n;
}

/** The frame a true cross dissolve would show halfway through. */
function average(a, b) {
  const n = Math.min(a.length, b.length);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] + b[i]) >> 1;
  return out;
}

/**
 * Mean brightness, how much it varies, and how far from neutral it sits.
 *
 * A picture that was decoded as sRGB when it was really PQ is flat and close to
 * grey on all three: that is what "washed out" is, as numbers.
 */
function stats(buffer) {
  let luma = 0;
  let saturation = 0;
  let green = 0;
  let red = 0;
  let blue = 0;
  const pixels = Math.floor(buffer.length / 3);

  for (let i = 0; i < pixels; i++) {
    const r = buffer[i * 3];
    const g = buffer[i * 3 + 1];
    const b = buffer[i * 3 + 2];
    luma += 0.299 * r + 0.587 * g + 0.114 * b;
    saturation += Math.max(r, g, b) - Math.min(r, g, b);
    red += r;
    green += g;
    blue += b;
  }

  const mean = luma / pixels;
  let variance = 0;
  for (let i = 0; i < pixels; i++) {
    const value = 0.299 * buffer[i * 3] + 0.587 * buffer[i * 3 + 1] + 0.114 * buffer[i * 3 + 2];
    variance += (value - mean) ** 2;
  }

  return {
    mean,
    contrast: Math.sqrt(variance / pixels),
    saturation: saturation / pixels,
    rgb: [red / pixels, green / pixels, blue / pixels].map(Math.round),
  };
}

/** The same test `trim-check.mjs` uses: a decoder rendering missing references. */
function isGreen({ rgb: [r, g, b] }) {
  return g > 60 && g - r > 40 && g - b > 40;
}

let failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label + (detail ? `  ${detail}` : ''));
};

/* ------------------------------------------------------------ the sources */

announceRoot(ROOT);
const dir = join(ROOT, game);
if (!existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

rmSync(TMP, { recursive: true, force: true });
const library = join(tmpdir(), `goodbit-export-check-${Date.now()}`);
const profile = join(library, '.profile');
mkdirSync(join(library, game), { recursive: true });
mkdirSync(profile, { recursive: true });
mkdirSync(TMP, { recursive: true });

const sources = [];
for (const name of readdirSync(dir).filter((f) => VIDEO.test(f) && !f.startsWith('.'))) {
  if (sources.length === CLIP_COUNT) break;
  const candidate = join(dir, name);
  if ((await seconds(candidate)) < MIN_SOURCE_SEC) continue;

  // Copied out, never worked on in place. The library is read-only.
  const copy = join(library, game, name);
  copyFileSync(candidate, copy);
  sources.push(copy);
}

if (sources.length < CLIP_COUNT) {
  console.error(`need ${CLIP_COUNT} recordings of at least ${MIN_SOURCE_SEC}s in ${dir}, found ${sources.length}`);
  process.exit(2);
}

const first = await probe([
  '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,codec_name,color_transfer',
  '-of', 'csv=p=0', sources[0],
]);
console.log(`sources    ${sources.length} copied to ${library}`);
console.log(`            ${first}`);

/* --------------------------------------------------- the shipped export */

/*
 * `settings.ts` opens with `import { app } from 'electron'`, which resolves to
 * nothing outside Electron, so it is aliased to a shim answering from
 * `GOODBIT_USER_DATA`. Same trick as `migration-check.mjs`.
 */
const shim = join(TMP, 'electron-shim.mjs');
writeFileSync(
  shim,
  [
    'export const app = {',
    "  getPath: () => process.env.GOODBIT_USER_DATA ?? '.',",
    "  getVersion: () => '0.0.0-export-check',",
    "  getName: () => 'GoodBit',",
    '};',
    // Reached transitively: the export asks for a clip's audio tracks, which
    // reads the OBS manifest, which sits in a module that also enumerates
    // displays. Nothing in this bench calls it, but esbuild still has to
    // resolve the import, and a shim missing a name fails the whole bundle
    // rather than the one path that uses it.
    'export const screen = {',
    "  getPrimaryDisplay: () => ({ id: 0, label: '' }),",
    '  getAllDisplays: () => [],',
    '};',
    'export default { app, screen };',
    '',
  ].join('\n'),
  'utf-8',
);

const entry = join(TMP, 'entry.ts');
writeFileSync(
  entry,
  [
    "export { initDatabase, AppDataSource } from '../../src/main/data-source.js';",
    "export { Clip } from '../../src/main/entity/Clip.js';",
    "export { ExportTimelineAction } from '../../src/main/actions/ExportTimelineAction.js';",
    "export { isClipLayout } from '../../src/shared/constants/videoFiles.js';",
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
  alias: { electron: shim, '@shared': join(process.cwd(), 'src', 'shared') },
  outfile: BUNDLE,
  logLevel: 'warning',
  // The entities are decorated classes and the root tsconfig is a
  // references-only file, so esbuild has to be pointed at the one with
  // `experimentalDecorators` in it. See `migration-check.mjs`.
  tsconfig: 'tsconfig.node.json',
});

process.env.GOODBIT_USER_DATA = profile;
writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({ videosRoot: library, audioRoot: join(library, '.audio') }, null, 2),
  'utf-8',
);

const { initDatabase, Clip, ExportTimelineAction, isClipLayout } = await import(
  pathToFileURL(BUNDLE).href,
);

// The data source itself, not the module's `AppDataSource` binding. That one is
// null until `initDatabase` assigns it, and destructuring an ESM export takes a
// copy of whatever it held at that moment rather than following it.
const dataSource = await initDatabase();

const repo = dataSource.getRepository(Clip);
const rows = [];
for (const filePath of sources) {
  const stat = statSync(filePath);
  rows.push(
    await repo.save(
      repo.create({
        filePath,
        relPath: filePath.slice(library.length + 1),
        filename: filePath.split(/[\\/]/).pop(),
        extension: '.mp4',
        game,
        sizeBytes: stat.size,
        fileModifiedAt: stat.mtime,
        published: false,
        starred: false,
      }),
    ),
  );
}

const timeline = rows.map((row, index) => ({
  clipId: row.id,
  startTime: index * TRIM_LENGTH,
  trimStart: TRIM_START,
  trimEnd: TRIM_START + TRIM_LENGTH,
  volume: 1,
  muted: false,
}));

async function render(outputName, transitions, clipsOverride) {
  const started = Date.now();
  const { clip } = await new ExportTimelineAction().execute({
    clips: clipsOverride ?? timeline,
    transitions,
    outputName,
    format: 'original',
    framePos: 0.5,
  });
  return { path: clip.filePath, clip, took: (Date.now() - started) / 1000 };
}

/* ---------------------------------------- 1. the shape it always produced */

console.log('\ncuts only, which is what the pipeline did before');
const cuts = await render(`export-check-cuts-${Date.now()}`, []);
const cutsSec = await seconds(cuts.path);
const wantedCuts = CLIP_COUNT * TRIM_LENGTH;

console.log(`  on disk   ${cutsSec.toFixed(3)}s, wanted ${wantedCuts.toFixed(3)}s`);
console.log(`  took      ${cuts.took.toFixed(1)}s, ${(cuts.took / cutsSec).toFixed(2)}s per second of output`);
console.log(`            ${(statSync(cuts.path).size / 1e6).toFixed(1)} MB`);

ok(
  'an export with no transitions is as long as its clips',
  Math.abs(cutsSec - wantedCuts) <= TOLERANCE,
  `${cutsSec.toFixed(3)}s against ${wantedCuts.toFixed(3)}s`,
);

/* --------------------------------------------------- 2. with a dissolve */

console.log('\nwith a cross dissolve in each of the two seams');
const transitions = [
  { afterIndex: 0, type: 'crossDissolve', durationSec: DISSOLVE },
  { afterIndex: 1, type: 'crossDissolve', durationSec: DISSOLVE },
];
const blended = await render(`export-check-dissolve-${Date.now()}`, transitions);
const blendedSec = await seconds(blended.path);
// Every dissolve is taken out of both of its neighbours, so the movie gets
// shorter by exactly the overlap, once per transition.
const wantedBlend = wantedCuts - transitions.length * DISSOLVE;

console.log(`  on disk   ${blendedSec.toFixed(3)}s, wanted ${wantedBlend.toFixed(3)}s`);
console.log(`  took      ${blended.took.toFixed(1)}s, ${(blended.took / blendedSec).toFixed(2)}s per second of output`);
console.log(`            ${(statSync(blended.path).size / 1e6).toFixed(1)} MB`);

ok(
  'a dissolve shortens the movie by exactly its own length, once per seam',
  Math.abs(blendedSec - wantedBlend) <= TOLERANCE,
  `${blendedSec.toFixed(3)}s against ${wantedBlend.toFixed(3)}s`,
);

/* ------------------------------------- 3. is what sits at the seam a blend */

/*
 * The first seam begins where clip one's body ends. Clip one gives up its last
 * `DISSOLVE` seconds, so the body is `TRIM_LENGTH - DISSOLVE` long and the
 * blend runs from there for `DISSOLVE`.
 */
const seamStart = TRIM_LENGTH - DISSOLVE;
const seamMid = seamStart + DISSOLVE / 2;

console.log('\nwhat is at the seam');

const blendFrame = await frame(blended.path, seamMid);
// The same instant, out of each source, through the same tone map the export
// applies. Clip one is half a dissolve from its own trimEnd; clip two is half a
// dissolve past its trimStart.
const leftFrame = await frame(sources[0], TRIM_START + TRIM_LENGTH - DISSOLVE / 2, { tonemap: true });
const rightFrame = await frame(sources[1], TRIM_START + DISSOLVE / 2, { tonemap: true });

const toAverage = difference(blendFrame, average(leftFrame, rightFrame));
const toLeft = difference(blendFrame, leftFrame);
const toRight = difference(blendFrame, rightFrame);

console.log(`  midpoint is ${toAverage.toFixed(1)} from the average of the two sources`);
console.log(`              ${toLeft.toFixed(1)} from the outgoing clip alone`);
console.log(`              ${toRight.toFixed(1)} from the incoming clip alone`);

ok(
  'the middle of the dissolve is nearer the average of both clips than either one',
  toAverage < toLeft && toAverage < toRight,
  `${toAverage.toFixed(1)} against ${toLeft.toFixed(1)} and ${toRight.toFixed(1)}`,
);

// And the same instant in the cuts-only render is one clip or the other,
// never the average. Without this the check above could pass on two clips that
// happen to look alike.
const cutFrame = await frame(cuts.path, seamMid);
const cutToAverage = difference(cutFrame, average(leftFrame, rightFrame));
const cutToLeft = difference(cutFrame, leftFrame);
console.log(`  the same instant without a transition is ${cutToLeft.toFixed(1)} from the outgoing clip`);
ok(
  'the same instant without a transition sits on one clip, not between two',
  cutToLeft < cutToAverage,
  `${cutToLeft.toFixed(1)} against ${cutToAverage.toFixed(1)}`,
);

/* ------------------------------------------- 4. green, and grey, either side */

console.log('\ncolour across the seam');

const samples = [
  ['just before the blend', seamStart - 0.2],
  ['the first frame of it', seamStart + 0.02],
  ['the middle of it', seamMid],
  ['the last frame of it', seamStart + DISSOLVE - 0.02],
  ['just after it', seamStart + DISSOLVE + 0.2],
];

const measured = [];
for (const [label, at] of samples) {
  const picture = stats(await frame(blended.path, at));
  measured.push({ label, at, ...picture });
  console.log(
    `  ${label.padEnd(24)} rgb ${String(picture.rgb).padEnd(15)} ` +
      `mean ${picture.mean.toFixed(0).padStart(3)}  contrast ${picture.contrast.toFixed(0).padStart(3)}` +
      `  saturation ${picture.saturation.toFixed(0).padStart(3)}`,
  );
}

ok(
  'no frame across the seam is green',
  measured.every((m) => !isGreen(m)),
  measured.filter(isGreen).map((m) => m.label).join(', '),
);

/*
 * Grey is the tone map having been skipped, and the honest comparison is
 * against the frames either side, which came through the cut path this
 * codebase has been shipping. A dissolve is a blend of two pictures, so it is
 * allowed to be a little flatter than either; half of what its neighbours have
 * is the line between "a blend" and "one side was read as sRGB".
 */
const outside = [measured[0], measured[4]];
const inside = [measured[1], measured[2], measured[3]];
const floor = Math.min(...outside.map((m) => m.saturation)) * 0.5;
const contrastFloor = Math.min(...outside.map((m) => m.contrast)) * 0.5;

ok(
  'no frame in the blend is washed out next to the segments either side of it',
  inside.every((m) => m.saturation >= floor && m.contrast >= contrastFloor),
  `saturation floor ${floor.toFixed(0)}, contrast floor ${contrastFloor.toFixed(0)}`,
);

/* ------------------------------------- 5. the same thing, cropped vertical */

/*
 * A crop and a blend in one command, which is the combination with the most
 * ways to go wrong: `xfade` refuses two inputs that disagree about size, and
 * the crop is the thing that decides the size. Vertical rather than widescreen
 * because it is the largest crop on offer, 810 columns out of 3440.
 */
console.log('\nthe same seam, cropped to vertical');
const vertical = await new ExportTimelineAction().execute({
  clips: timeline.slice(0, 2),
  transitions: [{ afterIndex: 0, type: 'crossDissolve', durationSec: DISSOLVE }],
  outputName: `export-check-vertical-${Date.now()}`,
  format: '9x16',
  framePos: 0.5,
});

const verticalSize = await probe([
  '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
  vertical.clip.filePath,
]);
const verticalSec = await seconds(vertical.clip.filePath);
console.log(`  ${verticalSize}, ${verticalSec.toFixed(3)}s`);

ok('a cropped dissolve lands on the cropped size', verticalSize === '810,1440', verticalSize);
ok(
  'and is as long as it should be',
  Math.abs(verticalSec - (TRIM_LENGTH * 2 - DISSOLVE)) <= TOLERANCE,
  `${verticalSec.toFixed(3)}s`,
);

/* ------------------------------- 6. a dissolve where only one side is safe */

/*
 * `decodeArgs` asks each file whether it carries a discard flagged pre-roll and
 * drops hwaccel for the ones that do, because NVDEC decodes those frames
 * against a keyframe that is no longer in the file and renders them flat green.
 * A cut asks that once. A dissolve reads two files and has to ask twice, and
 * the answers differ the moment somebody blends a clip trimmed by an old build
 * into one that was not.
 *
 * So one is made on purpose. Seeking a hair *past* a keyframe and copying is
 * exactly what the old lossless trim did, and it leaves that keyframe in the
 * file flagged discardable.
 */
console.log('\na dissolve between a clip with a pre-roll and one without');

const keyframes = await probe([
  '-select_streams', 'v:0',
  '-show_entries', 'packet=pts_time,flags',
  '-read_intervals', '%+20',
  '-of', 'csv=p=0',
  sources[2],
]);
const keyframe = keyframes
  .split('\n')
  .filter((line) => line.includes('K'))
  .map((line) => Number(line.split(',')[0]))
  .find((at) => at > 1);

const prerolled = join(library, game, 'preroll.mp4');
await execFileAsync(ffmpeg, [
  '-v', 'error', '-y',
  // A hair past the keyframe, so ffmpeg keeps it and marks it discardable.
  '-ss', (keyframe + 0.001).toFixed(3),
  '-i', sources[2],
  '-t', '12', '-c', 'copy', '-map', '0:v:0', '-map', '0:a:0?',
  prerolled,
]);

const flags = await probe([
  '-select_streams', 'v:0', '-show_entries', 'packet=flags',
  '-read_intervals', '%+1', '-of', 'csv=p=0', prerolled,
]);
const discarded = flags.split('\n').filter((line) => line.includes('D')).length;
console.log(`  the made-up source carries ${discarded} discard flagged packet(s)`);

if (discarded === 0) {
  // Not a failure of the export. Say so rather than passing a check that did
  // not exercise anything.
  ok('could not build a source with a pre-roll, so this case went untested', false);
} else {
  const stat = statSync(prerolled);
  const prerollRow = await repo.save(
    repo.create({
      filePath: prerolled,
      relPath: prerolled.slice(library.length + 1),
      filename: 'preroll.mp4',
      extension: '.mp4',
      game,
      sizeBytes: stat.size,
      fileModifiedAt: stat.mtime,
      published: false,
      starred: false,
    }),
  );

  const mixed = await new ExportTimelineAction().execute({
    clips: [
      { clipId: prerollRow.id, startTime: 0, trimStart: 1, trimEnd: 6, volume: 1, muted: false },
      { clipId: rows[0].id, startTime: 5, trimStart: TRIM_START, trimEnd: TRIM_START + TRIM_LENGTH, volume: 1, muted: false },
    ],
    transitions: [{ afterIndex: 0, type: 'crossDissolve', durationSec: DISSOLVE }],
    outputName: `export-check-preroll-${Date.now()}`,
    format: 'original',
    framePos: 0.5,
  });

  const mixedSec = await seconds(mixed.clip.filePath);
  ok(
    'a dissolve reading one file the GPU cannot take is still as long as it should be',
    Math.abs(mixedSec - (TRIM_LENGTH * 2 - DISSOLVE)) <= TOLERANCE,
    `${mixedSec.toFixed(3)}s against ${(TRIM_LENGTH * 2 - DISSOLVE).toFixed(3)}s`,
  );

  const across = [];
  for (const at of [0.1, seamStart + 0.02, seamMid, seamStart + DISSOLVE + 0.2]) {
    across.push({ at, ...stats(await frame(mixed.clip.filePath, at)) });
  }
  for (const picture of across) {
    console.log(`  at ${picture.at.toFixed(2)}s  rgb ${String(picture.rgb).padEnd(15)} mean ${picture.mean.toFixed(0)}`);
  }

  ok(
    'and none of it is green',
    across.every((picture) => !isGreen(picture)),
    across.filter(isGreen).map((picture) => `${picture.at}s`).join(', '),
  );
}

/* ------------------------------------------- where the movie actually landed */

/*
 * A movie cut from one game belongs to that game.
 *
 * This is the half that cannot be checked by looking at the file: the render
 * is identical either way, and what changed is the path it was written to and
 * the row that describes it. Getting it wrong is silent in exactly the way
 * that matters, because `ScanAndSyncClipsAction` globs a fixed set of shapes:
 * a file written one level deeper than the scan looks is never indexed at all,
 * and the export disappears from the library it was just added to.
 */
console.log('\nwhere it landed');

const homeRel = cuts.clip.relPath.split(/[\\/]/);
console.log(`  single game   ${cuts.clip.relPath}`);
console.log(`  game on row   ${cuts.clip.game}`);
console.log(`  flagged       isExport=${cuts.clip.isExport}`);

ok(
  'a timeline from one game lands in that game own exports folder',
  homeRel.length === 3 && homeRel[0] === game && homeRel[1] === 'Exports',
  cuts.clip.relPath,
);
ok('and the row says which game it belongs to', cuts.clip.game === game, cuts.clip.game);
ok('and is flagged as an export', cuts.clip.isExport === true);
// The scan writes it without the dot. Written with one, every export failed
// the equality check on the very next sweep and was rewritten and re-probed.
ok(
  'and its extension is spelled the way the scan spells it',
  cuts.clip.extension === 'mp4',
  cuts.clip.extension,
);
ok(
  'and the scan would actually index it',
  isClipLayout(cuts.clip.relPath),
  cuts.clip.relPath,
);

/*
 * A montage of several games has no one game folder to claim it.
 *
 * Picking the first clip's game would be a guess, and a wrong one is a file
 * filed under a game it is mostly not. So a mixed timeline keeps the flat
 * top level folder, exactly as before.
 */
const otherGame = `${game} II`;
mkdirSync(join(library, otherGame), { recursive: true });
const moved = rows[rows.length - 1];
const movedTo = join(library, otherGame, moved.filename);
copyFileSync(moved.filePath, movedTo);
moved.filePath = movedTo;
moved.relPath = movedTo.slice(library.length + 1);
moved.game = otherGame;
await repo.save(moved);

const mixed = await render(`export-check-mixed-${Date.now()}`, []);
console.log(`  two games     ${mixed.clip.relPath}`);
ok(
  'a timeline spanning two games keeps the flat exports folder',
  mixed.clip.relPath.split(/[\\/]/).length === 2 && mixed.clip.game === 'Exports',
  `${mixed.clip.relPath}, game ${mixed.clip.game}`,
);

/* ----------------------------------------------------------------- tidy up */

await dataSource.destroy();
rmSync(library, { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });

console.log(
  `\nspeed      ${(cuts.took / cutsSec).toFixed(2)}s per second of output with cuts, ` +
    `${(blended.took / blendedSec).toFixed(2)}s with two dissolves`,
);

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
