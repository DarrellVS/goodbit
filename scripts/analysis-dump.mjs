/**
 * Measure a lot of real clips once, so rules can be tried without ffmpeg in
 * the loop.
 *
 * Writes one compact JSON per clip into tmp/analysis-data/ holding the signals
 * a rule might use: momentary loudness over the whole mix, the same over a
 * voice band, and short-term energy. Times are implicit at 0.1 s.
 *
 *   node scripts/analysis-dump.mjs --per-game 8
 *
 * Read-only as far as the recordings are concerned.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;
const ROOT = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'Videos')
  : join(homedir(), 'Videos');
const OUT = join(process.cwd(), 'tmp', 'analysis-data');

const VIDEO = /\.(mp4|mov|mkv)$/i;

/** Not gameplay: drone footage, app recordings, the editor's music folder. */
const NOT_GAMEPLAY = new Set([
  'DJI-GESTURES',
  'DJI-RAW',
  'Editor',
  'GoPro-samples',
  'Spotify',
  'Discord',
  'Cursor',
  'steamwebhelper',
  'samsunginternet',
  'Captures',
  'NVIDIA',
  'ApexCut',
  'comet',
]);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

function duration(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]).toString();
  return Number(out.trim()) || 0;
}

/**
 * One series of momentary loudness, optionally behind a filter.
 *
 * Two passes rather than one `asplit` into two `ebur128`s: both filters print
 * the same metadata key into the same stream, so the only thing separating the
 * two series is the order they happen to be emitted in, and that is not a
 * contract. A second decode of a thirty second clip costs a second.
 */
function series(file, filter = null) {
  const out = execFileSync(
    FFMPEG,
    [
      '-hide_banner', '-v', 'error', '-nostats',
      '-i', file,
      '-map', '0:a:0',
      '-af',
      `${filter ? filter + ',' : ''}ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M:file=-`,
      '-f', 'null', '-',
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  ).toString();

  const times = [];
  const values = [];
  let pending = null;

  for (const line of out.split(/\r?\n/)) {
    const frame = /^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/.exec(line);
    if (frame) {
      pending = Number(frame[1]);
      continue;
    }
    const value = /^lavfi\.r128\.M=(-?[\d.]+)/.exec(line);
    if (value && pending !== null) {
      times.push(pending);
      values.push(Number(value[1]));
      pending = null;
    }
  }

  return { times, values };
}

function measure(file) {
  const full = series(file);
  // Voices and laughter live in this band; engines and explosions mostly do not.
  const voice = series(file, 'highpass=f=250,lowpass=f=3800');

  const length = Math.min(full.values.length, voice.values.length);
  return {
    times: full.times.slice(0, length),
    full: full.values.slice(0, length),
    voice: voice.values.slice(0, length),
  };
}

function clipsToMeasure() {
  const perGame = Number(arg('per-game', '8'));
  const games = readdirSync(ROOT).filter((g) => {
    if (NOT_GAMEPLAY.has(g)) return false;
    const d = join(ROOT, g);
    try {
      return statSync(d).isDirectory() && readdirSync(d).some((f) => VIDEO.test(f));
    } catch {
      return false;
    }
  });

  const picked = [];
  for (const game of games) {
    const dir = join(ROOT, game);
    const files = readdirSync(dir)
      .filter((f) => VIDEO.test(f))
      .map((f) => join(dir, f))
      .map((f) => ({ f, at: statSync(f).mtimeMs, size: statSync(f).size }))
      // Skip anything tiny; a 2 MB file is a fragment, not a clip.
      .filter((x) => x.size > 3_000_000)
      .sort((a, b) => b.at - a.at);

    // A spread through the folder rather than the newest few, so one evening of
    // one game does not stand in for the whole game.
    const step = Math.max(1, Math.floor(files.length / perGame));
    for (let i = 0, taken = 0; i < files.length && taken < perGame; i += step, taken++) {
      picked.push({ game, file: files[i].f });
    }
  }

  return picked;
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const clips = clipsToMeasure();
  console.log(`measuring ${clips.length} clips`);

  let done = 0;
  for (const { game, file } of clips) {
    const name = basename(file).replace(VIDEO, '');
    const out = join(OUT, `${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 70)}.json`);

    if (existsSync(out)) {
      done++;
      continue;
    }

    try {
      const durationSec = duration(file);
      if (durationSec < 5) continue;

      const { times, full, voice } = measure(file);
      if (times.length < 20) continue;

      writeFileSync(
        out,
        JSON.stringify({
          name,
          game,
          file,
          durationSec: Math.round(durationSec * 100) / 100,
          hop: 0.1,
          t0: times[0],
          full: full.map((v) => Math.round(v * 10) / 10),
          voice: voice.map((v) => Math.round(v * 10) / 10),
        }),
        'utf-8',
      );

      done++;
      process.stdout.write(`\r${done}/${clips.length} ${game.slice(0, 20)}          `);
    } catch (error) {
      console.log(`\n${name}: ${error.message.split('\n')[0]}`);
    }
  }

  console.log(`\n${done} measured into ${OUT}`);
}

main();
