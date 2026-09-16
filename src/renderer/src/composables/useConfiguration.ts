import { useLocalStorage } from '@vueuse/core';
import { computed, reactive } from 'vue';
import type { ShortcutKey } from '../constants/shortcuts';
import { carryOverKey } from '../utils/storageKey';

export interface PublicConfig {
  viewMode: 'grid' | 'grouped';
  pageSize: number;
  autoPlayOnHover: boolean;
  hoverScrub: boolean;
  showMetadata: boolean;
  dateFormat: 'relative' | 'absolute';
  enableKeyboardShortcuts: boolean;
  confirmBeforeDelete: boolean;
  compactMode: boolean;
  muteVideosByDefault: boolean;
  /**
   * How loud a clip plays, 0 to 1, remembered across clips.
   *
   * Every clip opened in its own `<video>`, which starts at full volume by
   * definition, so setting it was a per-clip chore that reset itself the moment
   * you opened the next one. It is one preference about how loud this person
   * wants clips, not a property of a clip.
   */
  clipVolume: number;
  preferLocalNetwork: boolean;
  customShortcuts?: Record<string, ShortcutKey>;
}

const CONFIG_KEY = 'goodbit-public-config';
carryOverKey('filmpje-public-config', CONFIG_KEY);

const publicConfig = useLocalStorage<PublicConfig>(CONFIG_KEY, {
  viewMode: 'grouped',
  // Fifteen put a 41 clip library on three pages, which broke select-all and
  // made every whole-library action a per-page chore.
  pageSize: 50,
  autoPlayOnHover: true,
  hoverScrub: true,
  showMetadata: true,
  dateFormat: 'relative',
  enableKeyboardShortcuts: true,
  confirmBeforeDelete: true,
  compactMode: false,
  muteVideosByDefault: false,
  clipVolume: 1,
  // On by default: falls back to the internet on its own when the PC is not
  // reachable, so there is nothing to strand you when away from home.
  preferLocalNetwork: true,
  // mergeDefaults so a setting added after a browser already has a stored blob
  // gets its default instead of undefined.
}, { mergeDefaults: true });

const privateConfig = reactive({
  lastVisitedCollection: null as number | null,
  sidebarCollapsed: false,
});

export function useConfiguration() {
  return {
    public: publicConfig,
    private: computed(() => privateConfig),
  };
}
