/**
 * Start the real publisher and see whether it counts.
 *
 * The publisher recorded nothing about requests before this: no counter, no
 * access log, no analytics, no database. So the thing to prove is not that a
 * number goes up, it is that it goes up for the right requests and only those,
 * and that it survives the process ending.
 *
 * Six questions, and each is a way the number could be wrong in a way nobody
 * would notice:
 *
 * **Does opening the page count?** That page is `no-store`, so every open
 * reaches the origin and the count is honest.
 *
 * **Does asking for the video count?** It must not. `/media` answers a year at
 * the edge since 3.4.3, so a counter there measures cache misses rather than
 * viewers: a number that falls as the caching works better.
 *
 * **Does the pre-warm count?** It must not. It asks for the page on purpose,
 * as a reachability check, so without a rule every clip starts life with
 * exactly one view.
 *
 * **Does a HEAD count?** No. That is something checking the page exists.
 *
 * **Do the counts survive a restart?** They are held in memory and flushed, so
 * an unflushed count is a lost count.
 *
 * **Is the sidecar still public?** It was: `GET /media/x.mp4.meta.json`
 * returned the display name and the marks. It should now be a 404, and it is
 * the reason the counters file lives outside the served directory.
 *
 *   node scripts/publisher-views-check.mjs
 *
 * Nothing of yours is touched: this runs the publisher from source against a
 * throw-away directory on a spare port.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * A port the operating system says is free, rather than one chosen by hand.
 *
 * A fixed port means a run that fails partway leaves a publisher listening on
 * it, and the next run silently talks to *that* one: the counts are wrong, the
 * fixes under test are not in it, and every assertion lies in a way that looks
 * like the feature is broken. Which is exactly what happened.
 */
const PORT = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const TOKEN = 'views-check-token';

const root = mkdtempSync(join(tmpdir(), 'goodbit-views-'));
const uploads = join(root, 'public');
const viewsFile = join(root, 'views.json');
mkdirSync(uploads, { recursive: true });

// A clip, and a sidecar beside it. Neither has to be real video: nothing here
// decodes anything.
writeFileSync(join(uploads, 'clip.mp4'), 'not really a video');
writeFileSync(
  join(uploads, 'clip.mp4.meta.json'),
  JSON.stringify({ displayName: 'A clip', game: 'Battlefield 6', goodBits: [] }),
);

const failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label);
};

const base = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  PORT: String(PORT),
  UPLOAD_DIR: uploads,
  VIEWS_FILE: viewsFile,
  PUBLISH_TOKEN: TOKEN,
  PUBLIC_BASE_URL: '',
  CACHE_PREWARM: '0',
  /*
   * Flush often, so persistence can be checked without a signal.
   *
   * The shutdown flush is real and matters in production, where this runs in a
   * container on Linux and `SIGTERM` runs handlers. On Windows `child.kill`
   * terminates a spawned process outright and no handler runs at all, so a
   * bench that tested the signal would be testing the platform.
   */
  VIEWS_FLUSH_MS: '300',
};

/**
 * The publisher itself, not a shell that owns one.
 *
 * `spawn('npx', …, { shell: true })` makes the child `cmd.exe`, so `kill`
 * reaches the shell and the publisher survives it: the port stays taken, the
 * next start waits forever for a bind that cannot happen, and every run leaves
 * another orphan behind. Sixteen of them accumulated while this was being
 * written.
 *
 * Running `tsx`'s CLI with this process's own node removes the shell, so the
 * handle really is the process and `kill` really kills it.
 */
const TSX = join(process.cwd(), 'publisher', 'node_modules', 'tsx', 'dist', 'cli.mjs');

async function start() {
  const child = spawn(process.execPath, [TSX, 'src/index.ts'], {
    cwd: join(process.cwd(), 'publisher'),
    env,
    /*
     * stderr is inherited, not piped.
     *
     * A piped stream nobody reads is a pipe that eventually fills and a child
     * that blocks writing to it, which presents as a publisher that never
     * finishes starting. Inheriting also means its errors land in this run's
     * own output rather than being swallowed.
     */
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => process.stdout.write(`  [publisher] ${chunk}`));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the publisher did not start')), 30_000);
    child.stdout.on('data', (chunk) => {
      if (chunk.includes('Publisher listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`the publisher exited with ${code}`)));
  });

  running.add(child);
  child.on('exit', () => running.delete(child));
  return child;
}

/** Poll until something is true, or give up. */
async function until(condition, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

/** Stop a publisher and wait for it to actually be gone. */
async function stop(child) {
  if (child.exitCode !== null) return;

  child.kill();

  await new Promise((resolve) => {
    child.on('exit', resolve);
    // A process that will not go is worse than a bench that hangs on it.
    setTimeout(resolve, 5000);
  });
}

/*
 * Never leave one running.
 *
 * A bench that throws partway used to leave a publisher on the port, and the
 * next run talked to it instead of to the code under test.
 */
const running = new Set();

function killEverything() {
  for (const child of running) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
}

process.on('exit', killEverything);

/*
 * Clean up on a crash, then let the crash be a crash.
 *
 * Registering a handler for `uncaughtException` **suppresses Node's own
 * exit**, so an earlier version of this cleaned up and then sat there with the
 * process alive and nothing more printed: a silent hang that looked exactly
 * like the publisher failing to start, when it was this file eating its own
 * error. The exit is explicit for that reason.
 */
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (error) => {
    console.error(`
${event}:`, error);
    killEverything();
    process.exit(1);
  });
}

const stats = async () => {
  const response = await fetch(`${base}/api/publish/stats`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return response.json();
};

let server = await start();

/* ------------------------------------------------------------- counting */

console.log('\nwhat counts as a view');

await fetch(`${base}/clip.mp4`);
await fetch(`${base}/clip.mp4`);
let seen = await stats();
ok('opening the page counts', seen.clips?.[0]?.views === 2, String(seen.clips?.[0]?.views));

await fetch(`${base}/media/clip.mp4`);
seen = await stats();
ok(
  'asking for the video does not',
  seen.clips[0].views === 2,
  `${seen.clips[0].views} after a /media request`,
);

await fetch(`${base}/clip.mp4`, { headers: { 'User-Agent': 'GoodBit-Publisher/cache-prewarm' } });
seen = await stats();
ok('nor does the pre-warm', seen.clips[0].views === 2, String(seen.clips[0].views));

await fetch(`${base}/clip.mp4`, { method: 'HEAD' });
seen = await stats();
ok('nor does a HEAD', seen.clips[0].views === 2, String(seen.clips[0].views));

await fetch(`${base}/gone.mp4`);
seen = await stats();
ok(
  'and a link to a clip that was unpublished counts nothing',
  seen.clips.length === 1,
  `${seen.clips.length} clips`,
);

/* ---------------------------------------------------------- what it says */

console.log('\nwhat the stats say');
console.log(`  ${JSON.stringify(seen.totals)}`);
ok('the totals add up', seen.totals.views === 2 && seen.totals.clips === 1);
ok('a clip carries when it was last opened', Boolean(seen.clips[0].lastViewedAt));
ok('and its size', seen.clips[0].sizeBytes > 0, String(seen.clips[0].sizeBytes));
ok(
  'the sidecar is not listed as a clip',
  seen.clips.every((clip) => !clip.filename.endsWith('.meta.json')),
);

/* ------------------------------------------------------- the sidecar leak */

console.log('\nthe sidecar');
const leaked = await fetch(`${base}/media/clip.mp4.meta.json`);
ok('is no longer served', leaked.status === 404, String(leaked.status));

/* ---------------------------------------------------------- across a restart */

console.log('\nacross a restart');
server.kill('SIGTERM');
await new Promise((resolve) => server.on('exit', resolve));

/*
 * Waited for rather than asserted on the instant the process is told to stop.
 *
 * On Windows a spawned process is killed outright and no shutdown handler
 * runs, so what puts the counts on disk here is the flush timer, which is
 * asynchronous with respect to the kill. The property worth testing is that
 * the counts reach disk, not that they reach it in zero milliseconds.
 */
const written = await until(() => existsSync(viewsFile), 4000);
ok('the counts were written out', written, viewsFile);
if (existsSync(viewsFile)) {
  const saved = JSON.parse(readFileSync(viewsFile, 'utf-8'));
  console.log(`  ${JSON.stringify(saved)}`);
  ok('with the right number in them', saved['clip.mp4']?.views === 2);
}

server = await start();
seen = await stats();
ok('and are still there afterwards', seen.clips[0].views === 2, String(seen.clips[0].views));

await fetch(`${base}/clip.mp4`);
seen = await stats();
ok('and carry on from where they were', seen.clips[0].views === 3, String(seen.clips[0].views));

await stop(server);

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
