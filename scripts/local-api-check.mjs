/**
 * Knock on GoodBit's local API the way another program on this PC would, and
 * read back what is true of it.
 *
 *   node scripts/local-api-check.mjs            # throw-away profile, invisible and muted
 *   node scripts/local-api-check.mjs --attach   # read only, against the app that is running
 *
 * **Default mode** launches the built app (`npm run build` first, this drives
 * `out/`) on a profile and a library that are made for the run, with the
 * windows invisible and the audio muted. It proves, as output and not as a
 * comment:
 *
 * - the app under test listens on **no TCP port**;
 * - the pipe name is **random**: it has the shape of a uuid, a second launch
 *   gets a different one, and the discovery file is gone once the app closes;
 * - the process that owns the pipe is the one **the discovery file names**,
 *   asked of Windows with `GetNamedPipeServerProcessId`. This is the check
 *   that matters: a pipe name is only a name, and a client that trusts the
 *   file should be able to confirm who is behind it before it sends anything;
 * - the snapshot is made of **finite numbers**, and the check **fails if it
 *   parsed no sections at all**, since an empty walk and a clean one look the
 *   same;
 * - a replay dropped into staging arrives as `clip.saving` and then
 *   `clip.saved`, in that order;
 * - the refusals: 401 with no session, 403 for a capability that is off, 409
 *   for a clip that is not the latest.
 *
 * **`--attach`** is for the real app and writes nothing. It reads the
 * discovery file, says hello, reads the state, listens for ten seconds and
 * fetches one thumbnail. It never stars, tags, publishes or discards, and it
 * never touches the settings. Whether to run it is the owner's call: the
 * notch decides when the first picture of a session is wanted, and an
 * attached client is a second reader of the same events.
 *
 * The one thing that needs a second Windows account and is therefore not
 * benched: that another account cannot write to the pipe. It rests on the
 * default security descriptor Windows gives a pipe, described in `pipe.ts`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const attach = process.argv.includes('--attach');

/** Mirrors `SECTION_NAMES` in `src/shared/localApi.ts`: the walk below is checked against it. */
const SECTION_NAMES = [
  'saving', 'obs', 'drive', 'today', 'latest', 'session', 'recent', 'found',
  'tags', 'week', 'views', 'jobs', 'clips', 'games', 'publisher',
];
const PIPE_SHAPE = /^\\\\\.\\pipe\\goodbit-api-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, ms, every = 250) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      /* not there yet */
    }
    await sleep(every);
  }
  return false;
}

/* ------------------------------------------------------------ the client */

/** One request and one reply over the pipe. `raw` keeps the bytes. */
function call(pipe, path, { method = 'GET', session, body, raw = false } = {}) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: pipe,
        path,
        method,
        timeout: 20_000,
        headers: {
          ...(session ? { 'GoodBit-Session': session } : {}),
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const bytes = Buffer.concat(chunks);
          if (raw) return resolve({ status: res.statusCode, bytes, type: res.headers['content-type'] });
          let json = null;
          try {
            json = JSON.parse(bytes.toString('utf-8'));
          } catch {
            /* no body */
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload ?? undefined);
  });
}

/** Open the stream and keep every line. `lines` fills as they arrive; `close()` ends it. */
function listen(pipe) {
  const lines = [];
  let response = null;
  const req = request({ socketPath: pipe, path: '/v1/events', method: 'GET' }, (res) => {
    response = res;
    let buffered = '';
    res.setEncoding('utf-8');
    res.on('data', (text) => {
      buffered += text;
      let newline = buffered.indexOf('\n');
      while (newline >= 0) {
        const lineText = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf('\n');
        if (!lineText.trim()) continue;
        try {
          lines.push(JSON.parse(lineText));
        } catch {
          lines.push({ type: 'unparseable', text: lineText });
        }
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return {
    lines,
    close: () => {
      response?.destroy();
      req.destroy();
    },
  };
}

/* --------------------------------------------------- what a pipe tells us */

/**
 * Who owns the pipe, asked of Windows. A client is made, connected and left
 * silent (the server never answers first, and this sends nothing), and
 * `GetNamedPipeServerProcessId` reads the owner off the handle.
 */
function pipeOwnerPid(pipe) {
  const script = join(tmpdir(), `goodbit-pipe-owner-${process.pid}.ps1`);
  const name = pipe.replace(/^\\\\\.\\pipe\\/, '');
  writeFileSync(
    script,
    [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class PipeOwner {',
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      '  public static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint pid);',
      '}',
      '"@',
      `$client = New-Object System.IO.Pipes.NamedPipeClientStream('.', '${name}', [System.IO.Pipes.PipeDirection]::InOut)`,
      '$client.Connect(5000)',
      '[uint32]$owner = 0',
      '$found = [PipeOwner]::GetNamedPipeServerProcessId($client.SafePipeHandle.DangerousGetHandle(), [ref]$owner)',
      '$client.Dispose()',
      'if (-not $found) { throw "GetNamedPipeServerProcessId failed" }',
      'Write-Output $owner',
    ].join('\r\n'),
    'utf-8',
  );
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return Number(out.trim().split(/\r?\n/).pop());
  } finally {
    rmSync(script, { force: true });
  }
}

/** Every number in a value, and the first one that is not finite. */
function walkNumbers(value, found = { count: 0, bad: null }, path = '') {
  if (typeof value === 'number') {
    found.count += 1;
    if (!Number.isFinite(value) && found.bad === null) found.bad = `${path} = ${value}`;
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walkNumbers(item, found, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walkNumbers(item, found, path ? `${path}.${key}` : key);
  }
  return found;
}

/** The snapshot's own checks, shared by both modes. */
function checkState(response) {
  const state = response?.body?.state;
  const parsed = state ? SECTION_NAMES.filter((name) => Object.prototype.hasOwnProperty.call(state, name)) : [];
  ok('the snapshot parsed sections', parsed.length > 0, `${parsed.length} of ${SECTION_NAMES.length}`);
  ok('and every section the contract names is there', parsed.length === SECTION_NAMES.length,
    SECTION_NAMES.filter((name) => !parsed.includes(name)).join(', '));
  const numbers = walkNumbers(state ?? {});
  ok('the snapshot holds numbers', numbers.count > 0, String(numbers.count));
  ok('and every one of them is finite', numbers.bad === null, numbers.bad ?? '');
  return state;
}

/* ------------------------------------------------------------ attach mode */

async function runAttach() {
  const dir = process.env.GOODBIT_USER_DATA ?? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'GoodBit');
  const file = join(dir, 'local-api.json');
  console.log(`attaching through ${file}\n`);
  ok('the discovery file exists', existsSync(file), 'the app is not running, or the local API is off');
  if (!existsSync(file)) return;

  const found = JSON.parse(readFileSync(file, 'utf-8'));
  ok('its pipe has the shape of a random name', PIPE_SHAPE.test(found.pipe), found.pipe);

  const owner = pipeOwnerPid(found.pipe);
  ok('the pipe is owned by the process the file names', owner === found.pid, `owner ${owner}, file ${found.pid}`);

  const hello = await call(found.pipe, '/v1/hello');
  ok('hello answers', hello.status === 200 && hello.body?.api === 1, JSON.stringify(hello.body?.app));
  console.log(`  capabilities: ${(hello.body?.capabilities ?? []).join(', ')}`);

  const state = await call(found.pipe, '/v1/state');
  ok('state answers', state.status === 200, String(state.status));
  const sections = checkState(state);
  const session = state.body?.session;

  console.log('\nten seconds of events');
  const stream = listen(found.pipe);
  await sleep(10_000);
  stream.close();
  const types = {};
  for (const line of stream.lines) types[line.type] = (types[line.type] ?? 0) + 1;
  console.log(`  ${JSON.stringify(types)}`);
  ok('the stream opens with a snapshot', stream.lines[0]?.type === 'snapshot', stream.lines[0]?.type ?? 'nothing');
  ok('nothing unparseable came down it', !stream.lines.some((line) => line.type === 'unparseable'));
  const streamNumbers = walkNumbers(stream.lines);
  ok('and every number in it is finite', streamNumbers.bad === null, streamNumbers.bad ?? `${streamNumbers.count} numbers`);

  console.log('\none thumbnail');
  const id = sections?.latest?.id ?? Object.values(sections?.clips ?? {})[0]?.id;
  ok('the library has a clip to ask about', typeof id === 'number', String(id));
  if (typeof id === 'number') {
    let picture = null;
    await waitFor(async () => {
      picture = await call(found.pipe, `/v1/clips/${id}/thumbnail?w=160`, { session, raw: true });
      return picture.status === 200;
    }, 20_000, 1000);
    const jpeg = picture?.status === 200 && picture.bytes[0] === 0xff && picture.bytes[1] === 0xd8;
    ok('a thumbnail comes back as a JPEG', jpeg, `${picture?.status}, ${picture?.bytes?.length ?? 0} bytes, ${picture?.type}`);
  }
}

/* ----------------------------------------------------------- default mode */

async function runDefault() {
  const { default: ffmpeg } = await import('ffmpeg-static');
  const { default: electronPath } = await import('electron');

  const base = mkdtempSync(join(tmpdir(), 'goodbit-localapi-'));
  const data = join(base, 'data');
  const library = join(base, 'videos');
  mkdirSync(data, { recursive: true });
  mkdirSync(join(library, 'Bench Game'), { recursive: true });

  const makeClip = (file, seconds = 2) =>
    execFileSync(ffmpeg, [
      '-hide_banner', '-v', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=30:duration=${seconds}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
    ]);

  // Two clips a minute apart, so there is a latest and something that is not.
  ['older.mp4', 'newest.mp4'].forEach((name, index) => {
    const file = join(library, 'Bench Game', name);
    makeClip(file);
    const when = new Date(Date.now() - (2 - index) * 60_000);
    utimesSync(file, when, when);
  });

  const writeSettings = (allowDiscard) =>
    writeFileSync(
      join(data, 'settings.json'),
      JSON.stringify({
        videosRoot: library,
        audioRoot: join(base, 'music'),
        publisherBaseUrl: '',
        startAtLogin: false,
        keepRunningInTray: false,
        migratedFromWebApp: false,
        localApiEnabled: true,
        localApiAllowDiscard: allowDiscard,
      }),
      'utf-8',
    );

  /*
   * Started directly, not through Playwright: its launcher opens a node
   * inspector and a remote debugging port on loopback in the app it starts,
   * which is exactly the kind of listener this check exists to rule out, and
   * the pid it reports is the launcher's, not the app's.
   */
  const launch = () => {
    const child = spawn(electronPath, ['out/main/index.js', '--mute-audio', '--disable-features=CalculateNativeWinOcclusion'], {
      env: { ...process.env, GOODBIT_USER_DATA: data, GOODBIT_TEST_INVISIBLE: '1' },
      stdio: 'ignore',
      windowsHide: true,
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    return {
      pid: child.pid,
      /** Asks politely first, so the app runs its own quit and takes its discovery file down. */
      async close() {
        if (child.exitCode !== null) return true;
        try {
          execFileSync('taskkill', ['/PID', String(child.pid)], { stdio: 'ignore' });
        } catch {
          /* already gone */
        }
        const polite = await Promise.race([exited.then(() => true), sleep(20_000).then(() => false)]);
        if (!polite) {
          try {
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          } catch {
            /* gone */
          }
          await exited;
        }
        return polite;
      },
    };
  };

  const discovery = join(data, 'local-api.json');
  const readDiscovery = () => JSON.parse(readFileSync(discovery, 'utf-8'));
  const children = [];

  try {
    /* ----------------------------------------------- launch one: discard off */

    writeSettings(false);
    let app = await launch();
    children.push(app);
    const appPid = app.pid;
    ok('the app wrote a discovery file', await waitFor(() => existsSync(discovery), 40_000));
    const first = readDiscovery();
    const firstPipe = first.pipe;

    console.log('\nthe door');
    ok('its pipe has the shape of a random name', PIPE_SHAPE.test(firstPipe), firstPipe);
    const alive = execFileSync('tasklist', ['/FI', `PID eq ${first.pid}`, '/NH'], { encoding: 'utf-8' }).includes(String(first.pid));
    ok('the file names the process that was started', alive && first.pid === appPid, `file ${first.pid}, started ${appPid}`);

    const owner = pipeOwnerPid(firstPipe);
    ok('the pipe is owned by the process the file names', owner === first.pid, `owner ${owner}, file ${first.pid}`);

    // The instrument is asserted: a netstat that listed nothing at all would
    // pass for any pid.
    const sockets = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf-8' })
      .split(/\r?\n/)
      .filter((line) => /LISTENING/.test(line));
    ok("netstat listed the machine's listeners", sockets.length > 0, String(sockets.length));
    const listening = sockets.filter((line) => line.trim().endsWith(` ${first.pid}`));
    ok('the app under test listens on no TCP port', listening.length === 0, listening.join(' | ') || `pid ${first.pid}`);

    const hello = await call(firstPipe, '/v1/hello');
    ok('hello answers', hello.status === 200 && hello.body?.api === 1);
    ok('and does not offer to delete while that is off', !(hello.body?.capabilities ?? []).includes('clips.discard'));
    ok('and does not offer to publish with no publisher', !(hello.body?.capabilities ?? []).includes('clips.publish'));

    console.log('\nthe snapshot');
    ok('the library is read in', await waitFor(async () => (await call(firstPipe, '/v1/state')).body?.state?.today?.count >= 2, 40_000));
    const state = await call(firstPipe, '/v1/state');
    const sections = checkState(state);
    const session = state.body?.session;
    ok('it carries a session', typeof session === 'string' && session.length > 0);
    ok('and knows both clips', Object.keys(sections?.clips ?? {}).length >= 2, String(Object.keys(sections?.clips ?? {}).length));

    console.log('\nsaving, then saved');
    const stream = listen(firstPipe);
    ok('the stream opens with a snapshot', await waitFor(() => stream.lines[0]?.type === 'snapshot', 10_000));
    const staging = join(library, '.goodbit-incoming');
    mkdirSync(staging, { recursive: true });
    makeClip(join(staging, 'bench-replay.mp4'));
    const events = () => stream.lines.filter((line) => line.type === 'event').map((line) => line.event);
    ok('a file in staging says saving', await waitFor(() => events().includes('clip.saving'), 30_000), events().join(', '));
    ok('and then saved', await waitFor(() => events().includes('clip.saved'), 60_000), events().join(', '));
    ok('in that order', events().indexOf('clip.saving') < events().indexOf('clip.saved'));
    const streamNumbers = walkNumbers(stream.lines);
    ok('every number on the stream is finite', streamNumbers.bad === null, streamNumbers.bad ?? `${streamNumbers.count} numbers`);
    const saved = stream.lines.find((line) => line.type === 'event' && line.event === 'clip.saved');
    stream.close();

    console.log('\nthe refusals');
    const known = Object.values(sections?.clips ?? {})[0]?.id;
    const noSession = await call(firstPipe, `/v1/clips/${known}/star`, { method: 'POST', body: { starred: true } });
    ok('a write with no session is a 401', noSession.status === 401, JSON.stringify(noSession.body));

    const publishOff = await call(firstPipe, `/v1/clips/${known}/publish`, { method: 'POST', session, body: {} });
    ok('publishing with no publisher is a 403', publishOff.status === 403, JSON.stringify(publishOff.body));

    const discardOff = await call(firstPipe, `/v1/clips/${saved?.clip?.id}/discard`, {
      method: 'POST', session, body: { confirm: true },
    });
    ok('deleting while it is off is a 403', discardOff.status === 403, JSON.stringify(discardOff.body));

    const bigBody = await call(firstPipe, '/v1/clips/star', { method: 'POST', session, body: { ids: 'x'.repeat(6000) } });
    ok('a body over 4 KB is a 413', bigBody.status === 413, String(bigBody.status));

    /*
     * The app is ended the way a crash ends it, because a window nobody can
     * see does not answer a polite close. What a crash leaves is the thing a
     * client has to cope with: a file naming a pipe nobody owns. The pid in it
     * is how a client tells, and the next launch writes a new name over it.
     * A clean quit removing the file is `tests/e2e/local-api.spec.ts`'s.
     */
    await app.close();
    children.pop();
    const left = existsSync(discovery) ? readDiscovery() : null;
    const stale = left !== null && !execFileSync('tasklist', ['/FI', `PID eq ${left.pid}`, '/NH'], { encoding: 'utf-8' }).includes(String(left.pid));
    ok('after the app is killed, the file left behind names a dead process', left === null || stale, left ? `pid ${left.pid}` : 'no file');

    /* ------------------------------------------- launch two: discard allowed */

    console.log('\na second launch, with deleting allowed');
    writeSettings(true);
    app = await launch();
    children.push(app);
    ok('the app wrote a new discovery file', await waitFor(() => existsSync(discovery) && readDiscovery().pid !== first.pid, 40_000));
    const second = readDiscovery();
    ok('with a different pipe name', second.pipe !== firstPipe && PIPE_SHAPE.test(second.pipe), second.pipe);

    const helloTwo = await call(second.pipe, '/v1/hello');
    ok('hello now offers deleting', (helloTwo.body?.capabilities ?? []).includes('clips.discard'));

    await waitFor(async () => (await call(second.pipe, '/v1/state')).body?.state?.today?.count >= 3, 40_000);
    const stateTwo = await call(second.pipe, '/v1/state');
    const sectionsTwo = stateTwo.body?.state;
    const notLatest = Object.values(sectionsTwo?.clips ?? {}).find((clip) => clip.id !== sectionsTwo?.latest?.id);
    ok('there is a clip that is not the latest', Boolean(notLatest), String(Object.keys(sectionsTwo?.clips ?? {}).length));
    if (notLatest) {
      const stale = await call(second.pipe, `/v1/clips/${notLatest.id}/discard`, {
        method: 'POST', session: stateTwo.body.session, body: { confirm: true },
      });
      ok('deleting a clip that is not the latest is a 409', stale.status === 409 && stale.body?.error === 'latest_changed', JSON.stringify(stale.body));
    }
    await app.close();
    children.pop();
  } finally {
    for (const open of children) await open.close().catch(() => {});
    await sleep(500);
    rmSync(base, { recursive: true, force: true });
  }
}

try {
  if (attach) await runAttach();
  else await runDefault();
} catch (error) {
  ok('the check ran to the end', false, error instanceof Error ? error.message : String(error));
}

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
