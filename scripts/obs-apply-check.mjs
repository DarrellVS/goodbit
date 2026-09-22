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

/*
 * Nothing here works while OBS is open, and it used to pretend otherwise.
 *
 * `ApplyObsSetupAction` refuses outright when OBS is running, which is right:
 * OBS rewrites its settings file from memory when it closes, so anything
 * written underneath it is thrown away. But this bench went on to print
 * `MISSING` for every file and a list of failures, which reads like the setup
 * is broken rather than like the bench was never allowed to run. On a machine
 * where GoodBit starts OBS at login, which is the setup this app writes, that
 * is the normal state.
 *
 * The redirect does not help: `GOODBIT_OBS_DIR` moves the files, and the
 * running check looks at the real process, which is the one that would
 * overwrite them.
 */
if ((await call('GET', '/obs/status')).body?.running) {
  console.error('OBS is running. Close it and run this again.');
  console.error('Nothing can be written to an OBS profile while OBS is open, so every');
  console.error('check below would read back a file that was never written.');
  await app.close();
  process.exit(2);
}

/*
 * Several devices, because one is the case that changes nothing.
 *
 * The routing is only interesting with something to separate: one device is
 * one track whatever anybody asks for, so applying the default here would
 * write `RecTracks=1` and prove nothing about the feature. Real endpoints off
 * this machine, so the ids are ones OBS would accept.
 */
const devices = (await call('GET', '/obs/audio-devices')).body ?? [];
const chosen = devices.slice(0, 4).map((device) => device.id);
console.log('--- devices ---');
console.log(chosen.join(', ') || 'none on this machine');

const applied = await call('POST', '/obs/apply', { audioDeviceIds: chosen });
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
  /*
   * The two numbers the multi-track routing is made of.
   *
   * `mixers` is which tracks a source feeds and `RecTracks` in the profile
   * above is which tracks are written. Either one alone records six copies of
   * one mix or a file with five silent streams, and neither failure shows up
   * anywhere except in a clip nobody can fix afterwards.
   */
  console.log('--- mixers ---');
  for (const source of parsed.sources) {
    if (source.id === 'scene') continue;
    console.log(`${String(source.mixers).padStart(3)}  0b${source.mixers.toString(2).padStart(6, '0')}  ${source.name}`);
  }
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
    {
      ready: status.body.ready,
      multiTrackAudio: status.body.multiTrackAudio,
      audioTracks: status.body.audioTracks.map((track) => `${track.track}: ${track.label}`),
      findings: status.body.findings.map((f) => `${f.level}: ${f.title}`),
    },
    null,
    1,
  ),
);

/*
 * The recording quality, both values, read back out of the profile.
 *
 * `[SimpleOutput] RecQuality` is the one key here whose effect cannot be
 * undone after the fact: it decides what lands in the file, so a mapping that
 * writes the wrong token degrades every recording made afterwards and no
 * amount of re-encoding brings the picture back. It is also the key where the
 * two values GoodBit deliberately does not offer would be actively harmful,
 * `Lossless` turning the replay buffer off being the one that would stop the
 * app working at all, so this checks what was not written as well as what was.
 */
console.log('\n--- recording quality ---');
const recQuality = () => {
  const text = existsSync(profile) ? readFileSync(profile, 'utf-8') : '';
  return text.match(/^RecQuality=(.*)$/m)?.[1]?.trim() ?? null;
};

let qualityFailures = 0;
for (const [choice, expected] of [
  ['balanced', 'Small'],
  ['indistinguishable', 'HQ'],
  // Sent as nothing, which is what every caller that is not asking the
  // question sends. It must leave the setting alone rather than reset it.
  [undefined, 'HQ'],
]) {
  await call('POST', '/obs/apply', {
    audioDeviceIds: chosen,
    ...(choice === undefined ? {} : { recordingQuality: choice }),
  });
  const landed = recQuality();
  const after = (await call('GET', '/obs/status')).body.recordingQuality;
  const good = landed === expected && after === expected;
  if (!good) qualityFailures++;
  console.log(
    `${good ? 'ok  ' : 'FAIL'}  ${String(choice ?? '(not asked)').padEnd(18)} wrote ${landed}, status says ${after}, wanted ${expected}`,
  );
}

const neverWritten = ['Lossless', 'Stream'];
const wrote = recQuality();
const safe = !neverWritten.includes(wrote);
if (!safe) qualityFailures++;
console.log(
  `${safe ? 'ok  ' : 'FAIL'}  never writes ${neverWritten.join(' or ')}, which would turn the replay buffer off or record at a streaming bitrate`,
);

await app.close();

if (qualityFailures) {
  console.error(`\n${qualityFailures} recording quality check(s) failed`);
  process.exit(1);
}
