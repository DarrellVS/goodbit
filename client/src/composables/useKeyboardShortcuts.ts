import { onMounted, onBeforeUnmount } from 'vue';
import { useConfiguration } from './useConfiguration';

export type ShortcutKey = 
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
  shortcuts: Partial<Record<ShortcutKey, ShortcutHandler>>;
  /**
   * If true, shortcuts will work even when the setting is disabled.
   * Use this for critical shortcuts like Escape to close modals.
   */
  ignoreSettings?: boolean;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions | Partial<Record<ShortcutKey, ShortcutHandler>>) {
  const config = useConfiguration();
  
  // Support both old and new API
  const opts = typeof options === 'function' || !('shortcuts' in options)
    ? { shortcuts: options as Partial<Record<ShortcutKey, ShortcutHandler>>, ignoreSettings: false }
    : options;

  function handleKeyDown(event: KeyboardEvent): void {
    // Check if shortcuts are enabled (unless explicitly ignored)
    if (!opts.ignoreSettings && !config.public.value.enableKeyboardShortcuts) {
      return;
    }

    // Ignore if typing in an input field
    if (shouldIgnoreEvent(event)) return;

    const handler = opts.shortcuts[event.code as ShortcutKey];
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
