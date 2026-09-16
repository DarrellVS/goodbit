/**
 * Run the *shipped* trim over a real recording and check what came out.
 *
 * Two things are checked, because two different things have gone wrong here.
 *
 * **The cut has to land where it was asked to.** A stream copy cannot do that:
 * it must begin at a keyframe, so asking for 4.5s to 12.8s produced a file that
 * started at 0 and ran half again as long. The default is now `exact`, which
 * re-encodes and is frame accurate, and this asserts that the file on disk
 * matches the request to within one frame.
 *
 * **A lossless copy must not leave pre-roll behind.** When it copies from the
 * keyframe before the cut, ffmpeg writes the frames ahead of the cut flagged
 * discardable and stamped at time zero rather than leaving them out. Software
 * decoders skip them; NVDEC decodes them against a keyframe that is not there,
 * which shipped as four seconds of flat green. The healthy number is zero, and
 * nothing else catches it: the container duration is right either way.
 *
 *   node scripts/trim-check.mjs
 *   node scripts/trim-check.mjs "Battlefield 6"
 *
 * Read-only as far as the recordings are concerned; cuts go to a temp folder.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const execFileAsync = promisify(execFile);

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;
const OUT = join(process.cwd(), 'tmp', 'trim-bundle.mjs');

const game = process.argv[2] ?? 'Battlefield 6';

/** Deliberately mid-GOP, which is the case both bugs lived in. */
const START = 10;
const END = 16;
const MIN_SOURCE_SEC = 20;
/** One frame at 60fps, plus a little slack for container rounding. */
const TOLERANCE = 0.05;

const ffprobe = (await import('ffprobe-static')).default.path;
const ffmpeg = (await import('ffmpeg-static')).default;

const probe = async (args) => (await execFileAsync(ffprobe, ['-v', 'error', ...args])).stdout.trim();
const seconds = (file) => probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).then(Number);

const entry = join(process.cwd(), 'tmp', 'trim-entry.ts');
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
writeFileSync(entry, "export { TrimVideoAction } from '../src/main/actions/TrimVideoAction.js';\n", 'utf-8');

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

const { TrimVideoAction } = await import(pathToFileURL(OUT).href);

const dir = join(ROOT, game);
if (!existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

// Long enough that the requested start is not in the opening group of
// pictures, or neither case gets exercised.
let source = null;
for (const nameOnDisk of readdirSync(dir).filter((f) => VIDEO.test(f))) {
  const candidate = join(dir, nameOnDisk);
  if ((await seconds(candidate)) >= MIN_SOURCE_SEC) {
    source = candidate;
    break;
  }
}
if (!source) {
  console.error(`no recording of at least ${MIN_SOURCE_SEC}s in ${dir}`);
  process.exit(2);
}

const work = join(tmpdir(), `goodbit-trim-check-${Date.now()}`);
mkdirSync(work, { recursive: true });

console.log(`source: ${source}`);
console.log(`asked for ${START}s to ${END}s, so ${END - START}s\n`);

const failures = [];

/* ---------------------------------------------------- exact, the default */
{
  const output = join(work, 'exact.mp4');
  const started = Date.now();
  const result = await new TrimVideoAction().execute({
    inputPath: source,
    startSec: START,
    endSec: END,
    outputPath: output,
    mode: 'exact',
  });
  const took = ((Date.now() - started) / 1000).toFixed(1);
  const got = await seconds(output);
  const wanted = END - START;
  const drift = Math.abs(got - wanted);

  console.log('exact (the default when compression is off)');
  console.log(`  reported  ${result.actualStartSec.toFixed(2)}s to ${result.actualEndSec.toFixed(2)}s`);
  console.log(`  on disk   ${got.toFixed(3)}s, wanted ${wanted.toFixed(3)}s, out by ${drift.toFixed(3)}s`);
  console.log(`  took      ${took}s, ${(statSync(output).size / 1e6).toFixed(1)} MB`);

  if (drift > TOLERANCE) failures.push(`exact cut is ${got.toFixed(3)}s, wanted ${wanted.toFixed(3)}s`);
  if (Math.abs(result.actualStartSec - START) > TOLERANCE)
    failures.push(`exact cut reports it starts at ${result.actualStartSec}, wanted ${START}`);
  if (Math.abs(result.actualEndSec - END) > TOLERANCE)
    failures.push(`exact cut reports it ends at ${result.actualEndSec}, wanted ${END}`);
}

/* ------------------------------------- lossless, still offered by the API */
{
  const output = join(work, 'lossless.mp4');
  const result = await new TrimVideoAction().execute({
    inputPath: source,
    startSec: START,
    endSec: END,
    outputPath: output,
    mode: 'lossless',
  });

  const flags = await probe([
    '-select_streams', 'v:0',
    '-show_entries', 'packet=flags',
    '-of', 'csv=p=0',
    output,
  ]);
  const packets = flags.split('\n').filter(Boolean);
  const discarded = packets.filter((f) => f.includes('D')).length;
  const audio = await probe(['-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', output]);

  // Decode the opening frame the way the GPU path does. A decoder that ignores
  // the discard flag renders missing references as flat green, so the colour of
  // one pixel is the whole assertion.
  const tonemap =
    'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,' +
    'zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
  const raw = await new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-v', 'error', '-hwaccel', 'cuda', '-i', output, '-vf', `${tonemap},scale=1:1`, '-frames:v', '1',
       '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 20 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
  const [r, g, b] = raw.length >= 3 ? [raw[0], raw[1], raw[2]] : [0, 0, 0];
  const green = g > 60 && g - r > 40 && g - b > 40;

  console.log('\nlossless (a stream copy, so it snaps back to a keyframe)');
  console.log(`  reported  ${result.actualStartSec.toFixed(2)}s to ${result.actualEndSec.toFixed(2)}s`);
  console.log(`  packets   ${packets.length}, discard flagged ${discarded}`);
  console.log(`  audio     ${audio || 'none'}`);
  console.log(`  frame 0   rgb ${r} ${g} ${b}`);

  if (discarded !== 0) failures.push(`${discarded} of ${packets.length} packets carry the discard flag, want 0`);
  if (!audio) failures.push('no audio track survived the lossless cut');
  if (green) failures.push(`first frame of the lossless cut is green (rgb ${r} ${g} ${b})`);
}

rmSync(work, { recursive: true, force: true });

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
