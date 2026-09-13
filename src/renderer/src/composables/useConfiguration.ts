import { useLocalStorage } from '@vueuse/core';
import { computed, reactive } from 'vue';
import type { ShortcutKey } from '../constants/shortcuts';

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
  preferLocalNetwork: boolean;
  customShortcuts?: Record<string, ShortcutKey>;
}

const publicConfig = useLocalStorage<PublicConfig>('filmpje-public-config', {
  viewMode: 'grouped',
  pageSize: 15,
  autoPlayOnHover: true,
  hoverScrub: true,
  showMetadata: true,
  dateFormat: 'relative',
  enableKeyboardShortcuts: true,
  confirmBeforeDelete: true,
  compactMode: false,
  muteVideosByDefault: false,
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
