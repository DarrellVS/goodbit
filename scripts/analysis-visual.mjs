/**
 * A cheap look at the picture, to go with the measurements of the sound.
 *
 * Sound alone cannot tell a menu from a firefight: a loading screen whose music
 * swells scores exactly like an explosion. Two frames a second, at 160x90,
 * gives brightness and frame-to-frame difference, which separates "a menu with
 * music over it" from "something happening" without a model.
 *
 * Decoding is the expensive part, 33 seconds software on a 3440x1440 AV1 clip,
 * 6 with `-hwaccel cuda`, so this is kept apart from the audio pass and only
 * run where it earns its cost.
 *
 *   node scripts/analysis-visual.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = ffmpegPath;
const DATA = join(process.cwd(), 'tmp', 'analysis-data');

/** Frames per second to sample. Two is enough to tell motion from stillness. */
const RATE = 2;

let hwaccel = null;
function decodeArgs() {
  if (hwaccel !== null) return hwaccel;

  for (const candidate of ['cuda', 'd3d11va']) {
    try {
      execFileSync(
        FFMPEG,
        ['-hide_banner', '-v', 'error', '-hwaccel', candidate, '-f', 'lavfi',
         '-i', 'testsrc=size=320x180:rate=10:duration=0.2', '-f', 'null', '-'],
        { stdio: 'ignore' },
      );
      hwaccel = ['-hwaccel', candidate];
      return hwaccel;
    } catch {
      /* try the next one */
    }
  }

  hwaccel = [];
  return hwaccel;
}

export function visualSeries(file) {
  const out = execFileSync(
    FFMPEG,
    [
      '-hide_banner', '-v', 'error', '-nostats',
      ...decodeArgs(),
      '-i', file,
      // `format=yuv420p` is not optional: on a 10-bit HDR source signalstats
      // otherwise reports a constant 64 for every frame, which looks like a
      // perfectly still picture and is simply wrong.
      '-vf', `fps=${RATE},scale=160:90,format=yuv420p,signalstats,metadata=mode=print:file=-`,
      '-an', '-f', 'null', '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString();

  const brightness = [];
  const motion = [];

  for (const line of out.split(/\r?\n/)) {
    const y = /^lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line);
    if (y) brightness.push(Math.round(Number(y[1]) * 10) / 10);
    const d = /^lavfi\.signalstats\.YDIF=([\d.]+)/.exec(line);
    if (d) motion.push(Math.round(Number(d[1]) * 10) / 10);
  }

  return { rate: RATE, brightness, motion };
}

function main() {
  const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
  let done = 0;

  for (const f of files) {
    const path = join(DATA, f);
    const clip = JSON.parse(readFileSync(path, 'utf-8'));

    if (clip.visual || !existsSync(clip.file)) {
      done++;
      continue;
    }

    try {
      clip.visual = visualSeries(clip.file);
      writeFileSync(path, JSON.stringify(clip), 'utf-8');
      done++;
      process.stdout.write(`\r${done}/${files.length} ${clip.game.slice(0, 22)}            `);
    } catch (error) {
      console.log(`\n${clip.name}: ${error.message.split('\n')[0]}`);
    }
  }

  console.log(`\n${done} clips have a picture now`);
}

if (process.argv[1] && process.argv[1].endsWith('analysis-visual.mjs')) main();
