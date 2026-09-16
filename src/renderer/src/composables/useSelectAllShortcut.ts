import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import type { Clip } from '../types/clip';

interface UseSelectAllShortcutOptions {
  clips: Ref<Clip[]>;
  isSelectionMode: Ref<boolean>;
  enterSelectionMode: () => void;
  selectAll: () => void;
}

/**
 * Ctrl+A over a list of clips, wherever one is shown.
 *
 * Two reasons this is not in the shortcut registry with the rest: it matches on
 * `event.code` alone with no notion of modifiers, so a bare A would fire it,
 * and it has to stand down inside a text field, where Ctrl+A means the text.
 * `ShellLayout.vue` carries Ctrl+K for the same reason.
 *
 * It is a composable rather than the loose listener it used to be. The library
 * page registered one during setup and never removed it, so after visiting the
 * library once, Ctrl+A anywhere in the app still entered selection mode and
 * selected every clip the *library* was holding: on a collection that put a
 * selection toolbar over clips that were not the ones on screen. Mounting and
 * unmounting with the page that owns the list is the fix, and it is what let
 * the collection layer have the shortcut at all.
 */
export function useSelectAllShortcut(options: UseSelectAllShortcutOptions): void {
  function handle(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key !== 'a' && event.key !== 'A') return;
    if (!options.clips.value.length) return;

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    event.preventDefault();
    if (!options.isSelectionMode.value) options.enterSelectionMode();
    options.selectAll();
  }

  onMounted(() => document.addEventListener('keydown', handle));
  onBeforeUnmount(() => document.removeEventListener('keydown', handle));
}
