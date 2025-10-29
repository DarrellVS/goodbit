import { useConfiguration } from './useConfiguration';
import { useToastStore } from '../stores/toast';

const DEFAULT_SETTINGS = {
  viewMode: 'grouped' as const,
  pageSize: 15,
  autoPlayOnHover: true,
  showMetadata: true,
  dateFormat: 'relative' as const,
  enableKeyboardShortcuts: true,
  confirmBeforeDelete: true,
  compactMode: false,
  muteVideosByDefault: false,
  customShortcuts: undefined,
};

export function useSettingsManagement() {
  const config = useConfiguration();
  const toastStore = useToastStore();

  function resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to their default values?')) {
      config.public.value = DEFAULT_SETTINGS;
      toastStore.success('Settings reset to defaults');
    }
  }

  function exportSettings(): void {
    const data = JSON.stringify(config.public.value, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filmpje-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastStore.success('Settings exported successfully');
  }

  function importSettings(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const imported = JSON.parse(text);
          config.public.value = { ...config.public.value, ...imported };
          toastStore.success('Settings imported successfully');
        } catch (error) {
          toastStore.error('Failed to import settings. Invalid file format.');
        }
      }
    };
    input.click();
  }

  return {
    resetToDefaults,
    exportSettings,
    importSettings,
  };
}

