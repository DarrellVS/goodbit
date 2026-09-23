import { readonly, ref } from 'vue';
import type { RecordingQuality } from '@shared/index';

/**
 * The settings main owns: where the clips are, autostart, the publisher.
 *
 * Separate from `useConfiguration`, which holds view preferences in
 * localStorage. These have to be readable before a window exists, so they live
 * in a file next to the database and come across the bridge.
 *
 * Module-level state, so every caller sees the same values rather than each
 * component holding its own copy that drifts when one of them saves.
 */
export interface AppSettings {
  videosRoot: string;
  audioRoot: string;
  publisherBaseUrl: string;
  /** The secret the publisher wants before it accepts an upload. */
  publisherToken?: string;
  startAtLogin: boolean;
  keepRunningInTray: boolean;
  /** Start OBS, minimised with its buffer running, when GoodBit starts. */
  startObsWithGoodbit?: boolean;
  /** The notch as a whole. Main writes it down at first boot; see `resolveNotch`. */
  notch?: boolean;
  /** The status line between peeks. Unset means on. */
  notchAlwaysOn?: boolean;
  /** How long the pointer rests on the line before it opens, in ms. */
  notchDwellMs?: number;
  /** How long the pointer can be off the open island before it folds, in ms. */
  notchLeaveMs?: number;
  /** Say "clip saved" over the game, as the notch's peek. Unset means on. */
  clipToast?: boolean;
  clipToastSound?: boolean;
  clipToastCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 0 to 100. */
  clipToastVolume?: number;
  /** Read the session's clips when the game closes. Unset means on. */
  analyzeOnGameClose?: boolean;
  /** Say so on the same card. Unset means on. */
  analyzeOnGameCloseToast?: boolean;
  /** A chime with the card that says what it found. Unset means on. */
  analyzeOnGameCloseSound?: boolean;
  migratedFromWebApp: boolean;
  /** Re-encode a trim to share size. Unset means off. */
  compressTrims?: boolean;
  /** Send a share-sized copy to the publisher. Unset means on. */
  compressPublished?: boolean;
  /**
   * How hard OBS compresses what it records. Unset means indistinguishable.
   *
   * The third thing here that sounds like the two above it, and the only one
   * that is not GoodBit re-encoding a clip it already has. This one governs
   * the recording itself, which means it cannot change a file already on
   * disk, and it only lands when the OBS profile is next written.
   */
  recordingQuality?: RecordingQuality;
  /** Whether a Stream Deck key may throw the latest clip away. Unset means no. */
  streamDeckAllowDiscard?: boolean;
  /** Storage Saver: how old an unopened clip has to be. Days, 30 unset. */
  unreviewedDays?: number;
  /** Storage Saver: how close two saves are to be one moment. Seconds, 90 unset. */
  burstWindowSec?: number;
}

const EMPTY: AppSettings = {
  videosRoot: '',
  audioRoot: '',
  publisherBaseUrl: '',
  startAtLogin: true,
  keepRunningInTray: true,
  migratedFromWebApp: false,
};

const settings = ref<AppSettings>({ ...EMPTY });
const loaded = ref(false);
const saving = ref(false);

export function useAppSettings() {
  async function load(): Promise<void> {
    const bridge = window.goodbit;
    if (!bridge) return;
    settings.value = await bridge.getSettings();
    loaded.value = true;
  }

  async function save(patch: Partial<AppSettings>): Promise<void> {
    const bridge = window.goodbit;
    if (!bridge) return;

    saving.value = true;
    try {
      settings.value = await bridge.saveSettings(patch);
    } finally {
      saving.value = false;
    }
  }

  /** Open a folder picker and store the result, if one was chosen. */
  async function pickFolder(
    key: 'videosRoot' | 'audioRoot',
    title: string,
  ): Promise<string | null> {
    const chosen = await window.goodbit?.pickFolder(title);
    if (!chosen) return null;
    await save({ [key]: chosen });
    return chosen;
  }

  /**
   * Choose a folder and take the clips with it.
   *
   * The plain `pickFolder` above repoints and rescans, leaving the files
   * alone, which is what somebody correcting a wrong path wants. This is the
   * other intent, and it runs as a job because a library is minutes.
   */
  async function moveLibraryTo(
    title: string,
  ): Promise<{ chosen: string; problem: string | null; obsRunning: boolean } | null> {
    const chosen = await window.goodbit?.pickFolder(title);
    if (!chosen) return null;

    const checked = (await window.goodbit?.canMoveLibrary(chosen)) ?? {
      problem: null,
      obsRunning: false,
    };
    return { chosen, ...checked };
  }

  /** Ask OBS to close so a move can start. Never forces it. */
  async function closeObs(): Promise<boolean> {
    const result = await window.goodbit?.closeObs();
    return result?.closed ?? false;
  }

  /** Returns the job's id, so the caller can follow it rather than guess. */
  async function startMove(destination: string): Promise<{ jobId: string } | undefined> {
    const started = await window.goodbit?.moveLibrary(destination);
    await load();
    return started;
  }

  return {
    settings: readonly(settings),
    loaded: readonly(loaded),
    saving: readonly(saving),
    load,
    save,
    pickFolder,
    moveLibraryTo,
    startMove,
    closeObs,
  };
}
