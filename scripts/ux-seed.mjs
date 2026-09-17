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

      /*
       * Three things that did not exist when this script was written, and all
       * three default to on or would reach outside the sandbox.
       *
       * `clipToast` builds a second `BrowserWindow` during boot. It defaults
       * to true, and a walkthrough that opens it is a walkthrough where
       * `firstWindow()` can return a transparent overlay instead of the app.
       * `ux-session.mjs` picks the right window regardless now, but there is
       * no reason for a sandbox to draw a card over somebody's screen.
       *
       * `startObsWithGoodbit` starts OBS. A walkthrough must never launch
       * another program on the machine running it. Absent is already falsy,
       * so this is written down to say it is deliberate.
       *
       * `mcpEnabled` opens a port. The installed copy may already be on the
       * default one, and a sandbox has no business listening at all.
       */
      clipToast: false,
      clipToastSound: false,
      startObsWithGoodbit: false,
      mcpEnabled: false,
    },
    null,
    2,
  ),
);

let made = 0;
let skipped = 0;
let n = 0;
const stamps = [];

/**
 * Windows keeps a creation time separate from the modified time, and it is the
 * one the app groups clips by. Node cannot set it, so PowerShell does, in one
 * go rather than one process per clip.
 *
 * Without this the careful spreading below does nothing: `utimes` moves the
 * modified time, the app reads the creation time, and all forty clips land
 * under one heading of today. Which makes "newest first", the date groups and
 * the whole library screen impossible to judge, since there is only ever one
 * group in it.
 */
function setCreationTimes(list) {
  if (list.length === 0) return;

  // One command per batch, because a few hundred PowerShell launches is slower
  // than making the clips was.
  const BATCH = 60;
  for (let at = 0; at < list.length; at += BATCH) {
    const script = list
      .slice(at, at + BATCH)
      .map(
        ({ file, when }) =>
          `(Get-Item -LiteralPath ${JSON.stringify(file)}).CreationTime = ` +
          `[datetime]::Parse(${JSON.stringify(when.toISOString())}).ToLocalTime()`,
      )
      .join('; ');

    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
    });
  }
}

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
    stamps.push({ file, when });
    made += 1;
  }
}

setCreationTimes(stamps);

const games = readdirSync(videosRoot).length;
console.log(JSON.stringify({ profile, base, dataDir, videosRoot, games, made, skipped, total: n }, null, 2));
