/**
 * Start the built app with the Stream Deck server on, and knock on its door.
 *
 * The door is a named pipe now, not a port, so what is proved here as output
 * rather than claimed in a comment:
 *
 * - **The plugin gets in with no token at all**, over the pipe for this
 *   profile, speaking plain HTTP through `socketPath`.
 * - **No port is open**: the app under test listens on no TCP port at all.
 * - **The pipe is this profile's own**: the installed app's default pipe name
 *   is not the one a moved profile listens on, so a test never answers for a
 *   real GoodBit and the other way round.
 *
 * What is not proved here, because it needs a second Windows account: that
 * another account cannot write to the pipe. That rests on the default
 * security descriptor Windows gives a pipe, described in `pipe.ts`.
 *
 * Then the keys themselves, and the one that needed deciding: discarding from
 * a physical key is refused while it is switched off, refused without the long
 * press's `confirm`, and refused for any clip carrying something that exists
 * only in GoodBit. Only a plain clip, with all three satisfied, goes to the
 * Recycle Bin.
 *
 *   node scripts/streamdeck-check.mjs
 *
 * Throw-away profile, throw-away library, generated clips. Run `npm run build`
 * first: this drives `out/`, not the source. The one clip it discards is a
 * two second test card it generated, and it lands in this machine's real
 * Recycle Bin, because that is where the app sends it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const ffmpeg = (await import('ffmpeg-static')).default;

const data = mkdtempSync(join(tmpdir(), 'goodbit-deck-data-'));
const library = mkdtempSync(join(tmpdir(), 'goodbit-deck-lib-'));
mkdirSync(join(library, 'Battlefield 6'), { recursive: true });

// The same rule as `services/streamdeck/pipe.ts`, for a profile moved with GOODBIT_USER_DATA.
const PIPE = String.raw`\\.\pipe\goodbit-streamdeck-` + createHash('sha256').update(data.toLowerCase()).digest('hex').slice(0, 10);
const DEFAULT_PIPE = String.raw`\\.\pipe\goodbit-streamdeck`;

// Two clips a minute apart, so "the latest" is unambiguous.
const clips = ['older.mp4', 'newest.mp4'];
clips.forEach((name, index) => {
  const file = join(library, 'Battlefield 6', name);
  execFileSync(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file,
  ]);
  const when = new Date(Date.now() - (clips.length - index) * 60_000);
  utimesSync(file, when, when);
});

const writeSettings = (extra) =>
  writeFileSync(
    join(data, 'settings.json'),
    JSON.stringify({
      videosRoot: library,
      audioRoot: join(library, '.audio'),
      streamDeckEnabled: true,
      ...extra,
    }),
    'utf-8',
  );
writeSettings({ streamDeckAllowDiscard: false });

const failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label);
};

const launch = () =>
  electron.launch({ args: ['out/main/index.js', '--hidden'], env: { ...process.env, GOODBIT_USER_DATA: data } });

/** What the plugin does: HTTP over the pipe, no headers of its own. */
function call(path, { method = 'GET', body, pipe = PIPE } = {}) {
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: pipe,
        path,
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        timeout: 20_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          } catch {
            /* no body */
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitFor(check, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

let app = await launch();
const ready = await waitFor(async () => (await call('/v1/stats')).body?.clips >= 2, 40_000);

try {
  /* --------------------------------------------------------------- the door */

  console.log('\nthe door');
  ok('the plugin gets in over the pipe, with no token', ready);

  const unknown = await call('/v1/nothing');
  ok('an unknown key is a 404', unknown.status === 404, String(unknown.status));

  // Not "nothing answers on 43120": another GoodBit on this machine, on an
  // older build, may well be there. The claim is about this one: the app under
  // test listens on no TCP port at all.
  const pid = app.process().pid;
  const listening = execFileSync('netstat', ['-ano', '-p', 'TCP'])
    .toString()
    .split(/\r?\n/)
    .filter((line) => /LISTENING/.test(line) && line.trim().endsWith(` ${pid}`));
  ok('the app under test listens on no TCP port', listening.length === 0, listening.join(' | ') || `pid ${pid}`);

  let otherPipe = 'refused';
  try {
    await call('/v1/health', { pipe: DEFAULT_PIPE });
    otherPipe = 'answered';
  } catch {
    /* nothing there, or the installed app, which is not this one */
  }
  ok(
    "this profile's pipe is its own, not the installed app's",
    PIPE !== DEFAULT_PIPE,
    `${PIPE} (default pipe ${otherPipe})`,
  );

  /* ---------------------------------------------------------------- the keys */

  console.log('\nthe keys');
  const stats = await call('/v1/stats');
  console.log(`  ${JSON.stringify(stats.body)}`);
  ok('stats name the newest clip', stats.body?.latest?.title === 'newest.mp4', stats.body?.latest?.title);

  const discardOff = await call('/v1/latest/discard', { method: 'POST', body: { confirm: true } });
  ok('discard is refused while it is switched off', discardOff.status === 403, String(discardOff.status));

  // The save key presses a real key, so this bench only runs it where it
  // cannot: with OBS closed it must say so, and press nothing.
  const obsUp = execFileSync('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH']).toString().includes('obs64.exe');
  if (!obsUp) {
    const save = await call('/v1/replay/save', { method: 'POST' });
    ok(
      'the save key says OBS is off rather than pretending',
      save.status === 409 && save.body?.reason === 'obs-off',
      JSON.stringify(save.body),
    );
  } else {
    console.log('  (OBS is running, so the save key is not pressed by this bench)');
  }

  const tagged = await call('/v1/latest/tag', { method: 'POST', body: { tag: 'clutch' } });
  ok('a key tags the newest clip', tagged.status === 200 && tagged.body?.tag === 'clutch', JSON.stringify(tagged.body));

  const noTag = await call('/v1/latest/tag', { method: 'POST', body: {} });
  ok('a tag key with no tag set says so', noTag.status === 400);

  const publishNoPublisher = await call('/v1/latest/publish', { method: 'POST' });
  ok(
    'publish says there is no publisher rather than failing slowly',
    publishNoPublisher.status === 409,
    JSON.stringify(publishNoPublisher.body),
  );
} finally {
  await app.close();
}

/* ------------------------------------------------ discard, switched on */

console.log('\ndiscard, switched on');
writeSettings({ streamDeckAllowDiscard: true });
app = await launch();

try {
  await waitFor(async () => (await call('/v1/health')).status === 200, 30_000);

  const noConfirm = await call('/v1/latest/discard', { method: 'POST', body: {} });
  ok('a tap is not enough, it needs the long press', noConfirm.status === 400, String(noConfirm.status));

  const keptTagged = await call('/v1/latest/discard', { method: 'POST', body: { confirm: true } });
  ok(
    'a clip somebody tagged is kept',
    keptTagged.status === 409 && keptTagged.body?.reason === 'tagged',
    JSON.stringify(keptTagged.body),
  );
} finally {
  await app.close();
}

/*
 * A plain clip, which is the one case discard is for: a newer recording that
 * nobody has written anything about.
 */
const fresh = join(library, 'Battlefield 6', 'plain.mp4');
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fresh,
]);

app = await launch();

try {
  let latest = null;
  await waitFor(async () => {
    latest = (await call('/v1/stats')).body?.latest?.title;
    return latest === 'plain.mp4';
  }, 40_000);
  ok('a new plain clip is now the latest', latest === 'plain.mp4', String(latest));

  const discarded = await call('/v1/latest/discard', { method: 'POST', body: { confirm: true } });
  ok(
    'and a long press on it sends it to the Recycle Bin',
    discarded.status === 200 && discarded.body?.discarded === true,
    JSON.stringify(discarded.body),
  );

  const after = await call('/v1/stats');
  ok('and it is gone from the library', after.body?.latest?.title !== 'plain.mp4', after.body?.latest?.title);
} finally {
  await app.close();
}

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
