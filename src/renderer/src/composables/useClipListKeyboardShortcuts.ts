import { computed, type Ref } from 'vue';
import { useClipDetail } from './useClipDetail';
import { useConfiguration } from './useConfiguration';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { scrollToTop, scrollDown, scrollUp } from '../utils/scroll';

interface UseClipListKeyboardShortcutsOptions {
  toggleViewMode: () => void;
  onPageNext?: (event: KeyboardEvent) => void;
  onPagePrevious?: (event: KeyboardEvent) => void;
  canGoNext?: Ref<boolean> | (() => boolean);
  canGoPrevious?: Ref<boolean> | (() => boolean);
  isLoading?: Ref<boolean> | (() => boolean);
  isSelectionMode?: Ref<boolean> | (() => boolean);
}

export function useClipListKeyboardShortcuts(options: UseClipListKeyboardShortcutsOptions): void {
  const config = useConfiguration();

  const canGoNext = computed(() => {
    if (typeof options.canGoNext === 'function') {
      return options.canGoNext();
    }
    return options.canGoNext?.value ?? true;
  });

  const canGoPrevious = computed(() => {
    if (typeof options.canGoPrevious === 'function') {
      return options.canGoPrevious();
    }
    return options.canGoPrevious?.value ?? true;
  });

  const isLoading = computed(() => {
    if (typeof options.isLoading === 'function') {
      return options.isLoading();
    }
    return options.isLoading?.value ?? false;
  });

  const { openClipId } = useClipDetail();

  const isSelectionMode = computed(() => {
    if (typeof options.isSelectionMode === 'function') {
      return options.isSelectionMode();
    }
    return options.isSelectionMode?.value ?? false;
  });

  /*
   * A list behind an open clip is not the list somebody is using.
   *
   * The clip panel opens *over* the library, and the library stays mounted
   * behind it with `ArrowLeft` and `ArrowRight` still bound to paging. So
   * arrow keys inside an open clip were also turning the page underneath it,
   * and the scroll keys were scrolling a list nobody could see. Found while
   * adding frame stepping to the trimmer, which wanted the same two keys and
   * had to take them in the capture phase to get them.
   *
   * Guarding here rather than there fixes it for every view of an open clip
   * and for both pages that show a list, rather than for the one screen that
   * happened to collide.
   *
   * `openClipId` is module-level state, so this reads the same value the
   * modal does. The keys go back to the list the moment it closes.
   */
  const clipIsOpen = computed(() => openClipId.value !== null);
  const listHasTheKeys = computed(
    () => !clipIsOpen.value && !isSelectionMode.value && !isLoading.value,
  );

  useKeyboardShortcuts({
    actions: {
      'toggle-view-mode': () => {
        if (!clipIsOpen.value) options.toggleViewMode();
      },
      'page-next': (event: KeyboardEvent) => {
        if (listHasTheKeys.value && canGoNext.value) {
          event.preventDefault();
          options.onPageNext?.(event);
        }
      },
      'page-previous': (event: KeyboardEvent) => {
        if (listHasTheKeys.value && canGoPrevious.value) {
          event.preventDefault();
          options.onPagePrevious?.(event);
        }
      },
      'scroll-down': () => {
        if (!clipIsOpen.value) scrollDown();
      },
      'scroll-up': () => {
        if (!clipIsOpen.value) scrollUp();
      },
    },
  });
}

