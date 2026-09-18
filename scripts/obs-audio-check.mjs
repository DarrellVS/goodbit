/**
 * What the setup writes into OBS when several sources are recorded.
 *
 * `scripts/obs-apply-check.mjs` drives the whole apply through the running app
 * and is the right bench for most of this, with one problem for this feature:
 * it refuses to write while OBS is running, and OBS is running on any machine
 * that has GoodBit set up, which is every machine worth checking this on.
 * Nothing is written to a real OBS here either, so the guard is protecting a
 * throw-away directory from a program that is not reading it.
 *
 * So this bundles the real `applyObsSetup` with esbuild, the way
 * `migration-check.mjs` bundles `initDatabase`, and runs it against an empty
 * `GOODBIT_OBS_DIR`. The bench and the app cannot drift into two
 * implementations, which matters here more than most places: a preview that
 * says "voice chat is on track 4" while the collection puts it on track 3 is
 * wrong in the one way nobody can check after the fact.
 *
 *   node scripts/obs-audio-check.mjs
 *
 * It asserts, rather than printing and leaving it to the reader:
 *
 *   1. `RecTracks` in the profile names exactly the tracks the plan uses,
 *   2. every audio source is in the mix, so a clip still plays anywhere,
 *   3. no two sources share an isolated track,
 *   4. the capture sources stay out of the isolated tracks,
 *   5. one device writes exactly what it wrote before any of this existed.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/*
 * Inside the project, not in the system temp folder.
 *
 * The bundle leaves its node_modules imports external, so it has to sit
 * somewhere Node can resolve them from. `migration-check.mjs` puts its own
 * bundle under `tmp/` for the same reason.
 */
const TMP = join(process.cwd(), 'tmp', 'obs-audio-check');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const BUNDLE = join(TMP, 'setup.mjs');

const shim = join(TMP, 'electron-shim.mjs');
writeFileSync(
  shim,
  [
    'export const app = {',
    "  getPath: () => process.env.GOODBIT_USER_DATA ?? '.',",
    "  getVersion: () => '0.0.0-obs-audio-check',",
    "  getName: () => 'GoodBit',",
    '};',
    // `displays.ts` reaches for this to size the canvas. Nothing here asks for
    // a display, so it only has to exist.
    'export const screen = { getAllDisplays: () => [], getPrimaryDisplay: () => null };',
    'export default { app, screen };',
    '',
  ].join('\n'),
  'utf-8',
);

/*
 * Absolute, because the entry file is written two folders down under `tmp/`.
 *
 * A relative specifier would be resolved from there rather than from the
 * project root, and the depth is not something worth counting by hand.
 */
const fromProject = (...parts) => join(process.cwd(), ...parts).split('\\').join('/');

const entry = join(TMP, 'entry.ts');
writeFileSync(
  entry,
  [
    `export { applyObsSetup, planObsSetup } from '${fromProject('src', 'main', 'services', 'obs', 'setup.ts')}';`,
    `export { planAudioTracks } from '${fromProject('src', 'shared', 'constants', 'obsAudioTracks.ts')}';`,
    '',
  ].join('\n'),
  'utf-8',
);

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { electron: shim, '@shared': join(process.cwd(), 'src', 'shared') },
  outfile: BUNDLE,
  logLevel: 'warning',
  /*
   * Named, for the reason `migration-check.mjs` records at length: the root
   * `tsconfig.json` is references-only, so esbuild walking up from the entry
   * finds no `experimentalDecorators` and emits `@Entity() class {}` verbatim,
   * which is not JavaScript. Nothing here touches an entity, but the import
   * graph reaches one.
   */
  tsconfig: 'tsconfig.node.json',
});

const dataDir = join(TMP, 'userdata');
mkdirSync(dataDir, { recursive: true });
process.env.GOODBIT_USER_DATA = dataDir;

let failures = 0;

function check(label, condition, detail) {
  console.log(`${condition ? '  ok ' : '  ** '} ${label}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures += 1;
}

/** An endpoint the way `audioDevices()` hands one over. */
function device(name, flow = 'output', isDefault = false) {
  return { id: `{${name}}`, name, description: 'Elgato Virtual Audio', isDefault, flow };
}

function iniValue(source, section, key) {
  let inSection = false;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSection = trimmed.slice(1, -1) === section;
      continue;
    }
    if (!inSection) continue;
    const at = trimmed.indexOf('=');
    if (at > 0 && trimmed.slice(0, at).trim() === key) return trimmed.slice(at + 1).trim();
  }
  return null;
}

async function run(label, audio, multiTrackAudio) {
  const obsDir = join(TMP, `obs-${label}`);
  mkdirSync(join(obsDir, 'basic', 'profiles'), { recursive: true });
  mkdirSync(join(obsDir, 'basic', 'scenes'), { recursive: true });
  process.env.GOODBIT_OBS_DIR = obsDir;

  const library = join(TMP, `library-${label}`);
  mkdirSync(library, { recursive: true });

  // Imported fresh each time: the module reads `GOODBIT_OBS_DIR` through
  // `paths.ts`, and a cached module would answer with the first run's folder.
  const { applyObsSetup, planAudioTracks } = await import(`${pathToFileURL(BUNDLE).href}?run=${label}`);

  applyObsSetup(
    {
      videosRoot: library,
      createProfile: true,
      enableReplayBuffer: true,
      replayBufferSeconds: 30,
      bindHotkey: true,
      hotkey: 'OBS_KEY_F8',
      createScene: true,
      display: null,
      encoder: null,
      audio,
      multiTrackAudio,
      captureDesktop: false,
    },
    { version: '0.0.0-obs-audio-check' },
  );

  const profile = readFileSync(join(obsDir, 'basic', 'profiles', 'GoodBit', 'basic.ini'), 'utf-8');
  const collection = JSON.parse(
    readFileSync(join(obsDir, 'basic', 'scenes', 'GoodBit.json'), 'utf-8'),
  );
  const manifest = JSON.parse(readFileSync(join(dataDir, 'obs-setup.json'), 'utf-8'));

  return {
    recTracks: Number(iniValue(profile, 'SimpleOutput', 'RecTracks')),
    sources: collection.sources.filter((source) => source.id !== 'scene'),
    plan: planAudioTracks(audio, multiTrackAudio),
    manifest,
  };
}

console.log('\nFour devices, each on its own track\n');
{
  const audio = [
    device('Speakers', 'output', true),
    device('Game'),
    device('Voice chat'),
    device('Microphone', 'input'),
  ];
  const { recTracks, sources, plan, manifest } = await run('many', audio, true);

  // Track 1 plus one per device: 0b11111.
  check('RecTracks names five tracks', recTracks === 0b11111, `= ${recTracks}`);
  check('RecTracks matches the plan the preview drew', recTracks === plan.recTracks);

  const wasapi = sources.filter((source) => source.id.startsWith('wasapi_'));
  check('every device became a source', wasapi.length === audio.length);
  check(
    'every source is in the mix',
    wasapi.every((source) => (source.mixers & 1) === 1),
    wasapi.map((source) => source.mixers).join(', '),
  );

  const isolated = wasapi.map((source) => source.mixers & ~1);
  check('no two sources share a track', new Set(isolated).size === isolated.length);
  check(
    'the tracks are 2, 3, 4, 5 in order',
    isolated.every((mask, index) => mask === 1 << (index + 1)),
  );

  const capture = sources.filter((source) => !source.id.startsWith('wasapi_'));
  check(
    'game capture stays out of the isolated tracks',
    capture.every((source) => source.mixers === 1),
    capture.map((source) => `${source.name}=${source.mixers}`).join(', '),
  );

  check(
    'the manifest records what each track holds',
    manifest.audioTracks?.length === 5 &&
      manifest.audioTracks[0].master === true &&
      manifest.audioTracks[2].label === 'Game (Elgato Virtual Audio)',
    manifest.audioTracks?.map((track) => `${track.track}:${track.label}`).join('  '),
  );
}

console.log('\nOne device, which is the shape this wrote before the feature\n');
{
  const { recTracks, sources } = await run('one', [device('Speakers', 'output', true)], true);

  check('RecTracks is track 1 alone', recTracks === 1, `= ${recTracks}`);
  check(
    'the source feeds every track, as it always did',
    sources.every((source) => source.mixers === 255),
  );
}

console.log('\nSeven devices, which is one more than OBS has tracks\n');
{
  const audio = Array.from({ length: 7 }, (_unused, index) => device(`Device ${index}`));
  const { recTracks, sources } = await run('overflow', audio, true);

  check('RecTracks names all six tracks', recTracks === 0b111111, `= ${recTracks}`);
  const wasapi = sources.filter((source) => source.id.startsWith('wasapi_'));
  check(
    'the last two reach the mix and nothing else',
    wasapi.slice(5).every((source) => source.mixers === 1),
  );
  check(
    'and are not silently dropped',
    wasapi.length === 7,
    `${wasapi.length} sources`,
  );
}

console.log('\nRefused, which has to write the old shape rather than nothing\n');
{
  const { recTracks, sources } = await run('refused', [device('Game'), device('Voice chat')], false);

  check('RecTracks comes back down to one', recTracks === 1, `= ${recTracks}`);
  check(
    'and the sources go back to feeding everything',
    sources.every((source) => source.mixers === 255),
  );
}

rmSync(TMP, { recursive: true, force: true });

console.log(`\n${failures === 0 ? 'All good.' : `${failures} check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
