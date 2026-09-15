import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { applyIniEdits, type IniEdit } from './ini.js';
import { obsConfigDir, profilesDir, scenesDir } from './paths.js';
import { pythonConfigFile, readObs, type ObsSnapshot } from './config.js';
import {
  ClipNamingMode,
  scriptSettings,
  smartReplaysPath,
  type SmartReplaysAlias,
} from './smartReplays.js';
import type { CaptureDisplay } from './displays.js';
import type { EncoderChoice } from './encoderChoice.js';
import type { AudioDevice } from './audioDevices.js';
import { recordingVideoSettings } from './displays.js';
import { userDataDir } from '../../settings.js';

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
 *   scene collection of its own, both named GoodBit, and the only file it
 *   ever touches outside them holds one key: the path to Python, without
 *   which OBS refuses to run any script at all.
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
  installScript: boolean;
  /** Written into the script's settings, so clips land in named folders. */
  aliases: SmartReplaysAlias[];
  namingMode: ClipNamingMode;
  setPythonPath: boolean;
  pythonDirectory: string | null;
  /** False when the apply will have to install it first. */
  pythonInstalled: boolean;
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
   * Capture the whole screen underneath the game capture.
   *
   * On, because a game capture on its own records nothing at all outside a
   * fullscreen game: alt-tab to a browser, press the key, and the clip is
   * black. Under it, display capture makes the same key work for anything on
   * screen, and game capture still takes over when a game is running.
   */
  captureDesktop: boolean;
}

export type ChangeKind = 'create' | 'modify' | 'download';

export interface PlannedChange {
  kind: ChangeKind;
  /** What the user sees: a short, plain name for the thing being changed. */
  title: string;
  /** The file, absolute, so someone who knows OBS can check it. */
  file: string;
  /**
   * What this change means, in sentences.
   *
   * The keys below are the truth and stay available, but a list of
   * `[SimpleOutput] RecRBTime = 30` is a diff for somebody who already knows
   * OBS. Most people pressing this button do not, and reading thirteen ini
   * keys is not consent, it is a wall.
   */
  summary: string[];
  /** Key and value pairs, in OBS's own vocabulary, for anyone who wants them. */
  details: Array<{ key: string; value: string; was?: string }>;
}

export interface ObsSetupPlan {
  changes: PlannedChange[];
  /** Reasons the plan cannot be applied right now. */
  blockers: string[];
  /** Things worth saying before someone presses the button. */
  notes: string[];
}

function profileDir(): string {
  return path.join(profilesDir(), GOODBIT_PROFILE);
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
    { section: 'SimpleOutput', key: 'FilePath', value: iniPath(choices.videosRoot) },
    // GoodBit reads mp4, mov and mkv. Being explicit rather than inheriting
    // whatever this OBS defaults to, which changed to hybrid_mp4 in 30.2.
    { section: 'SimpleOutput', key: 'RecFormat2', value: 'mp4' },
  ];

  if (choices.encoder) {
    edits.push(
      { section: 'SimpleOutput', key: 'RecEncoder', value: choices.encoder.encoder },
      // Not the default. OBS's own default for a new profile is `Stream`,
      // which records at the streaming bitrate and looks like it: a clip you
      // are going to trim and share deserves better than a twitch preset.
      { section: 'SimpleOutput', key: 'RecQuality', value: 'HQ' },
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
  scriptPath: string | null,
  settings: Record<string, unknown>,
  options: {
    display: CaptureDisplay | null;
    captureDesktop: boolean;
    tenBit: boolean;
    audio: AudioDevice[];
  },
): string {
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
      mixers: 255,
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
      mixers: 255,
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
  for (const device of options.audio) {
    sources.push({
      id: device.flow === 'input' ? 'wasapi_input_capture' : 'wasapi_output_capture',
      // `Speakers` three times is what the OBS mixer would otherwise show.
      name: device.isDefault
        ? 'Desktop audio'
        : device.description
          ? `${device.name} (${device.description})`
          : device.name,
      settings: { device_id: device.id },
      mixers: 255,
    });
  }

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

  if (scriptPath) {
    // The discovery that makes the whole feature cheap: a script and every one
    // of its settings live here, in the scene collection, so installing and
    // configuring it is one file write rather than a person clicking through
    // a properties panel.
    collection.modules = {
      'scripts-tool': [{ path: scriptPath.replace(/\\/g, '/'), settings }],
    };
  }

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
    const summary: string[] = [`Clips are written to ${choices.videosRoot}`];

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
    for (const device of choices.audio) {
      sceneDetails.push({
        key: 'Source',
        value: `${device.flow === 'input' ? 'Microphone' : 'Audio'}, ${device.name}`,
      });
    }

    const sceneSummary = ['Whatever game is running fullscreen is captured'];
    if (choices.captureDesktop && choices.display?.monitorId) {
      sceneSummary.push(
        `Anything else, a browser or a windowed game, is captured from ${choices.display.label}`,
      );
    } else {
      sceneSummary.push('Only fullscreen games are captured, so a clip of a browser comes out black');
    }
    if (choices.audio.length === 0) {
      sceneSummary.push('No sound is recorded, because no audio device was chosen');
    } else if (choices.audio.length === 1) {
      sceneSummary.push(`Sound comes from ${choices.audio[0].name.toLowerCase()}`);
    } else {
      sceneSummary.push(
        `Sound comes from ${choices.audio.length} devices, each on its own fader: ${choices.audio
          .map((device) => device.name)
          .join(', ')}`,
      );
    }

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

  if (choices.installScript) {
    const scriptSummary = [
      `Each clip goes into a folder named after the game, inside ${choices.videosRoot}`,
      `The name comes from ${namingModeLabel(choices.namingMode)}`,
    ];
    if (choices.aliases.length) {
      scriptSummary.push(
        `${choices.aliases.length} games on this machine are already named, so the folders read properly from the first clip`,
      );
    }
    scriptSummary.push('OBS cannot do this itself, so this is a script by qvvonk, downloaded unmodified');

    changes.push({
      kind: 'download',
      title: 'A folder for every game',
      file: smartReplaysPath(),
      summary: scriptSummary,
      details: [
        { key: 'Base folder', value: choices.videosRoot },
        { key: 'Sort into folders', value: 'yes, one per game' },
        { key: 'Names from', value: namingModeLabel(choices.namingMode) },
        { key: 'Known games', value: `${choices.aliases.length}` },
      ],
    });

    if (!choices.createScene) {
      notes.push(
        'Smart Replays is configured inside a scene collection, so installing it without letting GoodBit make one means adding it by hand in Tools, Scripts.',
      );
    }

    /*
     * Python comes with the script rather than beside it.
     *
     * OBS runs no script at all until it has been pointed at a Python
     * installation, so this is not a separate thing to want: it is what the
     * previous change needs in order to do anything. It was its own switch,
     * which meant it could be turned off while the script stayed on, and the
     * result was a setup that looked complete and sorted nothing.
     */
    if (choices.pythonDirectory) {
      const file = pythonConfigFile();
      changes.push({
        kind: choices.pythonInstalled ? 'modify' : 'download',
        title: choices.pythonInstalled
          ? 'Point OBS at GoodBit\'s Python'
          : 'Install a Python for GoodBit, and point OBS at it',
        file,
        summary: [
          choices.pythonInstalled
            ? `GoodBit already has its own Python, at ${choices.pythonDirectory}.`
            : `About 25 MB, from python.org, into ${choices.pythonDirectory}. Off your PATH, not associated with anything, used for this one script.`,
          "Also skips OBS's own setup wizard, which would otherwise ask you to choose the settings this has just chosen.",
          'Its own copy rather than one already on the machine, because OBS refuses to load anything newer than 3.12 and says so nowhere except its log.',
          obs.pythonPath
            ? `OBS currently points at ${obs.pythonPath}.`
            : 'OBS has nothing set at the moment.',
        ],
        details: [
          {
            key: '[Python] Path64bit',
            value: choices.pythonDirectory,
            was: obs.pythonPath ?? 'not set',
          },
        ],
      });
    }
  }

  if (choices.captureDesktop && choices.display && !choices.display.monitorId) {
    notes.push(
      'Windows did not say which device your screen is, so the scene gets game capture only. Add a Display Capture source in OBS and pick the screen there.',
    );
  }

  if (obs.activeProfile && obs.activeProfile.folder !== GOODBIT_PROFILE) {
    notes.push(
      `Your current profile, ${obs.activeProfile.name}, is not touched. GoodBit starts OBS with its own profile instead.`,
    );
  }



  return { changes, blockers, notes };
}

function namingModeLabel(mode: ClipNamingMode): string {
  if (mode === ClipNamingMode.CurrentScene) return 'the OBS scene';
  if (mode === ClipNamingMode.MostRecordedProcess) return 'the game you played most in the clip';
  return 'the game in front when you press the key';
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
  script: { path: string; blobSha1: string } | null;
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
  context: { version: string; scriptBlobSha1?: string },
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

    const settings = choices.installScript
      ? scriptSettings({
          clipsBasePath: choices.videosRoot,
          namingMode: choices.namingMode,
          aliases: choices.aliases,
          restartBufferLoop: 0,
        })
      : {};

    writeFileSync(
      file,
      buildCollection(choices.installScript ? smartReplaysPath() : null, settings, {
        display: choices.display,
        captureDesktop: choices.captureDesktop,
        tenBit: choices.encoder?.tenBit === true,
        audio: choices.audio,
      }),
      'utf-8',
    );
  }

  if (choices.setPythonPath && choices.pythonDirectory) {
    const file = pythonConfigFile();
    mkdirSync(path.dirname(file), { recursive: true });
    // Created when it is not there rather than skipped. An OBS that has never
    // been opened has neither file, and doing nothing while the summary says
    // "pointed OBS at Python" is worse than either outcome on its own.
    if (existsSync(file)) {
      const backup = path.join(backupsDir(), `${path.basename(file)}.${Date.now()}.bak`);
      copyFileSync(file, backup);
      edited.push({ file, backup });
    } else {
      created.push(file);
    }

    const original = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    writeFileSync(
      file,
      applyIniEdits(original, [
        // Forward slashes, which is how OBS writes this key itself.
        { section: 'Python', key: 'Path64bit', value: choices.pythonDirectory.replace(/\\/g, '/') },
        /*
         * Skip OBS's own auto-configuration wizard.
         *
         * It opens on a first run and asks whether this is for streaming or
         * recording, then picks a resolution, a frame rate and an encoder,
         * which are the settings this has just chosen deliberately. Two
         * wizards disagreeing about the same profile is worse than either.
         *
         * `FirstRun` is the flag OBS sets once it has been through it, and it
         * is a per-user setting rather than anything to do with a profile.
         */
        { section: 'General', key: 'FirstRun', value: 'true' },
      ]),
      'utf-8',
    );
  }

  const manifest: ObsSetupManifest = {
    writtenAt: new Date().toISOString(),
    goodbitVersion: context.version,
    profile: choices.createProfile ? GOODBIT_PROFILE : null,
    collection: choices.createScene ? GOODBIT_COLLECTION : null,
    created,
    edited,
    script:
      choices.installScript && context.scriptBlobSha1
        ? { path: smartReplaysPath(), blobSha1: context.scriptBlobSha1 }
        : null,
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
  const file = pythonConfigFile();
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
