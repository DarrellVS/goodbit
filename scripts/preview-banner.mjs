/**
 * Photograph a piece of UI that only appears in a state hard to reach by hand.
 *
 * The update banner shows while an update is downloading or ready, which is
 * not a state a test machine can conjure — so this launches the built app
 * against a throw-away profile and pushes the state straight into the window
 * over the same channel the main process uses.
 *
 *   node scripts/preview-banner.mjs            # ready
 *   node scripts/preview-banner.mjs downloading
 *
 * Writes tmp/banner.png. Nothing here ships.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const mode = process.argv[2] === 'downloading' ? 'downloading' : 'ready';
const base = mkdtempSync(join(tmpdir(), 'goodbit-banner-'));
const dataDir = join(base, 'data');
const videosRoot = join(base, 'videos');
mkdirSync(dataDir, { recursive: true });
mkdirSync(videosRoot, { recursive: true });
writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify({
    videosRoot,
    audioRoot: join(base, 'music'),
    publisherBaseUrl: '',
    startAtLogin: false,
    keepRunningInTray: false,
    migratedFromWebApp: false,
  }),
);
mkdirSync(join(base, 'music'), { recursive: true });

const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: process.cwd(),
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);

// Same channel the updater publishes on, so the renderer cannot tell the
// difference between this and a real download finishing.
await app.evaluate(({ BrowserWindow }, state) => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updater:state', state);
}, mode === 'ready' ? { status: 'ready', version: '1.2.2' } : { status: 'downloading', percent: 63 });

await page.waitForTimeout(900);
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
await page.screenshot({ path: join(process.cwd(), 'tmp', `banner-${mode}.png`) });

// And prove it can actually be clicked, which is the bug this was written for.
if (mode === 'ready') {
  const button = page.getByRole('button', { name: 'Restart now' });
  const box = await button.boundingBox();
  console.log('button box:', box);
  console.log('clears the 40px title bar:', box && box.y > 40);
}

console.log(`wrote tmp/banner-${mode}.png`);
await app.close();
rmSync(base, { recursive: true, force: true });
