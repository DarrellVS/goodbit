/**
 * Run both rules over every measurement and print what changes.
 *
 *   node scripts/analysis-compare.mjs
 *   node scripts/analysis-compare.mjs --list          # every clip, both answers
 *   node scripts/analysis-compare.mjs --rejected      # only what v2 refuses
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ruleCurrent, ruleV2 } from './analysis-rules.mjs';

const DATA = join(process.cwd(), 'tmp', 'analysis-data');
const has = (name) => process.argv.includes(`--${name}`);

const clips = readdirSync(DATA)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf-8')))
  .sort((a, b) => (a.game + a.name).localeCompare(b.game + b.name));

let currentYes = 0;
let v2Yes = 0;
let moved = 0;
const shifts = [];
const rejects = [];

for (const clip of clips) {
  const a = ruleCurrent(clip);
  const b = ruleV2(clip);

  if (a.confident) currentYes++;
  if (b.confident) v2Yes++;

  if (a.window && b.window) {
    const shift = b.window.start - a.window.start;
    if (Math.abs(shift) > 1) moved++;
    shifts.push(shift);
  }

  if (!b.confident) rejects.push({ clip, b });

  if (has('list')) {
    const where = b.window ? `${b.window.start}-${b.window.end}` : '—';
    const was = a.window ? `${a.window.start}-${a.window.end}` : '—';
    console.log(
      `${(b.confident ? 'YES' : 'no ').padEnd(4)} ${String(clip.durationSec).padStart(6)}s  ` +
        `was ${was.padStart(12)}  now ${where.padStart(12)}  ` +
        `lift ${String(b.peakLiftLu ?? '').padStart(5)} rise ${String(b.riseLu ?? '').padStart(5)} ` +
        `margin ${String(b.margin ?? '').padStart(6)}  ${clip.game} ${clip.name.slice(-22)}` +
        (b.reason ? `  [${b.reason}]` : ''),
    );
  }
}

if (has('rejected')) {
  console.log('\nrefused by v2:');
  for (const { clip, b } of rejects) {
    console.log(
      `  ${clip.game.padEnd(24)} ${clip.name.slice(-24).padEnd(26)} ${String(clip.durationSec).padStart(6)}s  ` +
        `lift ${String(b.peakLiftLu ?? '').padStart(5)} rise ${String(b.riseLu ?? '').padStart(5)} ` +
        `margin ${String(b.margin ?? '').padStart(6)}  [${b.reason}]`,
    );
  }
}

const late = (r) => r.filter((x) => x >= 0).length;
console.log(`\n${clips.length} clips`);
console.log(`  says yes:   current ${currentYes} (${Math.round((currentYes / clips.length) * 100)}%),  v2 ${v2Yes} (${Math.round((v2Yes / clips.length) * 100)}%)`);
console.log(`  window moved by more than a second: ${moved}`);
console.log(`  of those moves, ${late(shifts)} are later, ${shifts.length - late(shifts)} earlier`);
