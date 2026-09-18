/**
 * Prove that muting a track mutes it, using the real ffmpeg.
 *
 * `tests/unit/main/clipAudio.spec.ts` asserts the arguments; this asserts that
 * ffmpeg accepts them and that the file they produce is the one that was
 * asked for. Those are different questions, and the gap between them is where
 * every filter graph bug lives: a label read twice, a `-c:a:1` claiming a
 * stream that is not there, an `asplit` feeding a mix that was never mapped.
 *
 * The failure this exists for is the invisible one. A command that will not
 * run announces itself. A command that runs, writes a clip that plays, and
 * carries the muted voice chat across inside track 1 because the mix was
 * copied rather than rebuilt does not, and by then the recording it was cut
 * from is gone.
 *
 *   node scripts/clip-audio-check.mjs
 *
 * The source is built here rather than taken from the library: a real
 * recording has six tracks holding the same mix, so nothing about it can show
 * that the right one was dropped. This one has a quiet tone on track 2, a tone
 * 20 dB louder on track 3, and their sum on track 1, so every claim below is a
 * number that can be read back out of the output.
 *
 * **The loud one is the track that gets muted**, and that is the instrument
 * rather than the scenario. Built the other way round, with the muted track 20
 * dB down, the sum and the survivor differ by a tenth of a decibel: a mix
 * copied across unchanged and a mix correctly rebuilt read the same, and the
 * check that matters here passes either way. It is also true to life, since
 * the track anybody reaches for is the one that is too loud.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);

const FFMPEG = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const FFPROBE = join(
  process.cwd(),
  'node_modules',
  'ffprobe-static',
  'bin',
  'win32',
  'x64',
  'ffprobe.exe',
);

const TMP = join(process.cwd(), 'tmp', 'clip-audio-check');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const esbuild = await import('esbuild');
const BUNDLE = join(TMP, 'clipAudio.mjs');
await esbuild.build({
  entryPoints: [join(process.cwd(), 'src', 'main', 'services', 'clipAudio.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { '@shared': join(process.cwd(), 'src', 'shared') },
  outfile: BUNDLE,
  logLevel: 'warning',
  tsconfig: 'tsconfig.node.json',
});

const { describeClipAudioTracks, planTrimAudio } = await import(pathToFileURL(BUNDLE).href);

let failures = 0;

function check(label, condition, detail) {
  console.log(`${condition ? '  ok ' : '  ** '} ${label}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures += 1;
}

/** Every audio stream in a file, in the order ffmpeg would map them. */
async function audioStreams(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=index,codec_name,channels,channel_layout',
    '-of', 'json',
    file,
  ]);
  return JSON.parse(stdout).streams ?? [];
}

/**
 * How loud one track is, in dBFS.
 *
 * `volumedetect` rather than anything cleverer: the two tones are 20 dB apart
 * on purpose, so a mean is all the resolution this needs and it reads the same
 * on any machine.
 */
async function meanVolume(file, audioIndex) {
  const { stderr } = await run(FFMPEG, [
    '-v', 'info',
    '-i', file,
    '-map', `0:a:${audioIndex}`,
    '-af', 'volumedetect',
    '-f', 'null',
    '-',
  ]);
  const match = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(stderr);
  return match ? Number(match[1]) : NaN;
}

const source = join(TMP, 'source.mp4');

console.log('\nBuilding a three track source\n');
await run(FFMPEG, [
  '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=4',
  // Track 2: a 440 Hz tone, 20 dB down. Stands in for the game.
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4:sample_rate=48000',
  // Track 3: 1000 Hz at full level. Stands in for the friend chewing on voice
  // chat, which is the track somebody opens this screen to turn off.
  '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4:sample_rate=48000',
  '-filter_complex',
  '[1:a]volume=-20dB,asplit=2[game][gamemix];' +
    '[2:a]volume=0dB,asplit=2[chat][chatmix];' +
    '[gamemix][chatmix]amix=inputs=2:normalize=0[mix]',
  '-map', '0:v', '-map', '[mix]', '-map', '[game]', '-map', '[chat]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
  '-shortest',
  source,
]);

const streams = await audioStreams(source);
check('the source has three audio tracks', streams.length === 3, `${streams.length}`);

/* What the app would know about it, if GoodBit had written the OBS setup. */
const tracks = describeClipAudioTracks(streams, [
  { track: 1, label: 'Everything, mixed', deviceId: null, master: true },
  { track: 2, label: 'Game', deviceId: '{game}', master: false },
  { track: 3, label: 'Voice chat', deviceId: '{chat}', master: false },
]);
check('and GoodBit can name all three', tracks.map((track) => track.label).join(', ') === 'Everything, mixed, Game, Voice chat');

const sourceMix = await meanVolume(source, 0);
const sourceGame = await meanVolume(source, 1);
const sourceChat = await meanVolume(source, 2);
console.log(`  mix ${sourceMix} dB   game ${sourceGame} dB   chat ${sourceChat} dB`);
check('the two tones are 20 dB apart, as built', Math.abs(sourceChat - sourceGame - 20) < 1.5);
/*
 * The instrument, asserted before anything is measured with it.
 *
 * Every claim below rests on the sum being audibly louder than the survivor.
 * If it is not, a mix copied across unchanged and a mix rebuilt without the
 * muted track read the same number, and this script reports success for the
 * exact failure it was written to catch.
 */
check(
  'and the sum is far enough above the game to tell the two apart',
  sourceMix - sourceGame > 10,
  `${(sourceMix - sourceGame).toFixed(1)} dB of headroom`,
);

/**
 * Cut the file the way `TrimVideoAction` cuts it in `lossless` mode.
 *
 * The same arguments, in the same order, from the same planner. Only the
 * keyframe snapping and the pre-roll pass are left out, because neither of
 * them has anything to do with the sound.
 */
async function cut(label, selections) {
  const output = join(TMP, `${label}.mp4`);
  const plan = planTrimAudio(tracks, selections);
  const args = [
    '-v', 'error',
    '-ss', '0.000',
    '-i', source,
    '-t', '2.000',
    '-map', '0:v:0',
    '-c:v', 'copy',
    ...(plan.filterComplex ? ['-filter_complex', plan.filterComplex] : []),
    ...plan.args,
    '-y',
    output,
  ];

  try {
    await run(FFMPEG, args);
  } catch (error) {
    console.log(`  ** ffmpeg refused the ${label} cut`);
    console.log(`     ${args.join(' ')}`);
    console.log(`     ${String(error.stderr ?? error).trim().split('\n').slice(-3).join('\n     ')}`);
    failures += 1;
    return null;
  }

  return { output, plan };
}

console.log('\nNothing touched: every track carried across, nothing re-encoded\n');
{
  const result = await cut('untouched', []);
  if (result) {
    const out = await audioStreams(result.output);
    check('all three tracks survive', out.length === 3, `${out.length}`);
    check('and nothing was re-encoded', result.plan.reencoded === false);
  }
}

console.log('\nVoice chat muted: the mix has to be rebuilt without it\n');
{
  const result = await cut('muted', [{ index: 2, muted: true }]);
  if (result) {
    const out = await audioStreams(result.output);
    check('the muted track is gone', out.length === 2, `${out.length} tracks`);

    const mix = await meanVolume(result.output, 0);
    const game = await meanVolume(result.output, 1);
    console.log(`  mix ${mix} dB   game ${game} dB`);

    /*
     * The check this whole script exists for.
     *
     * Track 1 of the source is the game plus the voice chat. Copying it across
     * would leave the mix where it was, within a fraction of a dB, and the
     * clip would play perfectly with the muted voice chat still in it. Rebuilt
     * from what survived, it is the game alone.
     */
    check(
      'the mix is now the game alone, not the old sum',
      Math.abs(mix - game) < 0.5,
      `mix ${mix} against game ${game}`,
    );
    check(
      'which is not what the source mix was',
      Math.abs(mix - sourceMix) > 10,
      `${Math.abs(mix - sourceMix).toFixed(1)} dB quieter than the sum`,
    );
  }
}

console.log('\nVoice chat turned down to a quarter rather than off\n');
{
  // A quarter of the recorded level, which is 12 dB down, which is what the
  // measurement below reads. The selection is a multiplier because that is what
  // the app means by volume everywhere else, including the fader beside this
  // one on the editor timeline.
  const result = await cut('quieter', [{ index: 2, volume: 0.25 }]);
  if (result) {
    const out = await audioStreams(result.output);
    check('every track is still there', out.length === 3, `${out.length} tracks`);

    const chat = await meanVolume(result.output, 2);
    console.log(`  chat ${chat} dB, was ${sourceChat} dB`);
    check('and the level moved by what was asked for', Math.abs(chat - sourceChat + 12) < 1);
  }
}

console.log('\nOnly the mix turned down: the parts stay as recorded\n');
{
  // Half, which is 6 dB down.
  const result = await cut('master-only', [{ index: 0, volume: 0.5 }]);
  if (result) {
    const mix = await meanVolume(result.output, 0);
    const game = await meanVolume(result.output, 1);
    check('the mix moved by the six decibels that is', Math.abs(mix - sourceMix + 6) < 1, `${mix} dB`);
    // Copied rather than re-encoded, which is the point of not rebuilding a
    // mix that nothing underneath has changed.
    check('and the game track did not', Math.abs(game - sourceGame) < 0.2, `${game} dB`);
  }
}

console.log('\nEverything muted\n');
{
  const result = await cut('silent', [
    { index: 1, muted: true },
    { index: 2, muted: true },
  ]);
  if (result) {
    const out = await audioStreams(result.output);
    // Not a mix of nothing, and not the old mix either: no sound at all, which
    // is what was asked for and is a shape every player understands.
    check('the clip comes out with no audio at all', out.length === 0, `${out.length} tracks`);
  }
}

rmSync(TMP, { recursive: true, force: true });

console.log(`\n${failures === 0 ? 'All good.' : `${failures} check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
