/**
 * A bench for the highlight analysis, run against real recordings.
 *
 * For each clip it measures the signals the analysis uses (and some it does
 * not), prints what the current rule would pick, and writes a contact sheet so
 * the pick can be checked against what is actually happening on screen.
 *
 *   node scripts/analysis-lab.mjs --game "Battlefield 6" --take 6
 *   node scripts/analysis-lab.mjs --clip "C:\path\to\clip.mp4"
 *   node scripts/analysis-lab.mjs --all 24          # a spread across every game
 *
 * Output lands in tmp/analysis-lab/ (gitignored): one JSON summary and one
 * contact sheet per clip. Nothing is written near the recordings.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;
const ROOT = libraryRoot();
const OUT = join(process.cwd(), 'tmp', 'analysis-lab');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HOP = 0.1;
const VIDEO = /\.(mp4|mov|mkv)$/i;

/**
 * Folders that are not gameplay: drone footage, the editor's music scratch
 * folder, and recordings of applications rather than games.
 */
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

/* ------------------------------------------------------------- measuring */

export function momentaryLoudness(file, filter = null) {
  const args = [
    '-hide_banner', '-v', 'error', '-nostats',
    '-i', file,
    '-map', '0:a:0',
    '-af',
    `${filter ? filter + ',' : ''}ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M:file=-`,
    '-f', 'null', '-',
  ];

  const out = execFileSync(FFMPEG, args, { maxBuffer: 256 * 1024 * 1024 }).toString();

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

export function duration(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]).toString();
  return Number(out.trim()) || 0;
}

/* -------------------------------------------------------------- the rule */

/** The rule as it stands in src/main/actions/AnalyzeClipAction.ts. */
export function currentRule(times, values, windowSec = 10) {
  const SILENCE = -70;
  const MIN_SPREAD_LU = 4;
  const MIN_LIFT = 0.08;
  const LEAD_IN = 2.5;
  const ONSET_FRACTION = 0.5;

  const durationSec = times.length ? times[times.length - 1] + HOP : 0;
  const voiced = values.filter((x) => x > SILENCE).sort((a, b) => a - b);
  if (voiced.length < 10) return { confident: false, reason: 'silent' };

  const median = voiced[Math.floor(voiced.length / 2)];
  const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  const spreadLu = voiced[Math.floor(voiced.length * 0.9)] - voiced[Math.floor(voiced.length * 0.1)];

  const scale = 3 * Math.max(mad, 0.5);
  const raw = values.map((x) => (x - median) / scale);
  const score = raw.map((x) => Math.max(0, Math.min(1, x)));

  const effective = Math.min(windowSec, durationSec * 0.8);
  const win = Math.max(1, Math.round(effective / HOP));

  const prefix = [0];
  for (let i = 0; i < score.length; i++) prefix.push(prefix[i] + score[i]);

  let bestIndex = 0;
  let bestSum = -1;
  for (let i = 0; i + win <= score.length; i++) {
    const sum = prefix[i + win] - prefix[i];
    if (sum > bestSum) {
      bestSum = sum;
      bestIndex = i;
    }
  }

  const meanScore = bestSum / win;
  const overallMean = score.reduce((a, b) => a + b, 0) / score.length;
  const lift = meanScore - overallMean;
  const confident = spreadLu >= MIN_SPREAD_LU && lift >= MIN_LIFT;

  const limit = Math.min(raw.length, bestIndex + win);
  let peak = 0;
  let peakIndex = bestIndex;
  for (let i = bestIndex; i < limit; i++) {
    if (raw[i] > peak) {
      peak = raw[i];
      peakIndex = i;
    }
  }
  let onset = peakIndex;
  while (onset > bestIndex && raw[onset - 1] >= peak * ONSET_FRACTION) onset--;

  const length = win * HOP;
  const shifted = Math.max(0, Math.min(bestIndex * HOP, onset * HOP - LEAD_IN));
  const end = Math.min(durationSec, shifted + length);

  return {
    confident,
    spreadLu: round(spreadLu),
    lift: round(lift, 3),
    median: round(median),
    mad: round(mad, 2),
    window: { start: round(Math.max(0, end - length)), end: round(end) },
    peakAt: round(peakIndex * HOP),
  };
}

/* ------------------------------------------------------- contact sheets */

/** Twelve stills across the clip, tiled, so the timeline can be eyeballed. */
function contactSheet(file, out, frames = 12) {
  const durationSec = duration(file);
  const rate = durationSec > 0 ? frames / durationSec : 1;

  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error',
    '-i', file,
    '-vf', `fps=${rate.toFixed(6)},scale=320:-1,tile=4x3:padding=4:color=#222222`,
    '-frames:v', '1', '-q:v', '5', '-y', out,
  ]);

  return { frames, everySec: round(durationSec / frames) };
}

/** A closer look: six stills spread across one stretch of the clip. */
function closeUp(file, out, start, end, frames = 6) {
  const span = Math.max(0.5, end - start);
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error',
    '-ss', String(start),
    '-t', String(span),
    '-i', file,
    '-vf', `fps=${(frames / span).toFixed(6)},scale=420:-1,tile=3x2:padding=4:color=#222222`,
    '-frames:v', '1', '-q:v', '4', '-y', out,
  ]);
}

/* -------------------------------------------------------------- helpers */

function round(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Where the energy sits, in fifths of the clip. */
function profile(times, values, durationSec) {
  const buckets = new Array(5).fill(null).map(() => []);
  times.forEach((t, i) => {
    const b = Math.min(4, Math.floor((t / durationSec) * 5));
    buckets[b].push(values[i]);
  });
  return buckets.map((b) => (b.length ? round(b.reduce((x, y) => x + y, 0) / b.length) : null));
}

/** The loudest moments, kept apart so they describe different events. */
function peaks(times, values, count = 6, apartSec = 3) {
  const ranked = values.map((v, i) => ({ v, t: times[i] })).sort((a, b) => b.v - a.v);
  const kept = [];
  for (const item of ranked) {
    if (kept.length >= count) break;
    if (kept.some((k) => Math.abs(k.t - item.t) < apartSec)) continue;
    kept.push({ t: round(item.t), lufs: round(item.v) });
  }
  return kept.sort((a, b) => a.t - b.t);
}

/* ----------------------------------------------------------------- main */

function pick() {
  const clip = arg('clip');
  if (clip) return [clip];

  const game = arg('game');
  const take = Number(arg('take', '6'));

  const fromGame = (name) => {
    const dir = join(ROOT, name);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => VIDEO.test(f))
      .map((f) => join(dir, f))
      .map((f) => ({ f, at: statSync(f).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, take)
      .map((x) => x.f);
  };

  if (game) return fromGame(game);

  const all = Number(arg('all', '0'));
  if (all) {
    const games = readdirSync(ROOT).filter((g) => {
      if (NOT_GAMEPLAY.has(g)) return false;
      const d = join(ROOT, g);
      return statSync(d).isDirectory() && readdirSync(d).some((f) => VIDEO.test(f));
    });
    const perGame = Math.max(1, Math.round(all / games.length));
    return games.flatMap((g) => fromGame(g).slice(0, perGame)).slice(0, all);
  }

  return fromGame('Battlefield 6');
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const clips = pick();
  if (clips.length === 0) {
    console.error('nothing to look at');
    process.exit(1);
  }

  const report = [];

  for (const file of clips) {
    const name = basename(file).replace(VIDEO, '');
    const safe = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
    process.stdout.write(`${name} … `);

    try {
      const durationSec = duration(file);
      const full = momentaryLoudness(file);
      // A voice band, for shouting and laughing that is not loud in absolute
      // terms but is very obviously the point of the clip.
      const voice = momentaryLoudness(file, 'highpass=f=250,lowpass=f=3800');

      const rule = currentRule(full.times, full.values);
      const sheet = join(OUT, `${safe}.sheet.jpg`);
      const meta = contactSheet(file, sheet);

      if (rule.window) {
        closeUp(file, join(OUT, `${safe}.suggested.jpg`), rule.window.start, rule.window.end);
      }
      closeUp(file, join(OUT, `${safe}.ending.jpg`), Math.max(0, durationSec - 12), durationSec);

      const entry = {
        name,
        file,
        durationSec: round(durationSec),
        rule,
        fifths: profile(full.times, full.values, durationSec),
        voiceFifths: profile(voice.times, voice.values, durationSec),
        peaks: peaks(full.times, full.values),
        voicePeaks: peaks(voice.times, voice.values),
        sheet: `${safe}.sheet.jpg`,
        everySec: meta.everySec,
      };

      report.push(entry);
      console.log(
        `${entry.durationSec}s, ${rule.confident ? 'confident' : 'unsure'}` +
          (rule.window ? ` ${rule.window.start}-${rule.window.end}` : ''),
      );
    } catch (error) {
      console.log(`failed: ${error.message.split('\n')[0]}`);
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n${report.length} clips -> ${join(OUT, 'report.json')}`);
}

if (process.argv[1] && process.argv[1].endsWith('analysis-lab.mjs')) main();
