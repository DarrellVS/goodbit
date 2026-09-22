import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { applyIniEdits, type IniEdit } from './ini.js';
import { INCOMING_DIR_NAME } from '../capture/incoming.js';
import { obsConfigDir, profilesDir, scenesDir } from './paths.js';
import { readObs, userConfigFile, type ObsSnapshot } from './config.js';
import type { CaptureDisplay } from './displays.js';
import type { EncoderChoice } from './encoderChoice.js';
import type { AudioDevice } from './audioDevices.js';
import { planAudioTracks, audioSourceName, describeAudioTracks } from './audioTracks.js';
import { recordingVideoSettings } from './displays.js';
import { userDataDir } from '../../settings.js';

/* The shape is agreed in `src/shared`; re-exported so callers here are unchanged. */
import type { ChangeKind, PlannedChange, ObsSetupPlan, ObsAudioTrack } from '@shared/index.js';
import { obsRecQuality, RECORDING_QUALITY_LABELS, type RecordingQuality } from '@shared/index.js';
export type { ChangeKind, PlannedChange, ObsSetupPlan, ObsAudioTrack };

/**
 * Writing the setup, one preview at a time.
 *
 * Two rules hold this together, and both come from how OBS treats its own
 * configuration:
 *
 * - **Nothing is written while OBS is running.** It parses `basic.ini` once
 *   and rewrites the whole file from memory at every save point, so an edit
 *   made underneath it is not merged, it is discarded. A profile folder
 *   created while it runs stays invisible until a restart.
 * - **Nothing the user made is edited.** The setup creates a profile and a
 *   scene collection of its own, both named GoodBit. One file outside them is
 *   touched, and it gets three keys: see `userConfigEdits`. It is backed up
 *   first and it appears in the preview like every other write.
 *
 * Everything below builds a plan first. The plan is what the dialog shows,
 * and applying it runs the same code that produced it.
 */

export const GOODBIT_PROFILE = 'GoodBit';
export const GOODBIT_COLLECTION = 'GoodBit';

export interface ObsSetupChoices {
  /** Where OBS should write, which is GoodBit's own library folder. */
  videosRoot: string;
  createProfile: boolean;
  enableReplayBuffer: boolean;
  replayBufferSeconds: number;
  bindHotkey: boolean;
  /** An `OBS_KEY_*` name. F8 unless the user picked something else. */
  hotkey: string;
  createScene: boolean;
  /**
   * The screen this setup is for.
   *
   * Decides the canvas size, and which display a Display Capture source
   * grabs. Null only on a machine with no screens Electron can see, which in
   * practice means the profile keeps OBS's defaults.
   */
  display: CaptureDisplay | null;
  /**
   * The encoder, and with it whether HDR is possible at all.
   *
   * Ten bit colour needs HEVC or AV1: H.264 NVENC cannot do it, and OBS
   * answers a profile that asks for both with "starting the output failed" and
   * nothing else. So the encoder is resolved before the colour is decided, and
   * an encoder that cannot manage 10 bit means the profile records SDR.
   */
  encoder: EncoderChoice | null;
  /**
   * The audio devices to record, in the order they should appear.
   *
   * Empty means a silent clip, which is a choice someone can make and not one
   * to make for them, so the default is the system's own output.
   */
  audio: AudioDevice[];
  /**
   * Give each of those devices a track of its own.
   *
   * On, because the alternative is a decision made at record time that cannot
   * be taken back: one stream holding the game, the voice chat and the music
   * is one stream for ever. Off writes exactly what this wrote before, which
   * is what somebody with one device gets anyway.
   */
  multiTrackAudio: boolean;
  /**
   * Capture the whole screen underneath the game capture.
   *
   * On, because a game capture on its own records nothing at all outside a
   * fullscreen game: alt-tab to a browser, press the key, and the clip is
   * black. Under it, display capture makes the same key work for anything on
   * screen, and game capture still takes over when a game is running.
   */
  captureDesktop: boolean;
  /**
   * How hard OBS compresses the recording.
   *
   * `[SimpleOutput] RecQuality`, which is the control OBS already has for
   * this. Simple output mode, deliberately: the CQP and CRF keys live in
   * Advanced mode, which takes raw encoder ids with no safety net, and the
   * whole class of "OBS refuses to start the replay buffer and blames your
   * drivers" failures lives there.
   */
  recordingQuality: RecordingQuality;
}

function profileDir(): string {
  return path.join(profilesDir(), GOODBIT_PROFILE);
}

/**
 * The keys written to OBS's own user configuration, which GoodBit does not own.
 *
 * Everything else the setup writes lives inside the GoodBit profile and the
 * GoodBit scene collection. These three are per-user rather than per-profile,
 * so there is nowhere else to put them, and each one is here for a reason
 * somebody would agree with if asked:
 *
 * - **`FirstRun`** stops OBS opening its own auto-configuration wizard, which
 *   picks a resolution, a frame rate and an encoder: the settings this setup
 *   has just chosen deliberately. Two wizards disagreeing about one profile is
 *   worse than either.
 * - **`SysTrayEnabled`** and **`SysTrayMinimizeToTray`** put OBS in the tray
 *   instead of the taskbar. GoodBit starts OBS with `--startreplaybuffer` and
 *   then nothing about it is meant to be looked at again; a window in the
 *   taskbar for a program you never interact with is clutter, and closing it
 *   by accident is how the replay buffer stops without anyone noticing.
 *   `SysTrayMinimizeToTray` is the checkbox, and it does nothing without
 *   `SysTrayEnabled`, which is why both are written rather than the one.
 *
 * **`SysTrayWhenStarted` is deliberately not here.** That one starts OBS
 * already hidden, and a program that gives no sign of having launched is a
 * different promise from one that tidies itself away. If OBS fails to start
 * the buffer, being able to see the window is how anyone finds out.
 *
 * Returned as data rather than written inline so the preview and the write use
 * the same list. A key that gets written without appearing in the preview is
 * exactly the thing the preview exists to prevent.
 */
export function userConfigEdits(): IniEdit[] {
  return [
    { section: 'General', key: 'FirstRun', value: 'true' },
    { section: 'BasicWindow', key: 'SysTrayEnabled', value: 'true' },
    { section: 'BasicWindow', key: 'SysTrayMinimizeToTray', value: 'true' },
  ];
}

/**
 * Does GoodBit's collection still load a script?
 *
 * Read rather than assumed. The collection is only rewritten when the scene is
 * being rebuilt, so somebody who applies the setup without that step keeps a
 * script GoodBit no longer wants: naming a clip is its own job now, and two
 * things moving the same file is a race.
 */
export function collectionHasScript(): boolean {
  try {
    const raw = JSON.parse(readFileSync(collectionFile(), 'utf-8')) as {
      modules?: Record<string, unknown>;
    };
    const tool = raw.modules?.['scripts-tool'];
    return Array.isArray(tool) && tool.length > 0;
  } catch {
    return false;
  }
}

/**
 * Take the script out, and leave the rest of the collection alone.
 *
 * A targeted edit rather than a rebuild. The collection carries the user's
 * sources, their audio mixers and their scene layout, and none of that is ours
 * to regenerate because one module is being removed.
 *
 * It has to happen whether or not the scene is being rebuilt. OBS writes the
 * replay into GoodBit's staging folder, and a script still loaded there moves
 * it out again before GoodBit has seen it. The race is invisible and the script
 * usually wins.
 */
function removeScriptFromCollection(): boolean {
  const file = collectionFile();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { modules?: Record<string, unknown> };
    if (!raw.modules || !('scripts-tool' in raw.modules)) return false;

    delete raw.modules['scripts-tool'];
    writeFileSync(file, JSON.stringify(raw, null, 4), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function collectionFile(): string {
  return path.join(scenesDir(), `${GOODBIT_COLLECTION}.json`);
}

/** OBS escapes backslashes in ini values. */
function iniPath(value: string): string {
  return value.replace(/\\/g, '\\\\');
}

/**
 * The profile's keys.
 *
 * Simple mode on purpose. Its encoder values are aliases that OBS resolves at
 * runtime and repairs when they are wrong; Advanced mode takes raw encoder ids
 * with no safety net, and a wrong one there fails at the moment the hotkey is
 * pressed with nothing pointing back at GoodBit. Nothing here sets an encoder
 * at all, but the mode decides which half of the file the buffer keys live in,
 * and the forgiving half is the one to be in.
 */
export function profileEdits(choices: ObsSetupChoices): IniEdit[] {
  const edits: IniEdit[] = [
    { section: 'General', key: 'Name', value: GOODBIT_PROFILE },
    { section: 'Output', key: 'Mode', value: 'Simple' },
    /*
     * Not the videos root itself: a staging folder GoodBit owns.
     *
     * OBS names a recording after the clock and nothing else, so every clip
     * would land at the top level, where the folder name *is* the game name
     * and there is no folder. GoodBit takes it from here: it watches this
     * folder, works out which game was in front while the clip was recording,
     * and renames the file into place on the same volume.
     */
    {
      section: 'SimpleOutput',
      key: 'FilePath',
      value: iniPath(path.join(choices.videosRoot, INCOMING_DIR_NAME)),
    },
    // GoodBit reads mp4, mov and mkv, see `@shared/constants/videoFiles.ts`.
    // Pinned rather than inherited because this OBS defaults to whatever its
    // version decided, which changed to hybrid_mp4 in 30.2, and mp4 is the one
    // every browser and Discord take without a re-encode.
    { section: 'SimpleOutput', key: 'RecFormat2', value: 'mp4' },
    // So a file sitting in staging is recognisable as ours to anyone who opens
    // the folder, rather than looking like OBS lost track of it.
    { section: 'SimpleOutput', key: 'RecRBPrefix', value: 'GoodBit' },
    /*
     * Which tracks are written to the file, as a bitmask.
     *
     * Written always, not only when there is more than one device. Absent, OBS
     * records track 1 alone, and a profile that had six tracks and now has one
     * device would go on writing six copies of the same mix: the key has to be
     * able to come back down as well as go up.
     *
     * See `services/obs/audioTracks.ts` for how the number is arrived at, and
     * for the two checks that say Simple output mode can do this at all.
     */
    {
      section: 'SimpleOutput',
      key: 'RecTracks',
      value: String(planAudioTracks(choices.audio, choices.multiTrackAudio).recTracks),
    },
  ];

  if (choices.encoder) {
    edits.push(
      { section: 'SimpleOutput', key: 'RecEncoder', value: choices.encoder.encoder },
      // Never OBS's own default for a new profile, which is `Stream`: that
      // records at the streaming bitrate and looks like it, and a clip you are
      // going to trim and share deserves better than a twitch preset. The two
      // values this can be, and the two of OBS's four that are not offered at
      // all, are in `shared/constants/obsRecordingQuality.ts`.
      {
        section: 'SimpleOutput',
        key: 'RecQuality',
        value: obsRecQuality(choices.recordingQuality),
      },
    );
  }

  if (choices.enableReplayBuffer) {
    edits.push(
      { section: 'SimpleOutput', key: 'RecRB', value: 'true' },
      { section: 'SimpleOutput', key: 'RecRBTime', value: String(choices.replayBufferSeconds) },
      { section: 'SimpleOutput', key: 'RecRBSize', value: '512' },
    );
  }

  /*
   * The canvas, from the screen this is for.
   *
   * Written because this profile is new. OBS fills a profile it creates with
   * 1920x1080 at 30, scaled down to 1280x720, and on a 3440x1440 screen that
   * is a letterboxed, half resolution, half frame rate recording of an
   * ultrawide game. Leaving the keys out is only the right call for a profile
   * somebody else made.
   */
  if (choices.display) {
    const video = recordingVideoSettings(choices.display);
    // HDR is only on the table if something here can encode 10 bit.
    const hdr = video.hdr && choices.encoder?.tenBit === true;
    edits.push(
      { section: 'Video', key: 'BaseCX', value: String(video.baseWidth) },
      { section: 'Video', key: 'BaseCY', value: String(video.baseHeight) },
      // No downscale. A replay is the source for a trim, and scaling twice,
      // once here and once on export, is one time too many.
      { section: 'Video', key: 'OutputCX', value: String(video.baseWidth) },
      { section: 'Video', key: 'OutputCY', value: String(video.baseHeight) },
      { section: 'Video', key: 'ScaleType', value: 'bicubic' },
      { section: 'Video', key: 'FPSType', value: '0' },
      { section: 'Video', key: 'FPSCommon', value: String(video.fps) },
    );

    /*
     * Colour, which is the one colour decision this makes.
     *
     * An HDR display recorded as Rec. 709 is tone mapped and quantised to 8
     * bits by OBS at capture time, so the highlights are clipped in the file
     * and no filter afterwards can bring them back. It does not fail loudly:
     * it just looks flat and washed out next to a profile that got it right.
     *
     * Ten bit PQ is also what GoodBit expects everywhere else. `TONEMAP_FILTER`
     * is applied wherever a frame is decoded, so a PQ recording comes out
     * looking like the game did, in an export, a thumbnail or a frame strip.
     */
    if (hdr) {
      edits.push(
        { section: 'Video', key: 'ColorFormat', value: 'P010' },
        { section: 'Video', key: 'ColorSpace', value: '2100PQ' },
        { section: 'Video', key: 'ColorRange', value: 'Full' },
        { section: 'Video', key: 'SdrWhiteLevel', value: '300' },
        { section: 'Video', key: 'HdrNominalPeakLevel', value: '1000' },
      );
    } else {
      // Written rather than left out, because this profile may have been
      // created while a display was in HDR mode and edited after it was not.
      edits.push(
        { section: 'Video', key: 'ColorFormat', value: 'NV12' },
        { section: 'Video', key: 'ColorSpace', value: '709' },
        { section: 'Video', key: 'ColorRange', value: 'Partial' },
      );
    }
  }

  if (choices.bindHotkey) {
    /*
     * Keyed by the output object, not by the frontend.
     *
     * There are two shapes for this, and the documentation points at the other
     * one: `OBSBasic.SaveReplayBuffer` with a `bindings` array, which OBS is
     * supposed to migrate a legacy profile into. Written that way, on OBS 31,
     * the binding does not appear in Settings, Hotkeys at all and nothing
     * happens when the key is pressed.
     *
     * What works, and what the hotkey list actually shows under Replay Buffer,
     * Save Replay, is the output's own hotkey. Every working profile on this
     * machine uses it, and none of them had been migrated to the other form.
     * So: the shape that binds, rather than the shape that reads better.
     */
    edits.push({
      section: 'Hotkeys',
      key: 'ReplayBuffer',
      value: JSON.stringify({ 'ReplayBuffer.Save': [{ key: choices.hotkey }] }),
    });
  }

  return edits;
}

interface SceneSource {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  mixers?: number;
}

/**
 * A scene collection with one scene in it.
 *
 * Two capture sources, in this order, because one is not enough. Game capture
 * sits on top in `any_fullscreen` mode, which needs no monitor, no window
 * title and no per-game setup. Display capture sits underneath for everything
 * that is not a fullscreen game: a browser, a launcher, a windowed game.
 *
 * Desktop audio comes along because a clip with no sound is not a clip.
 */
function buildCollection(
  options: {
    display: CaptureDisplay | null;
    captureDesktop: boolean;
    tenBit: boolean;
    audio: AudioDevice[];
    multiTrackAudio: boolean;
  },
): string {
  /*
   * Where each source's sound lands, worked out once.
   *
   * `mixers` used to be 255 on everything, which reads as generous and is the
   * opposite: every source feeding every track means every track holds the
   * same mix, so the six streams in a recording were six copies of one
   * decision. Track 1 stays the full mix so nothing that reads one track
   * changes; the rest carry one source each.
   */
  const audioPlan = planAudioTracks(options.audio, options.multiTrackAudio);
  /*
   * `rgb10a2_space` is the other half of the HDR setting, and it lives here
   * rather than in the profile.
   *
   * The profile says what the canvas is; this says how the game's frames are
   * interpreted on the way in. Setting one without the other is the classic
   * way to end up with a recording that is technically HDR and looks wrong,
   * which is why both are written together or not at all.
   */
  const hdr = options.display?.hdrEnabled === true && options.tenBit;

  const sources: SceneSource[] = [
    {
      id: 'game_capture',
      name: 'Game',
      settings: {
        capture_mode: 'any_fullscreen',
        capture_cursor: true,
        rgb10a2_space: hdr ? '2100pq' : 'srgb',
      },
      // Game capture can carry sound of its own, and under a multi-track plan
      // it belongs in the mix and nowhere else: feeding it into every track
      // would put game audio on the voice chat track, which is the one thing
      // being separated here.
      mixers: audioPlan.captureMixers,
    },
  ];

  /*
   * The screen, underneath the game.
   *
   * Game capture hooks a fullscreen game and records nothing else, so on its
   * own the hotkey produces a black clip the moment you are in a browser, a
   * launcher, or a game running windowed. Display capture under it covers all
   * of that, and game capture still wins whenever it has something to hook.
   *
   * Only added when the monitor could be identified: OBS matches this id
   * exactly, and a source with the wrong one does not fail, it renders black
   * for ever.
   */
  if (options.captureDesktop && options.display?.monitorId) {
    sources.push({
      id: 'monitor_capture',
      name: `Screen (${options.display.label})`,
      settings: {
        monitor_id: options.display.monitorId,
        capture_cursor: true,
        // Explicitly not forcing SDR: that option makes OBS tone map the
        // screen on the way in, which is the damage this is avoiding.
        force_sdr: false,
      },
      mixers: audioPlan.captureMixers,
    });
  }

  /*
   * One source per device, named after the device.
   *
   * OBS mixes these into the recording as separate tracks in its own mixer, so
   * a game on one output and voice chat on another arrive as two faders rather
   * than one blob, which is what anyone who has set this up by hand already
   * has. A microphone is `wasapi_input_capture`; everything else is the output
   * flavour.
   */
  options.audio.forEach((device, index) => {
    sources.push({
      id: device.flow === 'input' ? 'wasapi_input_capture' : 'wasapi_output_capture',
      // `Speakers` three times is what the OBS mixer would otherwise show. The
      // name comes from `audioSourceName` rather than from here, so the name in
      // the mixer and the name on the track are one string: two spellings of
      // one device is how somebody mutes the wrong track.
      name: audioSourceName(device),
      settings: { device_id: device.id },
      mixers: audioPlan.mixers[index],
    });
  });

  const built = sources.map((source) => ({
    prev_ver: 520159234,
    name: source.name,
    uuid: randomUUID(),
    id: source.id,
    versioned_id: source.id,
    settings: source.settings,
    mixers: source.mixers ?? 0,
    sync: 0,
    flags: 0,
    volume: 1.0,
    balance: 0.5,
    enabled: true,
    muted: false,
    'push-to-mute': false,
    'push-to-mute-delay': 0,
    'push-to-talk': false,
    'push-to-talk-delay': 0,
    hotkeys: {},
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    monitoring_type: 0,
    private_settings: {},
  }));

  const items = built.map((source, index) => ({
    name: source.name,
    source_uuid: source.uuid,
    visible: true,
    locked: false,
    rot: 0.0,
    align: 5,
    bounds_type: 0,
    bounds_align: 0,
    bounds_crop: false,
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    id: index + 1,
    group_item_backup: false,
    pos: { x: 0.0, y: 0.0 },
    scale: { x: 1.0, y: 1.0 },
    bounds: { x: 0.0, y: 0.0 },
    scale_filter: 'disable',
    blend_method: 'default',
    blend_type: 'normal',
    show_transition: { duration: 0 },
    hide_transition: { duration: 0 },
    private_settings: {},
  }));

  const scene = {
    prev_ver: 520159234,
    name: 'GoodBit',
    uuid: randomUUID(),
    id: 'scene',
    versioned_id: 'scene',
    settings: { id_counter: items.length + 1, custom_size: false, items },
    mixers: 0,
    sync: 0,
    flags: 0,
    volume: 1.0,
    balance: 0.5,
    enabled: true,
    muted: false,
    'push-to-mute': false,
    'push-to-mute-delay': 0,
    'push-to-talk': false,
    'push-to-talk-delay': 0,
    hotkeys: {},
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    monitoring_type: 0,
    private_settings: {},
  };

  const collection: Record<string, unknown> = {
    name: GOODBIT_COLLECTION,
    current_scene: 'GoodBit',
    current_program_scene: 'GoodBit',
    scene_order: [{ name: 'GoodBit' }],
    sources: [...built, scene],
    groups: [],
    quick_transitions: [],
    transitions: [],
    saved_projectors: [],
    current_transition: 'Fade',
    transition_duration: 300,
    preview_locked: false,
    scaling_enabled: false,
    scaling_level: 0,
    scaling_off_x: 0.0,
    scaling_off_y: 0.0,
    modules: {},
  };

  return JSON.stringify(collection, null, 4);
}

export function planObsSetup(
  choices: ObsSetupChoices,
  snapshot?: ObsSnapshot,
  /**
   * Whether OBS is on the machine, which is not the same question as whether
   * it has a configuration folder.
   *
   * It writes that folder on its first run, so between clicking through the
   * installer and opening OBS once, the program is there and the folder is
   * not. Asking the folder produced "OBS is not installed on this machine
   * yet" in the middle of a preview for a machine that had just installed it.
   */
  installed?: boolean,
): ObsSetupPlan {
  const obs = snapshot ?? readObs();
  const changes: PlannedChange[] = [];
  const blockers: string[] = [];
  const notes: string[] = [];

  if (!(installed ?? obs.installed)) blockers.push('OBS is not installed on this machine yet.');
  if (!choices.videosRoot) blockers.push('GoodBit does not have a clips folder yet.');

  if (choices.createProfile) {
    const file = path.join(profileDir(), 'basic.ini');
    // Where OBS writes is not where the clip ends up, and saying the second
    // is the honest answer: the staging folder is an implementation detail the
    // user never opens.
    const summary: string[] = [
      `Clips land in ${choices.videosRoot}, in a folder named after the game`,
    ];

    if (choices.display) {
      const video = recordingVideoSettings(choices.display);
      summary.push(
        `Recorded at ${video.baseWidth} by ${video.baseHeight}, ${video.fps} frames a second, not scaled down`,
      );
      const hdr = video.hdr && choices.encoder?.tenBit === true;
      summary.push(
        hdr
          ? `In HDR, because ${choices.display.label} is in HDR mode. Recording it as SDR is what makes clips look washed out.`
          : video.hdr
            ? `In standard colour: ${choices.display.label} is in HDR mode, but 10 bit needs HEVC or AV1 and this machine could not offer either`
            : `In standard colour, because ${choices.display.label} is not in HDR mode`,
      );
      if (choices.encoder) {
        summary.push(`Encoded with ${choices.encoder.reason}`);
      }
    }

    if (choices.enableReplayBuffer) {
      summary.push(`The last ${choices.replayBufferSeconds} seconds are always in memory`);
    }
    if (choices.bindHotkey) {
      summary.push(`${choices.hotkey.replace('OBS_KEY_', '')} saves them to a file`);
    }

    changes.push({
      kind: existsSync(file) ? 'modify' : 'create',
      title: existsSync(file)
        ? 'Update the GoodBit profile'
        : 'A new OBS profile, called GoodBit',
      file,
      summary,
      details: profileEdits(choices).map((edit) => ({
        key: `[${edit.section}] ${edit.key}`,
        value: edit.value.length > 60 ? `${edit.value.slice(0, 57)}…` : edit.value,
      })),
    });
  }

  if (choices.createScene) {
    const file = collectionFile();
    // A freshly installed OBS has none of these folders: it writes them on its
    // first run, and this may well happen before that.
    mkdirSync(scenesDir(), { recursive: true });
    const sceneDetails = [
      { key: 'Scene', value: 'GoodBit' },
      { key: 'Source', value: 'Game capture, anything fullscreen' },
    ];
    if (choices.captureDesktop && choices.display?.monitorId) {
      sceneDetails.push({
        key: 'Source',
        value: `Screen capture, ${choices.display.label}, for anything not fullscreen`,
      });
    }
    const audioPlan = planAudioTracks(choices.audio, choices.multiTrackAudio);
    choices.audio.forEach((device, index) => {
      const mask = audioPlan.mixers[index];
      const track = audioPlan.tracks.find((candidate) => !candidate.master && mask & (1 << (candidate.track - 1)));
      sceneDetails.push({
        key: 'Source',
        value: `${device.flow === 'input' ? 'Microphone' : 'Audio'}, ${device.name}${
          track ? `, on track ${track.track}` : ''
        }`,
      });
    });
    if (audioPlan.multiTrack) {
      sceneDetails.push({ key: '[SimpleOutput] RecTracks', value: String(audioPlan.recTracks) });
    }

    const sceneSummary = ['Whatever game is running fullscreen is captured'];
    if (choices.captureDesktop && choices.display?.monitorId) {
      sceneSummary.push(
        `Anything else, a browser or a windowed game, is captured from ${choices.display.label}`,
      );
    } else {
      sceneSummary.push('Only fullscreen games are captured, so a clip of a browser comes out black');
    }
    /*
     * The routing plan, in full, because it is the one thing here that cannot
     * be changed afterwards.
     *
     * Everything else the setup writes can be redone against tomorrow's
     * recordings. Which sounds ended up in which stream is decided at the
     * moment the file is written and is decided for ever.
     */
    sceneSummary.push(...describeAudioTracks(audioPlan));

    changes.push({
      kind: existsSync(file) ? 'modify' : 'create',
      title: existsSync(file)
        ? 'Replace the GoodBit scene'
        : 'A new OBS scene, called GoodBit',
      file,
      summary: sceneSummary,
      details: sceneDetails,
    });
  }

  /*
   * Say that the script is going, in the preview, like every other write.
   *
   * It is a removal rather than an addition, which makes it the kind of thing
   * a user most wants to have been told about beforehand.
   */
  if (collectionHasScript()) {
    changes.push({
      kind: 'modify',
      title: 'Remove the clip sorting script from the GoodBit scene',
      file: collectionFile(),
      summary: [
        'GoodBit sorts clips into a folder per game itself, so the script is not needed',
        'Both of them sorting the same clip is a race, and the script usually wins',
        'The script file is left on disk, only the entry that loads it goes',
      ],
      details: [{ key: 'modules["scripts-tool"]', value: 'removed' }],
    });
  }

  /*
   * The one file outside GoodBit's own profile, said out loud.
   *
   * It was being written without a preview entry, which is the one rule this
   * whole module is built around: a preview before every write. Three keys in
   * somebody else's configuration is precisely the write they would want to
   * have been told about, and it was the only one they were not.
   */
  {
    const file = userConfigFile();
    const current = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    const edits = userConfigEdits();

    changes.push({
      kind: existsSync(file) ? 'modify' : 'create',
      title: 'Three OBS preferences, outside the GoodBit profile',
      file,
      summary: [
        'OBS skips its own setup wizard, which would otherwise pick a resolution and an encoder over the ones chosen here',
        'OBS sits in the system tray rather than the taskbar, since GoodBit starts it and nothing about it needs looking at again',
        'This is the only file outside GoodBit’s own profile and scene collection that is touched, and it is backed up first',
      ],
      details: edits.map((edit) => ({
        key: `[${edit.section}] ${edit.key}`,
        value: edit.value,
        was: readIniValue(current, edit.section, edit.key) ?? undefined,
      })),
    });
  }

  return { changes, blockers, notes };
}

/** What an ini already says for one key, so the preview can show what changes. */
function readIniValue(source: string, section: string, key: string): string | null {
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

export interface ObsSetupManifest {
  writtenAt: string;
  goodbitVersion: string;
  profile: string | null;
  collection: string | null;
  /** Files created outright, which an undo may delete. */
  created: string[];
  /** Files edited in place, with where their backup went. */
  edited: Array<{ file: string; backup: string }>;
  /**
   * Which sound was routed to which track.
   *
   * The one thing written here that is not about undoing the setup. A file on
   * disk says it has six audio streams and nothing else: that stream 3 is
   * voice chat is known only to the scene collection that recorded it, and a
   * clip outlives the collection. `GetClipAudioTracksAction` reads this to put
   * a name on a track in the trimmer.
   *
   * Optional because a manifest written by an earlier version has none, and a
   * setup nobody has re-run is not a reason to fail.
   */
  audioTracks?: ObsAudioTrack[];
}

export function manifestPath(): string {
  return path.join(userDataDir(), 'obs-setup.json');
}

export function readManifest(): ObsSetupManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(), 'utf-8')) as ObsSetupManifest;
  } catch {
    return null;
  }
}

function backupsDir(): string {
  const dir = path.join(userDataDir(), 'obs-backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Apply the plan.
 *
 * The caller has already checked that OBS is closed and has already shown the
 * plan to a person. This writes it, and writes down what it wrote, because
 * OBS's configuration has no version, no schema and no checksum, and rewrites
 * itself on a profile switch even when nothing changed. A manifest is the only
 * way to tell later whether a key still says what GoodBit set it to.
 */
export function applyObsSetup(
  choices: ObsSetupChoices,
  context: { version: string },
): ObsSetupManifest {
  const created: string[] = [];
  const edited: Array<{ file: string; backup: string }> = [];

  if (choices.createProfile) {
    const dir = profileDir();
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'basic.ini');
    const existed = existsSync(file);
    const original = existed ? readFileSync(file, 'utf-8') : '';

    if (existed) {
      const backup = path.join(backupsDir(), `basic.ini.${Date.now()}.bak`);
      copyFileSync(file, backup);
      edited.push({ file, backup });
    } else {
      created.push(file);
    }

    writeFileSync(file, applyIniEdits(original, profileEdits(choices)), 'utf-8');
  }

  if (choices.createScene) {
    const file = collectionFile();
    if (existsSync(file)) {
      const backup = path.join(backupsDir(), `${GOODBIT_COLLECTION}.json.${Date.now()}.bak`);
      copyFileSync(file, backup);
      edited.push({ file, backup });
    } else {
      created.push(file);
    }

    writeFileSync(
      file,
      buildCollection({
        display: choices.display,
        captureDesktop: choices.captureDesktop,
        tenBit: choices.encoder?.tenBit === true,
        audio: choices.audio,
        multiTrackAudio: choices.multiTrackAudio,
      }),
      'utf-8',
    );
  }

  /*
   * The script comes out even when the scene is not being rebuilt.
   *
   * GoodBit sorts its own clips. Leaving a script loaded means two programs
   * racing to move the same file out of the staging folder, and the one that
   * wins names it differently.
   */
  if (existsSync(collectionFile())) {
    const file = collectionFile();
    const before = readFileSync(file, 'utf-8');

    if (removeScriptFromCollection()) {
      const backup = path.join(backupsDir(), `${GOODBIT_COLLECTION}.json.${Date.now()}.bak`);
      writeFileSync(backup, before, 'utf-8');
      edited.push({ file, backup });
      console.log('[obs] removed the clip sorting script, GoodBit does that itself');
    }
  }

  /*
   * The file GoodBit does not own. Three keys, none of them about a profile.
   *
   * Everything else this writes lives inside the GoodBit profile and the
   * GoodBit scene collection. This is the exception, so it is written on its
   * own, backed up like any other edit, and listed in the preview. See
   * `userConfigEdits` for what each key is for.
   */
  {
    const file = userConfigFile();
    mkdirSync(path.dirname(file), { recursive: true });
    // Created when it is not there rather than skipped. An OBS that has never
    // been opened has neither file.
    if (existsSync(file)) {
      const backup = path.join(backupsDir(), `${path.basename(file)}.${Date.now()}.bak`);
      copyFileSync(file, backup);
      edited.push({ file, backup });
    } else {
      created.push(file);
    }

    const original = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    writeFileSync(file, applyIniEdits(original, userConfigEdits()), 'utf-8');
  }

  const manifest: ObsSetupManifest = {
    writtenAt: new Date().toISOString(),
    goodbitVersion: context.version,
    profile: choices.createProfile ? GOODBIT_PROFILE : null,
    collection: choices.createScene ? GOODBIT_COLLECTION : null,
    created,
    edited,
    audioTracks: planAudioTracks(choices.audio, choices.multiTrackAudio).tracks,
  };

  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

/**
 * Put back what was there.
 *
 * Only ever removes files GoodBit created and restores files GoodBit backed
 * up. A profile or collection the user has edited since is still theirs; the
 * caller warns about that before calling this.
 */
export function undoObsSetup(): { removed: string[]; restored: string[] } {
  const manifest = readManifest();
  if (!manifest) return { removed: [], restored: [] };

  const removed: string[] = [];
  const restored: string[] = [];

  for (const file of manifest.created) {
    try {
      if (existsSync(file)) {
        const graveyard = path.join(backupsDir(), `${path.basename(file)}.removed.${Date.now()}`);
        copyFileSync(file, graveyard);
        rmSync(file, { force: true });
        removed.push(file);
      }
    } catch {
      // A file that cannot be removed is reported by absence from the list.
    }
  }

  for (const entry of manifest.edited) {
    try {
      if (existsSync(entry.backup)) {
        copyFileSync(entry.backup, entry.file);
        restored.push(entry.file);
      }
    } catch {
      // Same.
    }
  }

  return { removed, restored };
}

/**
 * Stop OBS opening its auto-configuration wizard.
 *
 * It runs on OBS's **first launch** and picks a resolution, a frame rate and
 * an encoder, which are the settings this app has just chosen deliberately.
 * The flag that suppresses it is the same one OBS sets once it has been
 * through it, and it has to exist before OBS ever starts: writing it after the
 * fact suppresses a wizard that has already been and gone.
 *
 * Called the moment OBS is detected, rather than when the setup is applied,
 * because somebody can install OBS now and set it up tomorrow.
 */
export function suppressFirstRunWizard(): void {
  const file = userConfigFile();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const original = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    writeFileSync(
      file,
      applyIniEdits(original, [{ section: 'General', key: 'FirstRun', value: 'true' }]),
      'utf-8',
    );
  } catch (error) {
    // Worth nothing more than a log: the wizard is an annoyance, not a
    // failure, and a person can click Cancel.
    console.warn(
      '[obs] could not skip the first run wizard:',
      error instanceof Error ? error.message : error,
    );
  }
}

/** Where OBS lives, for the UI to show. */
export function obsPaths(): { config: string; profiles: string; scenes: string } {
  return { config: obsConfigDir(), profiles: profilesDir(), scenes: scenesDir() };
}
