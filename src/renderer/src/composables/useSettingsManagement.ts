import { useConfiguration, type PublicConfig } from './useConfiguration';
import { useToastStore } from '../stores/toast';

// Typed so that adding a setting without a default here is a compile error.
const DEFAULT_SETTINGS: PublicConfig = {
  viewMode: 'grouped',
  /*
   * Fifty, the same as the initial default.
   *
   * This said fifteen, which is the value `useConfiguration` deliberately
   * moved away from: it put a 41 clip library on three pages, which broke
   * select-all and made every whole-library action a per-page chore. Reset to
   * Defaults handed that back.
   */
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
  preferLocalNetwork: true,
  customShortcuts: undefined,
};

export function useSettingsManagement() {
  const config = useConfiguration();
  const toastStore = useToastStore();

  function resetToDefaults(): void {
    // Not `confirm()`: a native dialog blocks the whole renderer, and every
    // other destructive action in the app asks the same way this does.
    toastStore.confirm(
      'Every preference goes back to how it shipped. Your clips are not touched.',
      () => {
        // Copy, or later edits would mutate the shared constant.
        config.public.value = { ...DEFAULT_SETTINGS };
        toastStore.success('Settings reset to defaults');
      },
      'Reset all settings?'
    );
  }

  function exportSettings(): void {
    const data = JSON.stringify(config.public.value, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goodbit-settings-${new Date().toISOString().split('T')[0]}.json`;
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

