import { useLocalStorage } from '@vueuse/core';
import type { RemovableRef } from '@vueuse/core';

export type ViewMode = 'grid' | 'grouped';

interface PublicSettings {
  viewMode: ViewMode;
  theme: 'light' | 'dark' | 'auto';
}

interface PrivateSettings {
  lastVisitedCollection: number | null;
  sidebarCollapsed: boolean;
}

const defaultPublicSettings: PublicSettings = {
  viewMode: 'grouped',
  theme: 'light',
};

const defaultPrivateSettings: PrivateSettings = {
  lastVisitedCollection: null,
  sidebarCollapsed: false,
};

class Configuration {
  public: RemovableRef<PublicSettings>;
  private: RemovableRef<PrivateSettings>;

  constructor() {
    this.public = useLocalStorage('filmpje:settings:public', defaultPublicSettings, {
      mergeDefaults: true,
    });
    this.private = useLocalStorage('filmpje:settings:private', defaultPrivateSettings, {
      mergeDefaults: true,
    });
  }
}

let instance: Configuration | null = null;

export function useConfiguration() {
  if (!instance) {
    instance = new Configuration();
  }
  return instance;
}

