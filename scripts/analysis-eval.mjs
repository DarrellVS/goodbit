/**
 * Try rules against the measurements in tmp/analysis-data/ and report what
 * they do, without touching ffmpeg or the library.
 *
 *   node scripts/analysis-eval.mjs
 *   node scripts/analysis-eval.mjs --show 12      # per-clip detail
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'tmp', 'analysis-data');
const HOP = 0.1;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

export function load() {
  return readdirSync(DATA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf-8')));
}

/* --------------------------------------------------------------- shaping */

const SILENCE = -70;

/** Median, MAD and the robust z-score of every sample. */
export function normalise(values) {
  const voiced = values.filter((x) => x > SILENCE).sort((a, b) => a - b);
  if (voiced.length < 10) return null;

  const median = voiced[Math.floor(voiced.length / 2)];
  const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  const spreadLu = voiced[Math.floor(voiced.length * 0.9)] - voiced[Math.floor(voiced.length * 0.1)];
  const p95 = voiced[Math.floor(voiced.length * 0.95)];

  const scale = 3 * Math.max(mad, 0.5);
  const z = values.map((x) => (x - median) / scale);

  return { median, mad, spreadLu, p95, z };
}

/** How far above its own normal the loudest moment gets, in LU. */
export function peakLift(values) {
  const shaped = normalise(values);
  if (!shaped) return 0;
  const max = Math.max(...values);
  return max - shaped.median;
}

/* ------------------------------------------------------------- reporting */

function percentile(list, p) {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function histogram(values, buckets, lo, hi) {
  const counts = new Array(buckets).fill(0);
  for (const v of values) {
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * buckets)));
    counts[b]++;
  }
  const max = Math.max(...counts, 1);
  return counts
    .map((c, i) => {
      const from = (lo + ((hi - lo) * i) / buckets).toFixed(2);
      const bar = '#'.repeat(Math.round((c / max) * 40));
      return `  ${from.padStart(6)} ${String(c).padStart(3)} ${bar}`;
    })
    .join('\n');
}

function main() {
  const clips = load();
  console.log(`${clips.length} clips\n`);

  const peakPositions = [];
  const voicePeakPositions = [];
  const lifts = [];
  const spreads = [];
  const durations = [];
  const rows = [];

  for (const clip of clips) {
    const shaped = normalise(clip.full);
    if (!shaped) continue;

    const voiceShaped = normalise(clip.voice);

    let peakIndex = 0;
    for (let i = 1; i < shaped.z.length; i++) if (shaped.z[i] > shaped.z[peakIndex]) peakIndex = i;

    const durationSec = clip.durationSec;
    const peakAt = clip.t0 + peakIndex * HOP;
    peakPositions.push(peakAt / durationSec);

    if (voiceShaped) {
      let vi = 0;
      for (let i = 1; i < voiceShaped.z.length; i++) if (voiceShaped.z[i] > voiceShaped.z[vi]) vi = i;
      voicePeakPositions.push((clip.t0 + vi * HOP) / durationSec);
    }

    lifts.push(peakLift(clip.full));
    spreads.push(shaped.spreadLu);
    durations.push(durationSec);

    rows.push({
      name: clip.name,
      game: clip.game,
      durationSec,
      peakAt: Math.round(peakAt * 10) / 10,
      peakFrac: Math.round((peakAt / durationSec) * 100) / 100,
      liftLu: Math.round(peakLift(clip.full) * 10) / 10,
      spreadLu: Math.round(shaped.spreadLu * 10) / 10,
    });
  }

  console.log('Duration (s): p10 %s  median %s  p90 %s', percentile(durations, 0.1), percentile(durations, 0.5), percentile(durations, 0.9));
  console.log('Peak lift over own median (LU): p10 %s  median %s  p90 %s',
    percentile(lifts, 0.1)?.toFixed(1), percentile(lifts, 0.5)?.toFixed(1), percentile(lifts, 0.9)?.toFixed(1));
  console.log('Spread p90-p10 (LU): p10 %s  median %s  p90 %s',
    percentile(spreads, 0.1)?.toFixed(1), percentile(spreads, 0.5)?.toFixed(1), percentile(spreads, 0.9)?.toFixed(1));

  console.log('\nWhere the loudest moment sits, as a fraction of the clip:');
  console.log(histogram(peakPositions, 10, 0, 1));
  const lateFull = peakPositions.filter((p) => p >= 0.6).length;
  console.log(`  last 40%%: ${lateFull}/${peakPositions.length} (${Math.round((lateFull / peakPositions.length) * 100)}%%)`);

  console.log('\nSame, for the voice band:');
  console.log(histogram(voicePeakPositions, 10, 0, 1));
  const lateVoice = voicePeakPositions.filter((p) => p >= 0.6).length;
  console.log(`  last 40%%: ${lateVoice}/${voicePeakPositions.length} (${Math.round((lateVoice / voicePeakPositions.length) * 100)}%%)`);

  const show = Number(arg('show', '0'));
  if (show) {
    console.log('\nper clip:');
    rows
      .sort((a, b) => a.peakFrac - b.peakFrac)
      .slice(0, show)
      .forEach((r) =>
        console.log(
          `  ${String(r.peakFrac).padStart(5)}  ${String(r.peakAt).padStart(6)}s/${String(r.durationSec).padStart(6)}s  lift ${String(r.liftLu).padStart(5)}  spread ${String(r.spreadLu).padStart(5)}  ${r.game} ${r.name.slice(-24)}`,
        ),
      );
  }
}

if (process.argv[1] && process.argv[1].endsWith('analysis-eval.mjs')) main();
