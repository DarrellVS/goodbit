/**
 * Run the *shipped* lossless trim over a real recording and check the result.
 *
 * A stream copy cannot begin in the middle of a group of pictures, so ffmpeg
 * copies from the keyframe before the cut and writes the frames ahead of the
 * cut flagged discardable rather than leaving them out. Whether a player
 * honours that flag decides whether the clip looks right: ffmpeg and Chrome's
 * software decoder skip them, NVDEC decodes them against a keyframe that is
 * not there, and the head of the clip came out solid green with the audio a
 * group of pictures ahead of the picture.
 *
 * The shape of that bug is invisible in the container duration and in every
 * player that happens to skip the pre-roll, which is why it shipped. It shows
 * up in one number: how many packets in the output carry the discard flag. It
 * must be zero.
 *
 *   node scripts/trim-check.mjs
 *   node scripts/trim-check.mjs "Battlefield 6"
 *
 * Read-only as far as the recordings are concerned; the cut is written to a
 * temporary folder.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Videos') : join(homedir(), 'Videos');
const VIDEO = /\.(mp4|mov|mkv)$/i;
const OUT = join(process.cwd(), 'tmp', 'trim-bundle.mjs');

const game = process.argv[2] ?? 'Battlefield 6';

/** Where the cut is asked for. Deliberately mid-GOP, which is the hard case. */
const START = 10;
const END = 16;
/** Keyframes sit several seconds apart, so the copy snaps back well before 10. */
const MIN_SOURCE_SEC = 20;

const ffprobe = (await import('ffprobe-static')).default.path;
const ffmpeg = (await import('ffmpeg-static')).default;

const probe = async (args) => (await execFileAsync(ffprobe, ['-v', 'error', ...args])).stdout.trim();

// One entry that re-exports what the check needs, bundled with the real code.
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
// pictures, or the copy never has to snap back and the case goes untested.
let source = null;
for (const name of readdirSync(dir).filter((f) => VIDEO.test(f))) {
  const candidate = join(dir, name);
  const seconds = Number(
    await probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', candidate]),
  );
  if (seconds >= MIN_SOURCE_SEC) {
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
const output = join(work, 'cut.mp4');

console.log(`source: ${source}`);
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
const seconds = Number(await probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', output]));

// Decode the opening frame the way the GPU path does. A decoder that ignores
// the discard flag renders the missing references as flat green, so the colour
// of one pixel is the whole assertion.
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

const wanted = END - START + (START - result.actualStartSec);
const failures = [];
if (discarded !== 0) failures.push(`${discarded} of ${packets.length} packets carry the discard flag, want 0`);
if (!audio) failures.push('no audio track survived the cut');
if (green) failures.push(`first frame is green (rgb ${r} ${g} ${b}), so the pre-roll was decoded`);
if (Math.abs(seconds - wanted) > 0.25) failures.push(`clip is ${seconds.toFixed(3)}s, want about ${wanted.toFixed(3)}s`);

console.log(`asked for ${START}s to ${END}s`);
console.log(`landed on ${result.actualStartSec.toFixed(3)}s to ${result.actualEndSec.toFixed(3)}s (snapped back to a keyframe)`);
console.log(`packets: ${packets.length}, discard flagged: ${discarded}`);
console.log(`audio: ${audio || 'none'}`);
console.log(`first frame rgb: ${r} ${g} ${b}`);
console.log(`size: ${(statSync(output).size / 1e6).toFixed(1)} MB`);

rmSync(work, { recursive: true, force: true });

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
