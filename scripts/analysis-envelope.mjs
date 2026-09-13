/**
 * Is that people, or is it the game?
 *
 * Loudness cannot tell a menu whose music swells from an explosion, and the
 * thing that most often makes a clip worth keeping is not either of those: it
 * is four people shouting at once. Speech and laughter have a signature that
 * music and engines do not — the envelope of a voice band flutters at the
 * syllable rate, three to eight times a second — and that is measurable
 * without a model.
 *
 * Two RMS envelopes at 50 Hz, one of them band-limited to voices, cost about a
 * third of a second per clip. The modulation energy in the syllable band,
 * against the modulation energy overall, is the feature.
 *
 *   node scripts/analysis-envelope.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = ffmpegPath;
const DATA = join(process.cwd(), 'tmp', 'analysis-data');

/** Envelope sample rate. 50 Hz leaves room to measure up to 25 Hz of flutter. */
export const ENVELOPE_HZ = 50;
const SAMPLES_PER_FRAME = 16000 / ENVELOPE_HZ;

/** Where syllables land. Music modulates slower, engines barely at all. */
export const SYLLABLE_LO = 3;
export const SYLLABLE_HI = 8;

export function envelope(file, filter = null) {
  const chain = [
    'aresample=16000',
    filter,
    `asetnsamples=n=${SAMPLES_PER_FRAME}`,
    'astats=metadata=1:reset=1',
    'ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-',
  ]
    .filter(Boolean)
    .join(',');

  const out = execFileSync(
    FFMPEG,
    ['-hide_banner', '-v', 'error', '-nostats', '-i', file, '-map', '0:a:0', '-af', chain, '-f', 'null', '-'],
    { maxBuffer: 128 * 1024 * 1024 },
  ).toString();

  const values = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|-inf)/.exec(line);
    if (m) values.push(m[1] === '-inf' ? -120 : Number(m[1]));
  }
  return values;
}

/**
 * How much of this stretch's fluctuation happens at the syllable rate.
 *
 * A plain DFT over a short window; at 64 points the cost is irrelevant and the
 * frequency resolution (about 0.8 Hz) is plenty to tell 3-8 Hz from the rest.
 */
export function syllableRatio(env, from, length) {
  const slice = env.slice(from, from + length);
  if (slice.length < 16) return 0;

  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  // Hann, so the ends of the window do not ring across the whole spectrum.
  const windowed = slice.map(
    (v, i) => (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (slice.length - 1))),
  );

  let syllable = 0;
  let total = 0;

  const maxHz = 15;
  for (let k = 1; k <= Math.floor((maxHz * slice.length) / ENVELOPE_HZ); k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < windowed.length; i++) {
      const angle = (-2 * Math.PI * k * i) / windowed.length;
      re += windowed[i] * Math.cos(angle);
      im += windowed[i] * Math.sin(angle);
    }
    const power = re * re + im * im;
    const hz = (k * ENVELOPE_HZ) / windowed.length;

    total += power;
    if (hz >= SYLLABLE_LO && hz <= SYLLABLE_HI) syllable += power;
  }

  return total > 0 ? syllable / total : 0;
}

/** The feature as a series: one value per half second. */
export function speechiness(voiceEnv, stepSec = 0.5, windowSec = 1.28) {
  const step = Math.round(stepSec * ENVELOPE_HZ);
  const length = Math.round(windowSec * ENVELOPE_HZ);
  const out = [];

  for (let i = 0; i + length <= voiceEnv.length; i += step) {
    // Silence has no fluctuation worth analysing and produces noise ratios.
    const slice = voiceEnv.slice(i, i + length);
    const loudest = Math.max(...slice);
    out.push(loudest < -60 ? 0 : Math.round(syllableRatio(voiceEnv, i, length) * 1000) / 1000);
  }

  return { stepSec, windowSec, values: out };
}

function main() {
  const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
  let done = 0;

  for (const f of files) {
    const path = join(DATA, f);
    const clip = JSON.parse(readFileSync(path, 'utf-8'));

    if (clip.speech || !existsSync(clip.file)) {
      done++;
      continue;
    }

    try {
      const voiceEnv = envelope(clip.file, 'highpass=f=300,lowpass=f=3400');
      const fullEnv = envelope(clip.file);

      clip.envelopeHz = ENVELOPE_HZ;
      clip.speech = speechiness(voiceEnv);
      // How much of the sound is in the voice band at all, per half second.
      const step = Math.round(0.5 * ENVELOPE_HZ);
      const share = [];
      for (let i = 0; i + step <= voiceEnv.length; i += step) {
        const v = Math.max(...voiceEnv.slice(i, i + step));
        const a = Math.max(...fullEnv.slice(i, i + step));
        share.push(Math.round((v - a) * 10) / 10);
      }
      clip.voiceShare = share;

      writeFileSync(path, JSON.stringify(clip), 'utf-8');
      done++;
      process.stdout.write(`\r${done}/${files.length} ${clip.game.slice(0, 22)}            `);
    } catch (error) {
      console.log(`\n${clip.name}: ${error.message.split('\n')[0]}`);
    }
  }

  console.log(`\n${done} clips measured`);
}

if (process.argv[1] && process.argv[1].endsWith('analysis-envelope.mjs')) main();
