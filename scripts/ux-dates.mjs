/**
 * Give the sandbox clips the dates their names claim.
 *
 * OBS names a recording after the moment it started, so a library's filenames
 * and its file dates agree. Copying a sandbox with `cp -r` does not preserve
 * mtimes, which left every clip looking like it was recorded in the same
 * second, and a library where everything says "Today" cannot be used to judge
 * how a library screen handles dates.
 *
 *   node scripts/ux-dates.mjs --profile creator
 *
 * Sandbox profiles only. Refuses to run anywhere near the real library.
 */
import { readdirSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const profile = arg('--profile', null);
if (!profile) {
  console.error('need --profile <name>');
  process.exit(2);
}

const videosRoot = join(tmpdir(), `goodbit-ux-${profile}`, 'videos');

// The whole point is that this never touches anything real. A sandbox lives
// under the temp directory and nowhere else.
if (!videosRoot.startsWith(tmpdir())) {
  console.error('refusing: that is not a sandbox path');
  process.exit(2);
}

/** `<Game>_DD.MM.YYYY_HH-MM-SS.mp4`, which is what OBS writes. */
const NAMED = /_(\d{2})\.(\d{2})\.(\d{4})_(\d{2})-(\d{2})-(\d{2})\.\w+$/;

let touched = 0;
let skipped = 0;

for (const game of readdirSync(videosRoot)) {
  const dir = join(videosRoot, game);
  if (!statSync(dir).isDirectory() || game.startsWith('.')) continue;

  for (const name of readdirSync(dir)) {
    const m = NAMED.exec(name);
    if (!m) {
      skipped += 1;
      continue;
    }
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    const when = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    utimesSync(join(dir, name), when, when);
    touched += 1;
  }
}

console.log(JSON.stringify({ profile, videosRoot, touched, skipped }, null, 2));
