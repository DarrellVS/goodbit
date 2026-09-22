/**
 * Press the card's one button, and see what the app does about it.
 *
 * The overlay is the window whose entire job is to never disturb a game:
 * `focusable: false`, `showInactive()`, always on top at the screen-saver
 * level, and until this feature it ignored the mouse completely and had no
 * preload at all. Giving it a button undoes part of that, narrowly, and this
 * is what says the narrow part still holds.
 *
 * Four questions:
 *
 * **Is the bridge the small one?** The card gets `window.goodbitToast` with
 * two functions on it, and must not get `window.goodbit`, which is the API
 * that deletes clips. A sandboxed page sitting over somebody's game has no
 * business with that.
 *
 * **Can the window choose what the button does?** It must not. Main holds the
 * route and hands the page an opaque token; a token main did not issue is
 * ignored. Same rule `deeplink.ts` applies to a `goodbit://` link.
 *
 * **Does the press actually reach the app?** Through `openIn`, which handles a
 * closed, a minimised and an already-open window.
 *
 * **Is the offer spent afterwards?** A second click on a fading card must not
 * open a second editor.
 *
 * The one thing this cannot answer is the one that could kill the feature:
 * whether the card still refuses to steal focus **over a real borderless
 * fullscreen game**. That needs a game running and a person watching, and it
 * is on the hand-test list for `dev`.
 *
 *   node scripts/toast-button-check.mjs
 *
 * Throw-away profile, throw-away library, three generated clips. The real
 * library is never opened.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const ffmpeg = (await import('ffmpeg-static')).default;

const dataDir = mkdtempSync(join(tmpdir(), 'goodbit-toast-'));
const library = mkdtempSync(join(tmpdir(), 'goodbit-toast-lib-'));
mkdirSync(join(library, 'Battlefield 6'), { recursive: true });

for (const n of [1, 2, 3]) {
  execFileSync(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=30:duration=2`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    join(library, 'Battlefield 6', `clip-${n}.mp4`),
  ]);
}

writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify({ videosRoot: library, audioRoot: join(library, '.audio'), clipToast: true }),
  'utf-8',
);

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});

const appPage =
  app.windows().find((w) => !w.url().startsWith('data:')) ?? (await app.waitForEvent('window'));
await appPage.waitForLoadState('domcontentloaded');
await appPage.waitForTimeout(5000);

const fail = [];
const ok = (label, passed, detail = '') => {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!passed) fail.push(label);
};

const indexed = await appPage.evaluate(() =>
  window.goodbit.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 10 } }),
);
console.log(`  library: ${indexed.body?.total ?? 0} clips`);

void appPage.evaluate(() => window.goodbit.previewSweepToast());
await appPage.waitForTimeout(4500);

const overlay = app.windows().find((w) => w.url().startsWith('data:'));
ok('the card is a window of its own', Boolean(overlay));

const bridge = await overlay.evaluate(() => ({
  toast: typeof window.goodbitToast,
  keys: window.goodbitToast ? Object.keys(window.goodbitToast).sort() : [],
  app: typeof window.goodbit,
}));
console.log('  bridge:', JSON.stringify(bridge));
ok('the overlay has the narrow bridge', bridge.toast === 'object', bridge.toast);
ok('with exactly two calls on it', JSON.stringify(bridge.keys) === '["action","hover"]', bridge.keys.join(','));
ok("and not the app's own API", bridge.app === 'undefined', bridge.app);

const button = await overlay.evaluate(() => {
  const el = document.getElementById('action');
  return el ? { hidden: el.hidden, text: el.textContent, hasToken: Boolean(el.dataset.token) } : null;
});
console.log('  button:', JSON.stringify(button));
ok('it is offering a button', button && !button.hidden, button?.text ?? 'none');
ok('with a token main issued', button?.hasToken === true);

// A made-up token must be refused: the window cannot choose what happens.
const before = appPage.url();
await overlay.evaluate(() => window.goodbitToast.action('not-the-token'));
await appPage.waitForTimeout(800);
ok('a token main did not issue does nothing', appPage.url() === before);

await overlay.evaluate(() => document.getElementById('action').click());
await appPage.waitForTimeout(2500);

const where = appPage.url();
console.log('  app url after the press:', where);
ok('pressing it opens the editor', where.includes('/editor'), where);
ok('carrying the session clips', /clips=\d+(,\d+)*/.test(where), where);
ok('and asking for them cut', where.includes('cut=highlights'), where);

// The offer is spent: a second press must not open anything else.
await overlay.evaluate(() => document.getElementById('action')?.click());
await appPage.waitForTimeout(800);
ok('and the offer cannot be redeemed twice', appPage.url() === where);

await app.close();
if (fail.length) {
  console.error('\nFAILED');
  process.exit(1);
}
console.log('\nOK');
