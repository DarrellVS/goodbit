/**
 * Start the built app with the Stream Deck server on, and knock on its door.
 *
 * This reopens a port the internal API was moved off on purpose, so the three
 * things that make that acceptable are proved here as output rather than
 * claimed in a comment:
 *
 * - **No token is a 401**, before any route is even looked at.
 * - **A web page is a 403**, whether it sends a foreign `Origin` or rebinds its
 *   own name onto `127.0.0.1` and arrives with a foreign `Host`.
 * - **Nothing off this machine can connect at all**, because it binds
 *   `127.0.0.1` and never `0.0.0.0`.
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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const ffmpeg = (await import('ffmpeg-static')).default;

const PORT = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const data = mkdtempSync(join(tmpdir(), 'goodbit-deck-data-'));
const library = mkdtempSync(join(tmpdir(), 'goodbit-deck-lib-'));
mkdirSync(join(library, 'Battlefield 6'), { recursive: true });

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

const TOKEN = 'deck-check-token-deck-check-token';
const writeSettings = (extra) =>
  writeFileSync(
    join(data, 'settings.json'),
    JSON.stringify({
      videosRoot: library,
      audioRoot: join(library, '.audio'),
      streamDeckEnabled: true,
      streamDeckPort: PORT,
      streamDeckToken: TOKEN,
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

const app = await electron.launch({
  args: ['out/main/index.js', '--hidden'],
  env: { ...process.env, GOODBIT_USER_DATA: data },
});

const base = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${TOKEN}` };

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* no body */
  }
  return { status: response.status, body: json };
}

// Wait for the server and for the scan to have indexed both clips.
const deadline = Date.now() + 40_000;
let ready = null;
while (Date.now() < deadline) {
  try {
    ready = await call('/v1/stats', { headers: auth });
    if (ready.status === 200 && ready.body?.clips >= 2) break;
  } catch {
    /* not listening yet */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

try {
  /* --------------------------------------------------------------- the door */

  console.log('\nthe door');
  ok('the plugin gets in', ready?.status === 200, String(ready?.status));

  const noToken = await call('/v1/stats');
  ok('no token is a 401', noToken.status === 401, String(noToken.status));

  const wrongToken = await call('/v1/stats', { headers: { Authorization: 'Bearer nope' } });
  ok('a wrong token is a 401', wrongToken.status === 401, String(wrongToken.status));

  const page = await call('/v1/stats', { headers: { ...auth, Origin: 'https://evil.example' } });
  ok('a web page is a 403, even holding the token', page.status === 403, String(page.status));

  // fetch will not let a script set Host, so this one goes over a raw socket.
  const rebound = await new Promise((resolve) => {
    const socket = connect(PORT, '127.0.0.1', () => {
      socket.write(
        `GET /v1/stats HTTP/1.1\r\nHost: evil.example:${PORT}\r\nAuthorization: Bearer ${TOKEN}\r\nConnection: close\r\n\r\n`,
      );
    });
    let reply = '';
    socket.on('data', (chunk) => (reply += chunk));
    socket.on('end', () => resolve(reply.split(' ')[1]));
    socket.on('error', () => resolve('error'));
  });
  ok('DNS rebinding is a 403', rebound === '403', rebound);

  const unknown = await call('/v1/nothing', { headers: auth });
  ok('an unknown key is a 404, but only once you are in', unknown.status === 404);
  const unknownNoToken = await call('/v1/nothing');
  ok('and a 401 before that, so paths are not discoverable', unknownNoToken.status === 401);

  /*
   * Nothing off this machine. Tried against every non-loopback address this
   * machine has, because a server bound to 0.0.0.0 would answer on all of them.
   */
  const outside = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
  let reachableFromOutside = false;
  for (const address of outside) {
    try {
      await fetch(`http://${address}:${PORT}/v1/health`, {
        headers: auth,
        signal: AbortSignal.timeout(1500),
      });
      reachableFromOutside = true;
    } catch {
      /* refused, which is the answer wanted */
    }
  }
  ok(
    'and it cannot be reached on any other address this machine has',
    !reachableFromOutside,
    outside.join(', ') || 'no other interfaces',
  );

  /* ---------------------------------------------------------------- the keys */

  console.log('\nthe keys');
  const stats = await call('/v1/stats', { headers: auth });
  console.log(`  ${JSON.stringify(stats.body)}`);
  ok('stats name the newest clip', stats.body?.latest?.title === 'newest.mp4', stats.body?.latest?.title);

  const discardOff = await call('/v1/latest/discard', {
    method: 'POST',
    headers: auth,
    body: { confirm: true },
  });
  ok('discard is refused while it is switched off', discardOff.status === 403, String(discardOff.status));

  // The save key presses a real key, so this bench only runs it where it
  // cannot: with OBS closed it must say so, and press nothing.
  const obsUp = execFileSync('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH']).toString().includes('obs64.exe');
  if (!obsUp) {
    const save = await call('/v1/replay/save', { method: 'POST', headers: auth });
    ok(
      'the save key says OBS is off rather than pretending',
      save.status === 409 && save.body?.reason === 'obs-off',
      JSON.stringify(save.body),
    );
  } else {
    console.log('  (OBS is running, so the save key is not pressed by this bench)');
  }

  const tagged = await call('/v1/latest/tag', { method: 'POST', headers: auth, body: { tag: 'clutch' } });
  ok('a key tags the newest clip', tagged.status === 200 && tagged.body?.tag === 'clutch', JSON.stringify(tagged.body));

  const noTag = await call('/v1/latest/tag', { method: 'POST', headers: auth, body: {} });
  ok('a tag key with no tag set says so', noTag.status === 400);

  const publishNoPublisher = await call('/v1/latest/publish', { method: 'POST', headers: auth });
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

const app2 = await electron.launch({
  args: ['out/main/index.js', '--hidden'],
  env: { ...process.env, GOODBIT_USER_DATA: data },
});

try {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try {
      const probe = await call('/v1/health', { headers: auth });
      if (probe.status === 200) break;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const noConfirm = await call('/v1/latest/discard', { method: 'POST', headers: auth, body: {} });
  ok('a tap is not enough, it needs the long press', noConfirm.status === 400, String(noConfirm.status));

  const keptTagged = await call('/v1/latest/discard', {
    method: 'POST',
    headers: auth,
    body: { confirm: true },
  });
  ok(
    'a clip somebody tagged is kept',
    keptTagged.status === 409 && keptTagged.body?.reason === 'tagged',
    JSON.stringify(keptTagged.body),
  );
} finally {
  await app2.close();
}

/*
 * A plain clip, which is the one case discard is for. The tagged one is taken
 * out of the way by giving `older.mp4` the newest date, so the latest clip is
 * one nobody has written anything about.
 */
const fresh = join(library, 'Battlefield 6', 'plain.mp4');
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fresh,
]);

const app3 = await electron.launch({
  args: ['out/main/index.js', '--hidden'],
  env: { ...process.env, GOODBIT_USER_DATA: data },
});

try {
  const until = Date.now() + 40_000;
  let latest = null;
  while (Date.now() < until) {
    try {
      const probe = await call('/v1/stats', { headers: auth });
      latest = probe.body?.latest?.title;
      if (latest === 'plain.mp4') break;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  ok('a new plain clip is now the latest', latest === 'plain.mp4', String(latest));

  const discarded = await call('/v1/latest/discard', {
    method: 'POST',
    headers: auth,
    body: { confirm: true },
  });
  ok(
    'and a long press on it sends it to the Recycle Bin',
    discarded.status === 200 && discarded.body?.discarded === true,
    JSON.stringify(discarded.body),
  );

  const after = await call('/v1/stats', { headers: auth });
  ok('and it is gone from the library', after.body?.latest?.title !== 'plain.mp4', after.body?.latest?.title);
} finally {
  await app3.close();
}

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
