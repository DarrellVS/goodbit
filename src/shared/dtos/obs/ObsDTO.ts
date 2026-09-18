/**
 * What GoodBit and its window agree an OBS setup looks like.
 *
 * These twelve types described one contract and were written out twice, once
 * in `src/main` beside the code that produces them and once in
 * `src/renderer/src/services/obs.ts` beside the code that reads them. Nothing
 * held the two copies together, and they had already come apart in three
 * places by the time they were collected here:
 *
 * - `PlannedChange.kind` was the `ChangeKind` alias in main and three inline
 *   string literals in the renderer.
 * - `ObsInstallPlan.options` was `ObsInstallOption[]` in main and the same
 *   object written out again in the renderer.
 * - `ObsSetupPlan` carried an `obsRunning` field in the renderer that main
 *   never declared, because main does not put it on the plan. It puts it on
 *   the *answer to a planning request*, which is a different thing and is
 *   `ObsSetupPlanResponse` below.
 *
 * None of that had broken anything yet. It is the kind of drift that is
 * invisible until the day a field is added on one side only, and then shows up
 * as a screen reading a value that is always undefined.
 *
 * Main is the producer, so these are main's shapes. `src/shared` may not
 * import from `src/main`, which is why they live here rather than being
 * re-exported out of it.
 */

/* ── Reading an existing OBS ─────────────────────────────────────────────── */

export type FindingLevel = 'ok' | 'warning' | 'blocker';

export interface ObsFinding {
  id: string;
  level: FindingLevel;
  title: string;
  detail: string;
  /** True when GoodBit's own setup would resolve this. */
  fixable: boolean;
}

/**
 * One recorded track, and what it carries.
 *
 * Produced by the setup and written into the manifest, because a file on disk
 * says only that it has six audio streams. Which one is voice chat is
 * something only the scene collection that recorded it knows.
 */
export interface ObsAudioTrack {
  /** OBS's own numbering, from 1. */
  track: number;
  /** The device, named the way the OBS mixer names it. */
  label: string;
  /** Null on the mix, which is not one device. */
  deviceId: string | null;
  /** The full mix. Track 1, always, when there is more than one track. */
  master: boolean;
}

export interface ObsStatus {
  installed: boolean;
  running: boolean;
  executable: string | null;
  /** Ready means: a buffer, a hotkey, a matching folder and a way to sort. */
  ready: boolean;
  findings: ObsFinding[];
  activeProfileName: string | null;
  goodbitProfileExists: boolean;
  /**
   * Has this person built scenes worth leaving alone?
   *
   * Not the same as "has a scene collection". OBS creates an empty one called
   * Untitled on its first run, and treating that as somebody's work meant the
   * setup skipped making its own: OBS then opened the GoodBit profile with an
   * empty scene and warned that it had no video sources, which it did not.
   *
   * A collection counts when something in it captures something.
   */
  hasScenes: boolean;
  /**
   * Which profile these findings are about.
   *
   * GoodBit never switches the active profile: it makes its own and names it
   * on the command line when it starts OBS. So once that profile exists, it is
   * the one worth judging, and judging the active one instead would report a
   * buffer as off immediately after turning it on.
   */
  judging: 'goodbit' | 'active';
  videosRoot: string;
  recordingPath: string | null;
  replayBufferSeconds: number | null;
  hotkey: string | null;
  /** What the GoodBit scene already captures, so the setup can show it ticked. */
  audioDeviceIds: string[];
  /**
   * Whether this profile writes more than one audio track.
   *
   * Read back from `[SimpleOutput] RecTracks` rather than from the manifest,
   * because the manifest says what GoodBit wrote and this says what OBS will
   * do tonight. A profile edited by hand since is the case worth catching.
   */
  multiTrackAudio: boolean;
  /**
   * What each track carries, when the setup that wrote it recorded a mapping.
   *
   * Empty on a profile GoodBit did not write, where the tracks exist and
   * nothing knows what is on them.
   */
  audioTracks: ObsAudioTrack[];
  setupWrittenAt: string | null;
}

/* ── Planning, and what a plan is allowed to say ─────────────────────────── */

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

/**
 * A plan, plus the one fact the dialog needs that is not part of the plan.
 *
 * Nothing is written while OBS runs, so whether it is running decides what the
 * dialog can offer. That is true of the moment the plan was asked for, not of
 * the plan, which is why it is here and not on `ObsSetupPlan`.
 */
export type ObsSetupPlanResponse = ObsSetupPlan & { obsRunning: boolean };

export interface ObsSetupRequest {
  createProfile?: boolean;
  /** Electron's display id. Defaults to the primary screen. */
  displayId?: number;
  /** OBS device ids. Absent means the system's own output, alone. */
  audioDeviceIds?: string[];
  /**
   * Give each of those devices a track of its own. On unless it is refused.
   *
   * Only does anything with two or more devices: there is nothing to separate
   * below that, and a one-device setup writes exactly what it wrote before.
   */
  multiTrackAudio?: boolean;
  captureDesktop?: boolean;
  enableReplayBuffer?: boolean;
  replayBufferSeconds?: number;
  bindHotkey?: boolean;
  hotkey?: string;
  createScene?: boolean;
}

export interface ObsSetupResult {
  applied: boolean;
  /** What was written, so the UI can say it rather than guess. */
  summary: string[];
  profile: string | null;
  collection: string | null;
}

/* ── The machine underneath ──────────────────────────────────────────────── */

/**
 * The screens, in the two vocabularies that have to agree.
 *
 * Electron knows resolutions, refresh rates and which screen is primary, and
 * calls a monitor `MEG 342C OLED`. OBS knows none of that: it identifies a
 * display by a Windows device interface path, and needs to be told whether
 * that display is in HDR mode.
 */
export interface CaptureDisplay {
  /** Electron's id, which is what the UI passes back. */
  id: number;
  label: string;
  primary: boolean;
  /** Real pixels, not the scaled ones a 125% display reports. */
  width: number;
  height: number;
  frequency: number;
  /** What a `monitor_capture` source needs, when Windows would say. */
  monitorId: string | null;
  hdrSupported: boolean;
  /** HDR is on for this screen right now, which decides the colour settings. */
  hdrEnabled: boolean;
}

/**
 * An audio device, with the identifier OBS stores.
 *
 * A `wasapi_output_capture` source is a device id and nothing else:
 *
 *   {0.0.0.00000000}.{c625702e-b28a-4288-ab67-36cb243f8c05}
 *
 * which is the MMDevice endpoint guid with a flow prefix: `0.0.0` for
 * playback, `0.0.1` for recording.
 */
export interface AudioDevice {
  /** What OBS stores, verbatim. */
  id: string;
  /** The endpoint's own name, which is often `Speakers` on three of them. */
  name: string;
  /**
   * The hardware behind it: `Sound Blaster X3`, `Elgato Virtual Audio`.
   *
   * Without this the list reads as duplicates. Windows shows both lines in its
   * own sound settings for the same reason.
   */
  description: string;
  /** `output` is something playing, `input` is a microphone. */
  flow: 'output' | 'input';
  /** The system default, which OBS writes as the literal `default`. */
  isDefault: boolean;
}

/* ── Getting OBS onto a machine that never had it ────────────────────────── */

export interface ObsInstallOption {
  method: 'winget' | 'download' | 'manual';
  /** What to say on the button. */
  label: string;
  detail: string;
}

export interface ObsInstallPlan {
  alreadyInstalled: boolean;
  options: ObsInstallOption[];
  /** What the download route would fetch, so the dialog can name it. */
  installer: { version: string; name: string; bytes: number } | null;
  downloadPage: string;
}
