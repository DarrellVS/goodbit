import { onMounted, onBeforeUnmount } from 'vue';

type ShortcutKey = 'Space' | 'ArrowLeft' | 'ArrowRight' | 'Delete' | 'Escape';

type ShortcutHandler = () => void;

export function useKeyboardShortcuts(shortcuts: Partial<Record<ShortcutKey, ShortcutHandler>>) {
  function handleKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreEvent(event)) return;

    const handler = shortcuts[event.code as ShortcutKey];
    if (!handler) return;

    if (event.code === 'Space') {
      event.preventDefault();
    }

    handler();
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
