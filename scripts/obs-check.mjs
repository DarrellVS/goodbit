/**
 * What GoodBit thinks of this machine's OBS.
 *
 * Launches the built app against a throw-away profile, asks the same endpoints
 * the Recording screen asks, and prints the answers. The OBS config it reads is
 * the real one, because that is the point: a reader that only works on
 * fixtures is a reader nobody has tested.
 *
 * It never writes: `/obs/plan` describes what an apply would do and `/obs/apply`
 * is not called from here.
 *
 *   node scripts/obs-check.mjs
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const dataDir = mkdtempSync(join(tmpdir(), 'goodbit-obs-check-'));

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);

const call = (method, path, body) =>
  page.evaluate(
    ([m, p, b]) => window.goodbit.apiRequest({ method: m, path: p, body: b, query: {} }),
    [method, path, body ?? undefined],
  );

// A throw-away library, so the mismatch findings can be seen without pointing
// a test profile at the real one.
const fakeRoot = mkdtempSync(join(tmpdir(), 'goodbit-obs-library-'));
mkdirSync(join(fakeRoot, 'Battlefield 6'), { recursive: true });
await page.evaluate((root) => window.goodbit.saveSettings({ videosRoot: root }), fakeRoot);
await page.waitForTimeout(500);

const status = await call('GET', '/obs/status');
console.log('--- status ---');
console.log(JSON.stringify(status.body, null, 1));

const aliases = await call('GET', '/obs/aliases');
console.log('\n--- aliases ---');
console.log(`${aliases.body.count} games:`, aliases.body.names.slice(0, 8).join(', '));

const plan = await call('POST', '/obs/plan', {});
console.log('\n--- plan (nothing is written) ---');
console.log(JSON.stringify(plan.body, null, 1));

await app.close();
