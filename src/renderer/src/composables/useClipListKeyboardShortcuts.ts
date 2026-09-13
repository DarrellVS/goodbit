import { computed, type Ref } from 'vue';
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

  const isSelectionMode = computed(() => {
    if (typeof options.isSelectionMode === 'function') {
      return options.isSelectionMode();
    }
    return options.isSelectionMode?.value ?? false;
  });

  useKeyboardShortcuts({
    actions: {
      'toggle-view-mode': options.toggleViewMode,
      'page-next': (event: KeyboardEvent) => {
        if (!isSelectionMode.value && canGoNext.value && !isLoading.value) {
          event.preventDefault();
          options.onPageNext?.(event);
        }
      },
      'page-previous': (event: KeyboardEvent) => {
        if (!isSelectionMode.value && canGoPrevious.value && !isLoading.value) {
          event.preventDefault();
          options.onPagePrevious?.(event);
        }
      },
      'scroll-down': () => scrollDown(),
      'scroll-up': () => scrollUp(),
    },
  });
}

