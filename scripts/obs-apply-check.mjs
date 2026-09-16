/**
 * Prove the setup writes what it promised, without going near a real OBS.
 *
 * `GOODBIT_OBS_DIR` redirects every path the OBS reader and writer use, the
 * same way `GOODBIT_USER_DATA` redirects the app's own folder, so this drives
 * the real apply against an empty directory and then reads back what landed.
 *
 *
 *   node scripts/obs-apply-check.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const dataDir = mkdtempSync(join(tmpdir(), 'goodbit-obs-apply-data-'));
const obsDir = mkdtempSync(join(tmpdir(), 'goodbit-obs-apply-config-'));
const library = mkdtempSync(join(tmpdir(), 'goodbit-obs-apply-library-'));

mkdirSync(join(obsDir, 'basic', 'profiles'), { recursive: true });
mkdirSync(join(obsDir, 'basic', 'scenes'), { recursive: true });
mkdirSync(join(library, 'Battlefield 6'), { recursive: true });

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, GOODBIT_USER_DATA: dataDir, GOODBIT_OBS_DIR: obsDir },
});

// Not `firstWindow()`. The clip toast is a second window, built during boot,
// and it is a `data:` URL page with no app in it.
const page =
  app.windows().find((candidate) => !candidate.url().startsWith('data:')) ??
  (await app.waitForEvent('window'));
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);

const call = (method, path, body) =>
  page.evaluate(
    ([m, p, b]) => window.goodbit.apiRequest({ method: m, path: p, body: b, query: {} }),
    [method, path, body ?? undefined],
  );

await page.evaluate((root) => window.goodbit.saveSettings({ videosRoot: root }), library);
await page.waitForTimeout(400);

const applied = await call('POST', '/obs/apply', {});
console.log('--- apply ---');
console.log(JSON.stringify(applied.body ?? applied, null, 1));

const profile = join(obsDir, 'basic', 'profiles', 'GoodBit', 'basic.ini');
console.log('\n--- basic.ini ---');
console.log(existsSync(profile) ? readFileSync(profile, 'utf-8') : 'MISSING');

const collection = join(obsDir, 'basic', 'scenes', 'GoodBit.json');
if (existsSync(collection)) {
  const parsed = JSON.parse(readFileSync(collection, 'utf-8'));
  const script = parsed.modules?.['scripts-tool']?.[0];
  console.log('--- GoodBit.json ---');
  console.log('scenes:', parsed.scene_order.map((entry) => entry.name).join(', '));
  console.log('sources:', parsed.sources.map((source) => `${source.name} (${source.id})`).join(', '));
  console.log('script:', script?.path);
  console.log('script settings:', JSON.stringify({ ...script?.settings, aliases_list: `${script?.settings?.aliases_list?.length ?? 0} aliases` }, null, 1));
  console.log('first aliases:', (script?.settings?.aliases_list ?? []).slice(0, 3).map((entry) => entry.value));
} else {
  console.log('--- GoodBit.json --- MISSING');
}

const userIni = join(obsDir, 'user.ini');
console.log('\n--- user.ini ---');
console.log(existsSync(userIni) ? readFileSync(userIni, 'utf-8').trim() : 'MISSING');

const scripts = join(dataDir, 'obs-scripts');
console.log('\n--- downloaded ---');
console.log(existsSync(scripts) ? readdirSync(scripts).join(', ') : 'nothing downloaded');

const status = await call('GET', '/obs/status');
console.log('\n--- status after ---');
console.log(
  JSON.stringify(
    { ready: status.body.ready, findings: status.body.findings.map((f) => `${f.level}: ${f.title}`) },
    null,
    1,
  ),
);

await app.close();
