import { useLocalStorage } from '@vueuse/core';
import { computed, reactive } from 'vue';

export interface PublicConfig {
  viewMode: 'grid' | 'grouped';
  pageSize: number;
  autoPlayOnHover: boolean;
  showMetadata: boolean;
  dateFormat: 'relative' | 'absolute';
  enableKeyboardShortcuts: boolean;
  confirmBeforeDelete: boolean;
  compactMode: boolean;
  muteVideosByDefault: boolean;
}

const publicConfig = useLocalStorage<PublicConfig>('filmpje-public-config', {
  viewMode: 'grouped',
  pageSize: 25,
  autoPlayOnHover: true,
  showMetadata: true,
  dateFormat: 'relative',
  enableKeyboardShortcuts: true,
  confirmBeforeDelete: true,
  compactMode: false,
  muteVideosByDefault: false,
});

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
