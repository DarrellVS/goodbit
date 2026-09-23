/**
 * Run the real publisher against a fake Discord, and read what it was sent.
 *
 * Every rule about the webhook is about *when* a message goes, not what it
 * says, and each is a way to spam a channel or to post a broken card:
 *
 * **Is the card sent after the poster, not before?** Discord fetches the image
 * once, when it renders the embed, and keeps what it got. Sent at publish time
 * the poster URL is still a 404 and the card is pictureless for ever.
 *
 * **Does a clip with no poster still get announced?** A desktop too old to
 * send one never reaches the thumbnail route, so a grace timer announces it
 * without a picture rather than not at all.
 *
 * **Is a re-publish silent?** Every "shrink the published copy" re-uploads
 * under the same filename. That is not news.
 *
 * **Is a trim silent?** A trim of a published clip unpublishes it and
 * publishes it again seconds later. Two messages per trim would teach the
 * channel to mute the bot.
 *
 * **Is a real takedown announced?** Once its grace period has passed.
 *
 * **Is the webhook URL ever printed?** It must not be: it is a secret in the
 * same class as the publish token.
 *
 *   node scripts/discord-webhook-check.mjs
 *
 * Nothing real is touched: a throw-away upload directory, a fake webhook on
 * localhost, and a spare port.
 */
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const PORT = await freePort();
const HOOK_PORT = await freePort();
const TOKEN = 'discord-check-token';
// A path that would be recognisable if it leaked into a log line.
const SECRET_PATH = '/api/webhooks/1234567890/THIS-IS-THE-SECRET-PART';
const HOOK_URL = `http://127.0.0.1:${HOOK_PORT}${SECRET_PATH}`;

const POSTER_GRACE_MS = 700;
const TAKEDOWN_GRACE_MS = 1200;

const root = mkdtempSync(join(tmpdir(), 'goodbit-discord-'));
const uploads = join(root, 'public');
mkdirSync(uploads, { recursive: true });

const failures = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) failures.push(label);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------- fake discord */

const received = [];
const hook = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      received.push({ path: req.url, body: JSON.parse(body) });
    } catch {
      received.push({ path: req.url, body: null });
    }
    res.writeHead(204).end();
  });
});
await new Promise((resolve) => hook.listen(HOOK_PORT, '127.0.0.1', resolve));

/* ----------------------------------------------------------------- publisher */

const TSX = join(process.cwd(), 'publisher', 'node_modules', 'tsx', 'dist', 'cli.mjs');
let log = '';

const child = spawn(process.execPath, [TSX, 'src/index.ts'], {
  cwd: join(process.cwd(), 'publisher'),
  env: {
    ...process.env,
    PORT: String(PORT),
    UPLOAD_DIR: uploads,
    VIEWS_FILE: join(root, 'views.json'),
    PUBLISH_TOKEN: TOKEN,
    PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}`,
    CACHE_PREWARM: '0',
    DISCORD_WEBHOOK_URL: HOOK_URL,
    // The fake is on localhost, not discord.com. Everywhere else this is off.
    DISCORD_WEBHOOK_ALLOW_ANY: '1',
    DISCORD_POSTER_GRACE_MS: String(POSTER_GRACE_MS),
    DISCORD_TAKEDOWN_GRACE_MS: String(TAKEDOWN_GRACE_MS),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.setEncoding('utf-8');
child.stderr.setEncoding('utf-8');
child.stdout.on('data', (chunk) => (log += chunk));
child.stderr.on('data', (chunk) => (log += chunk));

process.on('exit', () => {
  try {
    child.kill();
  } catch {
    /* already gone */
  }
});
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (error) => {
    console.error(`\n${event}:`, error);
    process.exit(1);
  });
}

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the publisher did not start')), 30_000);
  child.stdout.on('data', () => {
    if (log.includes('Publisher listening')) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on('exit', (code) => reject(new Error(`the publisher exited with ${code}`)));
});

const api = `http://127.0.0.1:${PORT}/api/publish`;
const auth = { Authorization: `Bearer ${TOKEN}` };

async function publish(name, displayName, goodBits = [], { announce = true } = {}) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not really a video')]), name);
  form.append('displayName', displayName);
  form.append('game', 'Battlefield 6');
  form.append('goodBits', JSON.stringify(goodBits));
  if (!announce) form.append('announce', '0');
  const response = await fetch(api, { method: 'POST', headers: auth, body: form });
  return response.ok;
}

async function poster(name) {
  // A one-pixel JPEG. The publisher stores bytes; it never decodes them.
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  );
  const response = await fetch(`${api}/${encodeURIComponent(name)}/thumbnail`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'image/jpeg' },
    body: jpeg,
  });
  return response.ok;
}

const unpublish = (name) =>
  fetch(`${api}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: auth });

/* ------------------------------------------------ a clip, then its poster */

console.log('\na clip and its poster');

await publish('triple.mp4', 'Triple kill', [
  { startSec: 2, endSec: 6, name: 'The triple', reason: null },
  { startSec: 9, endSec: 12, name: null, reason: 'kill banner' },
]);
await sleep(150);
ok('nothing is sent before the poster exists', received.length === 0, `${received.length} sent`);

await poster('triple.mp4');
await sleep(400);
ok('the poster sends the card', received.length === 1, `${received.length} sent`);

const card = received[0]?.body?.embeds?.[0];
console.log(`  ${JSON.stringify(card)}`);
ok('titled with the name, not the filename', card?.title === 'Triple kill', card?.title);
ok('linking to the embed page, not /media', card?.url?.endsWith('/triple.mp4') && !card.url.includes('/media/'), card?.url);
ok('with the poster as its picture', Boolean(card?.image?.url?.endsWith('.thumb.jpg')), card?.image?.url);
ok('naming the game', card?.author?.name === 'Battlefield 6');
ok(
  'and the marks, the way the page names them',
  card?.description === '2 marked moments, starting with The triple',
  card?.description,
);

/* --------------------------------------------------- a clip with no poster */

console.log('\na clip whose poster never comes');
received.length = 0;

await publish('old-desktop.mp4', 'From an old desktop');
await sleep(POSTER_GRACE_MS / 2);
ok('it waits for a poster first', received.length === 0);
await sleep(POSTER_GRACE_MS + 400);
ok('and is announced without one after the grace period', received.length === 1, `${received.length} sent`);
ok('with no picture', !received[0]?.body?.embeds?.[0]?.image);
ok(
  'and no description, rather than an empty one, for a clip with no marks',
  received[0]?.body?.embeds?.[0]?.description === undefined,
);

/* ------------------------------------------------------- a re-publish */

console.log('\na re-publish under the same name');
received.length = 0;

await publish('triple.mp4', 'Triple kill');
await poster('triple.mp4');
await sleep(POSTER_GRACE_MS + 400);
ok('is not news', received.length === 0, `${received.length} sent`);

/* --------------------------------------------------------------- a trim */

console.log('\na trim, which unpublishes and publishes again');
received.length = 0;

await unpublish('triple.mp4');
await sleep(200);
await publish('triple.mp4', 'Triple kill');
await poster('triple.mp4');
await sleep(TAKEDOWN_GRACE_MS + POSTER_GRACE_MS + 400);
ok('says nothing at all', received.length === 0, `${received.length} sent`);

/* ------------------------------------------------ a restore, not news */

/*
 * The desktop re-uploads every clip it holds as published that the server
 * lacks, at every boot. On a fresh or moved container that is the whole
 * library at once, and each one used to be announced as new.
 */
console.log('\na restore, which is not news');
received.length = 0;
await publish('restored.mp4', 'Put back', [], { announce: false });
await poster('restored.mp4');
await sleep(POSTER_GRACE_MS + 600);
ok('puts nothing in the channel, poster or no poster', received.length === 0, `${received.length} sent`);

/* ----------------------------------------------------------- a takedown */

console.log('\na real takedown');
received.length = 0;

await unpublish('triple.mp4');
await sleep(TAKEDOWN_GRACE_MS / 2);
ok('waits out the grace period', received.length === 0);
await sleep(TAKEDOWN_GRACE_MS + 400);
ok('then says the link is dead', received.length === 1, `${received.length} sent`);
ok(
  'naming the clip the way the channel saw it',
  received[0]?.body?.embeds?.[0]?.title === 'Triple kill',
  received[0]?.body?.embeds?.[0]?.title,
);

/* ---------------------------------------------------------------- the secret */

console.log('\nthe webhook URL');
ok('never appears in the log', !log.includes('THIS-IS-THE-SECRET-PART'));

child.kill();
hook.close();

if (failures.length) {
  console.error('\nFAILED');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
