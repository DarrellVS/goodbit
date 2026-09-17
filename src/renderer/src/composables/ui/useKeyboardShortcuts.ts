import { onMounted, onBeforeUnmount, computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useShortcutCustomization } from '@renderer/composables/settings/useShortcutCustomization';
import type { ShortcutKey } from '@renderer/constants/shortcuts';

export type ShortcutKeyLegacy = 
  | 'Space' 
  | 'ArrowLeft' 
  | 'ArrowRight' 
  | 'ArrowUp' 
  | 'ArrowDown'
  | 'Delete' 
  | 'Escape'
  | 'KeyG'
  | 'KeyL'
  | 'KeyS'
  | 'KeyF'
  | 'Slash';

type ShortcutHandler = (event: KeyboardEvent) => void;

export interface KeyboardShortcutsOptions {
  shortcuts?: Partial<Record<ShortcutKey, ShortcutHandler>>;
  actions?: Partial<Record<string, ShortcutHandler>>;
  /**
   * If true, shortcuts will work even when the setting is disabled.
   * Use this for critical shortcuts like Escape to close modals.
   */
  ignoreSettings?: boolean;
}

export function useKeyboardShortcuts(
  options: KeyboardShortcutsOptions | Partial<Record<ShortcutKeyLegacy, ShortcutHandler>>
) {
  const config = useConfiguration();
  const shortcutCustomization = useShortcutCustomization();
  
  // Support both old and new API
  let opts: KeyboardShortcutsOptions;
  if (typeof options === 'function' || (!('shortcuts' in options) && !('actions' in options))) {
    // Legacy API: direct object of key -> handler
    opts = { shortcuts: options as Partial<Record<ShortcutKey, ShortcutHandler>>, ignoreSettings: false };
  } else {
    opts = options;
  }

  // Build effective shortcuts map from actions
  const actionBasedShortcuts = computed(() => {
    if (!opts.actions) return {};
    
    const keyMap: Partial<Record<ShortcutKey, ShortcutHandler>> = {};
    Object.entries(opts.actions).forEach(([actionId, handler]) => {
      const key = shortcutCustomization.getActionKey(actionId);
      if (key) {
        keyMap[key] = handler;
      }
    });
    return keyMap;
  });

  // Merge action-based shortcuts with direct shortcuts (direct shortcuts take precedence)
  const effectiveShortcuts = computed(() => {
    return {
      ...actionBasedShortcuts.value,
      ...opts.shortcuts,
    };
  });

  function handleKeyDown(event: KeyboardEvent): void {
    // Check if shortcuts are enabled (unless explicitly ignored)
    if (!opts.ignoreSettings && !config.public.value.enableKeyboardShortcuts) {
      return;
    }

    // Ignore if typing in an input field
    if (shouldIgnoreEvent(event)) return;

    const handler = effectiveShortcuts.value[event.code as ShortcutKey];
    if (!handler) return;

    // Prevent default for certain keys
    if (['Space', 'Slash', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
    }

    handler(event);
  }

  function shouldIgnoreEvent(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
}
