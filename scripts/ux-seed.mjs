/**
 * Build a throw-away GoodBit library for a UX walkthrough.
 *
 * Everything lives under one temporary folder: its own `GOODBIT_USER_DATA`,
 * its own videos root, its own database. The real library at
 * `<user>/Videos` is never opened, never read and never written. That is the
 * same isolation `tests/e2e/app.ts` relies on, for the same reason: this app
 * deletes clips.
 *
 * The clips are synthetic but deliberately not identical. A grid of forty
 * copies of one thumbnail tells you nothing about whether a grid works, so
 * each clip gets a different generator and a different hue, and durations run
 * from a few seconds to most of a minute so the timeline and the duration
 * labels have something to disagree about.
 *
 *   node scripts/ux-seed.mjs --profile casual
 *
 * Prints the profile directory it made. Re-running with the same name reuses
 * it, so a walkthrough can be continued rather than restarted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ffmpeg = (await import('ffmpeg-static')).default;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const profile = arg('--profile', 'default');
const base = join(tmpdir(), `goodbit-ux-${profile}`);
const dataDir = join(base, 'data');
const videosRoot = join(base, 'videos');
const audioRoot = join(base, 'music');

/**
 * A library that looks like somebody's, rather than like a fixture: one game
 * they play constantly, a few they dip into, and one with a single clip in it.
 */
const LIBRARY = [
  { game: 'Battlefield 6', clips: 18 },
  { game: 'Ready Or Not', clips: 9 },
  { game: 'Satisfactory', clips: 6 },
  { game: 'RV There Yet', clips: 4 },
  { game: 'The Headliners', clips: 3 },
  { game: 'Ghost Janitors', clips: 1 },
];

/** Enough different pictures that a wall of thumbnails reads as a wall of clips. */
const LOOKS = [
  () => `testsrc2=size=854x480:rate=30`,
  () => `smptebars=size=854x480:rate=30`,
  () => `rgbtestsrc=size=854x480:rate=30`,
  (h) => `life=size=854x480:rate=30:mold=10:ratio=0.1:death_color=0x${h}:life_color=0xffffff`,
  () => `mandelbrot=size=854x480:rate=30`,
  (h) => `gradients=size=854x480:rate=30:c0=0x${h}:c1=0x101820`,
  () => `cellauto=size=854x480:rate=30`,
  () => `sierpinski=size=854x480:rate=30`,
  () => `colorspectrum=size=854x480:rate=30`,
  () => `pal75bars=size=854x480:rate=30`,
];

const HUES = ['f97316', '2563eb', '16a34a', 'dc2626', '9333ea', '0891b2', 'ca8a04', 'be185d'];

/** OBS names a recording after the game and the moment it started. */
function obsName(game, index) {
  const day = 1 + ((index * 7) % 27);
  const month = 6 + (index % 4);
  const hour = 9 + ((index * 3) % 13);
  const minute = (index * 17) % 60;
  const second = (index * 29) % 60;
  const two = (n) => String(n).padStart(2, '0');
  return `${game}_${two(day)}.${two(month)}.2026_${two(hour)}-${two(minute)}-${two(second)}.mp4`;
}

mkdirSync(dataDir, { recursive: true });
mkdirSync(videosRoot, { recursive: true });
mkdirSync(audioRoot, { recursive: true });

writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify(
    {
      videosRoot,
      audioRoot,
      publisherBaseUrl: '',
      // Never register a login item, and never hold the tray, from a walkthrough.
      startAtLogin: false,
      keepRunningInTray: false,
      migratedFromWebApp: false,
    },
    null,
    2,
  ),
);

let made = 0;
let skipped = 0;
let n = 0;

for (const { game, clips } of LIBRARY) {
  const dir = join(videosRoot, game);
  mkdirSync(dir, { recursive: true });

  for (let i = 0; i < clips; i++) {
    const file = join(dir, obsName(game, i));
    n += 1;

    if (existsSync(file)) {
      skipped += 1;
      continue;
    }

    // Durations that vary the way recordings do, with a couple of long ones.
    const duration = [8, 12, 15, 21, 26, 34, 47][n % 7];
    const hue = HUES[n % HUES.length];
    const look = LOOKS[n % LOOKS.length](hue);

    // Quiet, then loud for a few seconds in the middle. The analysis is built
    // to find exactly that, so suggestions actually appear on the trim page
    // instead of every clip reporting nothing to point at.
    const loudFrom = Math.max(2, Math.round(duration * 0.45));
    const loudTo = Math.min(duration - 1, loudFrom + 4);

    execFileSync(ffmpeg, [
      '-hide_banner', '-v', 'error',
      '-f', 'lavfi', '-t', String(duration), '-i', look,
      '-f', 'lavfi', '-t', String(duration), '-i', 'sine=frequency=320',
      '-af', `volume=0.02,volume=enable='between(t,${loudFrom},${loudTo})':volume=40`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-shortest', '-y', file,
    ]);

    // Spread them over the last few weeks so "newest first" has something to
    // sort, rather than forty clips all recorded in the same second.
    const when = new Date(Date.now() - n * 9.5 * 3600 * 1000);
    utimesSync(file, when, when);
    made += 1;
  }
}

const games = readdirSync(videosRoot).length;
console.log(JSON.stringify({ profile, base, dataDir, videosRoot, games, made, skipped, total: n }, null, 2));
