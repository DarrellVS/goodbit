/**
 * Render what a rule picked, so the pick can be checked against the footage.
 *
 * For each clip: six stills spread through the suggested window, and six across
 * the whole clip for context, stacked into one image. If the suggestion is any
 * good, the top row is where something happens.
 *
 *   node scripts/analysis-verify.mjs --take 12
 *   node scripts/analysis-verify.mjs --only rejected
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { ruleV3 } from './analysis-rules.mjs';

const FFMPEG = ffmpegPath;
const DATA = join(process.cwd(), 'tmp', 'analysis-data');
const OUT = join(process.cwd(), 'tmp', 'analysis-verify');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/** Six stills across a stretch, in one row. */
function row(file, start, span, out, width = 300) {
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error',
    '-ss', String(Math.max(0, start)),
    '-t', String(Math.max(0.5, span)),
    '-i', file,
    '-vf', `fps=${(6 / Math.max(0.5, span)).toFixed(6)},scale=${width}:-1,tile=6x1:padding=3:color=#111111`,
    '-frames:v', '1', '-q:v', '5', '-y', out,
  ]);
}

function stack(top, bottom, out) {
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error',
    '-i', top, '-i', bottom,
    '-filter_complex', '[0:v][1:v]vstack=inputs=2',
    '-frames:v', '1', '-q:v', '5', '-y', out,
  ]);
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const only = arg('only', 'all');
  const take = Number(arg('take', '12'));

  const clips = readdirSync(DATA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf-8')))
    .filter((c) => existsSync(c.file))
    .map((clip) => ({ clip, verdict: ruleV3(clip) }))
    .filter(({ verdict, clip }) => {
      if (only === 'rejected') return !verdict.confident && clip.durationSec > 14;
      if (only === 'confident') return verdict.confident;
      return true;
    });

  // A spread across games rather than the first N alphabetically.
  const byGame = new Map();
  for (const item of clips) {
    const list = byGame.get(item.clip.game) ?? [];
    list.push(item);
    byGame.set(item.clip.game, list);
  }

  const picked = [];
  let round = 0;
  while (picked.length < take && round < 10) {
    for (const list of byGame.values()) {
      if (list[round]) picked.push(list[round]);
      if (picked.length >= take) break;
    }
    round++;
  }

  for (const { clip, verdict } of picked) {
    const safe = clip.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 56);
    const window = verdict.window ?? { start: 0, end: Math.min(10, clip.durationSec) };

    const a = join(OUT, `${safe}.a.jpg`);
    const b = join(OUT, `${safe}.b.jpg`);
    const out = join(OUT, `${verdict.confident ? 'yes' : 'no'}-${safe}.jpg`);

    try {
      row(clip.file, window.start, window.end - window.start, a);
      row(clip.file, 0, clip.durationSec, b);
      stack(a, b, out);
      console.log(
        `${verdict.confident ? 'YES' : 'no '} ${clip.game.padEnd(22)} ${String(clip.durationSec).padStart(6)}s ` +
          `window ${window.start}-${window.end}` +
          (verdict.reason ? `  [${verdict.reason}]` : ''),
      );
    } catch (error) {
      console.log(`failed ${clip.name}: ${error.message.split('\n')[0]}`);
    }
  }

  console.log(`\n${picked.length} sheets in ${OUT}`);
  console.log('top row = the suggestion, bottom row = the whole clip');
}

main();
