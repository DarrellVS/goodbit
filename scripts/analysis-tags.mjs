/**
 * Run the sound tagger over the measured sample and store what it heard.
 *
 * YAMNet is an AudioSet classifier: 521 labels, of which a few dozen describe
 * things that happen in game clips — gunfire, explosions, crashes, laughter,
 * cheering, music, silence, typing. Inference costs single-digit milliseconds
 * per clip; decoding the audio to 16 kHz mono costs about a fifth of a second.
 *
 *   npm install --no-save onnxruntime-node      # not a dependency of the app
 *   node scripts/analysis-tags.mjs
 *
 * Writes `tags` into each tmp/analysis-data/*.json: a per-frame series for the
 * groups below, at YAMNet's own 0.48 s hop. The model itself is fetched from
 * Hugging Face (zeropointnine/yamnet-onnx) into tmp/model/.
 *
 * **Result, so nobody repeats this by accident:** on 88 real clips the tags did
 * not separate accepted from refused windows; normalised per clip, the action
 * group sat at z≈0 at the visually verified moment on 13 of 14 accepted clips;
 * `Laughter` never exceeded 0.14 on co-op footage; and `Music` fires on any
 * game with a soundtrack, not on menus. It is not used by the app.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ort from 'onnxruntime-node';

const DATA = join(process.cwd(), 'tmp', 'analysis-data');
const MODEL = join(process.cwd(), 'tmp', 'model', 'yamnet.onnx');
const CLASS_MAP = join(process.cwd(), 'tmp', 'model', 'yamnet_class_map.csv');

/** YAMNet emits a frame every 0.48 s. */
export const TAG_HOP = 0.48;

/**
 * The classes worth grouping, and why.
 *
 * `reaction` and `action` are the things a clip is saved for. `music` and
 * `dead` are the opposite: a soundtrack playing over a menu, or the typing and
 * clicking of someone who has alt-tabbed. `voice` is deliberately separate and
 * deliberately not treated as evidence of anything — in co-op footage people
 * talk continuously, so it fires at 0.9 for whole clips.
 */
export const TAG_GROUPS = {
  reaction: [
    'Laughter', 'Belly laugh', 'Giggle', 'Snicker', 'Chuckle, chortle',
    'Cheering', 'Applause', 'Shout', 'Yell', 'Whoop', 'Screaming',
    'Children shouting', 'Gasp',
  ],
  action: [
    'Gunshot, gunfire', 'Machine gun', 'Fusillade', 'Artillery fire', 'Explosion',
    'Boom', 'Eruption', 'Smash, crash', 'Bang', 'Breaking', 'Shatter', 'Glass',
    'Burst, pop', 'Thump, thud', 'Skidding', 'Tire squeal', 'Crash',
  ],
  music: ['Music', 'Theme music', 'Soundtrack music', 'Background music', 'Jingle (music)'],
  dead: ['Silence', 'Computer keyboard', 'Typing', 'Mouse', 'Clicking', 'Beep, bleep', 'Ding'],
  voice: ['Speech', 'Conversation', 'Narration, monologue', 'Hubbub, speech noise, speech babble'],
};

export function loadClasses(path = CLASS_MAP) {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const m = /^(\d+),[^,]+,(.*)$/.exec(line);
      return m ? m[2].replace(/^"|"$/g, '') : null;
    })
    .filter(Boolean);
}

export function groupIndices(classes) {
  const out = {};
  for (const [group, names] of Object.entries(TAG_GROUPS)) {
    out[group] = names.map((n) => classes.indexOf(n)).filter((i) => i >= 0);
  }
  return out;
}

/** 16 kHz mono float samples, which is what the model wants. */
export function decodeAudio(file) {
  const pcm = execFileSync(
    ffmpegPath,
    ['-hide_banner', '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  return new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
}

/** The strongest member of each group, per frame. */
export async function tagSeries(session, indices, samples) {
  const out = await session.run({
    waveform: new ort.Tensor('float32', samples, [samples.length]),
  });

  const scores = out.output_0;
  const [frames, classCount] = scores.dims;
  const series = {};
  for (const group of Object.keys(indices)) series[group] = [];

  for (let f = 0; f < frames; f++) {
    for (const [group, list] of Object.entries(indices)) {
      let best = 0;
      for (const i of list) best = Math.max(best, scores.data[f * classCount + i]);
      series[group].push(Math.round(best * 1000) / 1000);
    }
  }

  return series;
}

async function main() {
  if (!existsSync(MODEL)) {
    console.error(`no model at ${MODEL}`);
    process.exit(1);
  }

  const classes = loadClasses();
  const indices = groupIndices(classes);
  const session = await ort.InferenceSession.create(MODEL);

  const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
  let done = 0;

  for (const f of files) {
    const path = join(DATA, f);
    const clip = JSON.parse(readFileSync(path, 'utf-8'));

    if (clip.tags || !existsSync(clip.file)) {
      done++;
      continue;
    }

    try {
      clip.tagHop = TAG_HOP;
      clip.tags = await tagSeries(session, indices, decodeAudio(clip.file));
      writeFileSync(path, JSON.stringify(clip), 'utf-8');
      done++;
      process.stdout.write(`\r${done}/${files.length} ${clip.game.slice(0, 22)}            `);
    } catch (error) {
      console.log(`\n${clip.name}: ${error.message.split('\n')[0]}`);
    }
  }

  console.log(`\n${done} clips tagged`);
}

if (process.argv[1] && process.argv[1].endsWith('analysis-tags.mjs')) main();
