import { computed, type Ref } from 'vue';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useCollectionDetail } from '@renderer/composables/library/useCollectionDetail';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useKeyboardShortcuts } from '@renderer/composables/ui/useKeyboardShortcuts';
import { scrollDown, scrollUp } from '@renderer/utils/scroll';

interface UseClipListKeyboardShortcutsOptions {
  toggleViewMode: () => void;
  onPageNext?: (event: KeyboardEvent) => void;
  onPagePrevious?: (event: KeyboardEvent) => void;
  canGoNext?: Ref<boolean> | (() => boolean);
  canGoPrevious?: Ref<boolean> | (() => boolean);
  isLoading?: Ref<boolean> | (() => boolean);
  isSelectionMode?: Ref<boolean> | (() => boolean);
  /**
   * This list is itself in a layer over the library.
   *
   * The collection layer shows a second clip list while the library's one is
   * still mounted underneath, so without this both would answer the arrow
   * keys and both would turn a page. The rule is not symmetric: a list in a
   * layer keeps the keys while a collection is open, because it *is* the open
   * collection, and a list on the page underneath gives them up.
   */
  inLayer?: boolean;
  /**
   * What the scroll keys should scroll.
   *
   * The page's own list scrolls `main`, which is what the scroll helpers
   * default to. A list inside a layer scrolls the layer's own container, and
   * scrolling `main` from in there moves a list nobody can see, which is the
   * same bug as the arrow keys had.
   */
  scrollTarget?: Ref<HTMLElement | null>;
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

  const { openCollectionId } = useCollectionDetail();

  /*
   * A list behind an open layer is not the list somebody is using.
   *
   * The clip panel opens *over* the library, and the library stays mounted
   * behind it with `ArrowLeft` and `ArrowRight` still bound to paging. So
   * arrow keys inside an open clip were also turning the page underneath it,
   * and the scroll keys were scrolling a list nobody could see. Found while
   * adding frame stepping to the trimmer, which wanted the same two keys and
   * had to take them in the capture phase to get them.
   *
   * Guarding here rather than there fixes it for every view of an open clip
   * and for every list, rather than for the one screen that happened to
   * collide. The collection layer is the second such list and needed nothing
   * new except a direction: a clip covers every list, including the one
   * inside the collection layer, while a collection covers only the lists on
   * the page underneath it. `inLayer` says which side of that a caller is on.
   *
   * Both ids are module level state, so this reads the same values the layers
   * do, and the keys go back the moment one closes.
   */
  const coveredUp = computed(
    () => openClipId.value !== null || (!options.inLayer && openCollectionId.value !== null),
  );
  const listHasTheKeys = computed(
    () => !coveredUp.value && !isSelectionMode.value && !isLoading.value,
  );

  useKeyboardShortcuts({
    actions: {
      'toggle-view-mode': () => {
        if (!coveredUp.value) options.toggleViewMode();
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
        if (!coveredUp.value) scrollDown(options.scrollTarget?.value);
      },
      'scroll-up': () => {
        if (!coveredUp.value) scrollUp(options.scrollTarget?.value);
      },
    },
  });
}

