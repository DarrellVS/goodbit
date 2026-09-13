import { readonly, ref } from 'vue';

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
  startAtLogin: boolean;
  keepRunningInTray: boolean;
  migratedFromWebApp: boolean;
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

  return {
    settings: readonly(settings),
    loaded: readonly(loaded),
    saving: readonly(saving),
    load,
    save,
    pickFolder,
  };
}
