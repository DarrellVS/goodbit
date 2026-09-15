/**
 * Every page of the setup wizard.
 *
 * Twice, because the pages depend on the machine: without OBS the wizard opens
 * on its install step and refuses to go on until that is done, and with OBS it
 * asks the four questions. A stand-in OBS directory gives the second pass
 * without needing one installed.
 *
 * Nothing is applied: both runs stop at the preview, which is the last page
 * before anything is written.
 *
 *   node scripts/obs-wizard-shots.mjs [outDir]
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const out = process.argv[2] ?? join(tmpdir(), 'goodbit-wizard');
mkdirSync(out, { recursive: true });

const PROFILE = `[General]
Name=Untitled

[Output]
Mode=Simple

[SimpleOutput]
FilePath=C:\\\\Users\\\\somebody\\\\Videos
RecRB=false
`;

/** An OBS that exists but has never been set up, which is the common case. */
function standInObs() {
  const dir = mkdtempSync(join(tmpdir(), 'goodbit-wizard-obs-'));
  mkdirSync(join(dir, 'basic', 'profiles', 'Untitled'), { recursive: true });
  mkdirSync(join(dir, 'basic', 'scenes'), { recursive: true });
  writeFileSync(join(dir, 'basic', 'profiles', 'Untitled', 'basic.ini'), PROFILE);
  writeFileSync(
    join(dir, 'user.ini'),
    '[Basic]\nProfile=Untitled\nProfileDir=Untitled\nSceneCollection=Untitled\nSceneCollectionFile=Untitled\n',
  );
  return dir;
}

async function walk(prefix, { withObs, route }) {
  const data = mkdtempSync(join(tmpdir(), 'goodbit-wizard-data-'));
  const library = mkdtempSync(join(tmpdir(), 'goodbit-wizard-lib-'));
  mkdirSync(join(library, 'Battlefield 6'), { recursive: true });
  writeFileSync(
    join(data, 'settings.json'),
    JSON.stringify({ videosRoot: library, migratedFromWebApp: true, startAtLogin: false }),
  );

  const env = { ...process.env, GOODBIT_USER_DATA: data };
  if (withObs) env.GOODBIT_OBS_DIR = standInObs();

  const app = await electron.launch({ args: ['out/main/index.js'], env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => localStorage.setItem('goodbit-theme', 'dark'));
  await page.reload();
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    window.location.hash = '#/settings?section=recording';
  });
  await page.waitForTimeout(1500);

  await page
    .getByRole('button', { name: /Install OBS and set it up|Set up OBS for me|Change the setup/ })
    .first()
    .click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: join(out, `${prefix}-0-route.png`) });
  console.log(`${prefix}: route`);

  const dialog = page.locator('[data-testid="obs-setup"]');
  await dialog.getByRole('button', { name: route === 'quick' ? /Quick setup/ : /Step by step/ }).click();
  await page.waitForTimeout(1800);

  for (let index = 1; index < 9; index++) {
    const title = await dialog.locator('h2').first().innerText();
    const name = title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    await page.screenshot({ path: join(out, `${prefix}-${index}-${name}.png`) });
    console.log(`${prefix}: ${title}`);

    if (/what changes/i.test(title)) break;

    const forward = dialog.getByRole('button', { name: /^(Continue|OBS is installed, continue)$/ });
    if (!(await forward.count())) break;
    // Disabled means the page is a gate, which is the answer this pass wanted.
    if (await forward.last().isDisabled()) {
      console.log(`${prefix}: stopped, "${title}" will not let you past`);
      break;
    }
    await forward.last().click();
    await page.waitForTimeout(1300);
  }

  await app.close();
}

await walk('no-obs', { withObs: false, route: 'full' });
await walk('full', { withObs: true, route: 'full' });
await walk('quick', { withObs: true, route: 'quick' });
