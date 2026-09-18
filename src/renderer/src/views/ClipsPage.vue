<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useClipsStore } from '@renderer/stores/clips';
import { useToastStore } from '@renderer/stores/toast';
import { useGamesStore } from '@renderer/stores/games';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useClipHandlers } from '@renderer/composables/clips/useClipHandlers';
import { preserveScrollPosition } from '@renderer/utils/scroll';
import { useKeyboardShortcuts } from '@renderer/composables/ui/useKeyboardShortcuts';
import { useBatchOperations } from '@renderer/composables/library/useBatchOperations';
import { useClipListKeyboardShortcuts } from '@renderer/composables/library/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '@renderer/composables/library/useClipListHandlers';
import { useLibraryRescan } from '@renderer/composables/library/useLibraryRescan';
import { useSelectAllShortcut } from '@renderer/composables/ui/useSelectAllShortcut';
import { useScrolledPage } from '@renderer/composables/ui/useScrolledPage';
import type { Clip } from '@renderer/types/clip';
import ClipFilters from '@renderer/components/Library/ClipFilters.vue';
import CollectionsRow from '@renderer/components/Collection/CollectionsRow.vue';
import ClipsDisplay from '@renderer/components/Library/ClipsDisplay.vue';
import ClipsListFooter from '@renderer/components/Library/ClipsListFooter.vue';
import FloatingControlsBar from '@renderer/components/Library/FloatingControlsBar.vue';
import BatchTagDialog from '@renderer/components/Library/BatchTagDialog.vue';
import BatchCollectionDialog from '@renderer/components/Library/BatchCollectionDialog.vue';

const clipsStore = useClipsStore();
const toastStore = useToastStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { getVideoUrl, getThumbUrl } = useClipHandlers();
const { rescan } = useLibraryRescan();

/** The shell follows the scroll; this row only reads it. */
const { scrolled } = useScrolledPage();

const clips = computed(() => clipsStore.items);
const total = computed(() => clipsStore.total);
const loading = computed(() => clipsStore.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);

/**
 * Which kind of nothing this is.
 *
 * One message used to cover three situations, and it told somebody with
 * forty-one clips to "try adding some clips to your library". Each of these
 * has a different cause and a different way out, so each says its own.
 */
const narrowed = computed(
  () =>
    Boolean(clipsStore.searchText) ||
    clipsStore.selectedTags.length > 0 ||
    clipsStore.selectedGames.length > 0 ||
    clipsStore.starredFilter ||
    clipsStore.publishedFilter !== null,
);

const emptyState = computed(() => {
  if (clipsStore.searchText) {
    /*
     * Say when a filter is why, because the search is not always why.
     *
     * With a game selected in the sidebar, searching for a clip in a different
     * game says "Nothing matches" and offers "Clear the search", which does not
     * clear the game. A walkthrough user searching `ready` while filtered to
     * Satisfactory was told nothing matched and would reasonably have concluded
     * they had no Ready Or Not clips at all.
     */
    const alsoNarrowing = [
      clipsStore.selectedGames.length === 1
        ? `the ${clipsStore.selectedGames[0]} filter`
        : clipsStore.selectedGames.length > 1
          ? `your ${clipsStore.selectedGames.length} game filters`
          : null,
      clipsStore.selectedTags.length > 0
        ? `${clipsStore.selectedTags.length === 1 ? 'a tag filter' : 'your tag filters'}`
        : null,
    ].filter(Boolean) as string[];

    return {
      icon: 'material-symbols:search-off',
      title: `Nothing matches “${clipsStore.searchText}”`,
      description: alsoNarrowing.length
        ? `${alsoNarrowing.join(' and ')} ${alsoNarrowing.length === 1 ? 'is' : 'are'} narrowing this too. Search looks at clip names, the dates in them, and your tags.`
        : 'Search looks at clip names, the dates in them, and your tags.',
      actionLabel: alsoNarrowing.length ? 'Clear the search and filters' : 'Clear the search',
    };
  }

  if (clipsStore.starredFilter) {
    return {
      icon: 'material-symbols:star-outline',
      title: 'Nothing starred yet',
      description: 'Hover a clip and press the star to keep it here.',
      actionLabel: 'Show every clip',
    };
  }

  if (clipsStore.publishedFilter !== null) {
    return {
      icon: 'material-symbols:cloud-off',
      title:
        clipsStore.publishedFilter ? 'Nothing published yet' : 'Everything here is published',
      description:
        'Publishing puts a copy behind a public link, and needs a publisher set up under Settings, Connections.',
      actionLabel: 'Show every clip',
    };
  }

  if (narrowed.value) {
    return {
      icon: 'material-symbols:filter-alt-off',
      title: 'Nothing left after those filters',
      description: 'The clips are still there. The filters on this screen are hiding them.',
      actionLabel: 'Clear the filters',
    };
  }

  return {
    icon: 'material-symbols:video-library',
    title: 'No clips yet',
    description:
      'Record something in OBS into your clips folder and it turns up here on its own. If clips are already there, a scan will find them.',
    actionLabel: 'Scan the folder',
  };
});

function handleEmptyAction(): void {
  if (clipsStore.searchText) {
    // The label promises the filters too when they are part of the reason, so
    // clearing only the search would leave the same empty screen behind.
    clipsStore.setSearch('');
    if (clipsStore.selectedGames.length > 0 || clipsStore.selectedTags.length > 0) {
      clipsStore.setGames([]);
      clipsStore.setTags([]);
    }
    return;
  }
  if (narrowed.value) {
    clipsStore.setStarredFilter(false);
    clipsStore.setPublishedFilter(null);
    clipsStore.setGames([]);
    clipsStore.setTags([]);
    return;
  }
  /*
   * The button says Scan the folder, so it scans the folder.
   *
   * It called `fetchClips` and asked the same question of the same table
   * again, which on an empty library is the one case where the answer cannot
   * change. Rescan is in Settings now; this is the other place it is the
   * obvious thing to do.
   */
  void rescan();
}
/**
 * Whether there is more than what is on screen, and how much.
 *
 * `total` is what the filters match, `clips.length` is what has been fetched.
 * The difference is the whole of what the page bar used to be for.
 */
const hasMore = computed(() => clipsStore.hasMore);

/**
 * Selecting everything means everything *on screen*, and says so.
 *
 * With a page bar, "select all" and "the page" were the same set, so the count
 * in the toolbar was the whole truth. Scrolling breaks that: the same keystroke
 * selects a different number of clips depending on how far somebody happened to
 * get, and the next thing they press is often Delete. So it says what it did
 * whenever there is more that it did not touch.
 */
function selectAllOnScreen(): void {
  handleSelectAll();

  if (hasSelection.value && hasMore.value) {
    toastStore.info(
      `${selectedCount.value} on screen are selected. ` +
        `${total.value - clips.value.length} more match these filters and are not loaded yet.`,
      'Selected what is loaded',
    );
  }
}

const {
  isSelectionMode,
  selectedCount,
  hasSelection,
  selectedClips,
  showTagDialog,
  showCollectionDialog,
  enterSelectionMode,
  exitSelectionMode,
  deselectAll,
  handleSelectAll,
  handleBatchDelete,
  handleBatchPublish,
  handleBatchUnpublish,
  handleBatchStar,
  handleBatchUnstar,
  handleBatchAddTags,
  handleBatchAddToCollection,
  handleOpenInEditor,
} = useBatchOperations({
  clips,
  onClipsUpdated: () => preserveScrollPosition(async () => {
    await Promise.all([
      clipsStore.fetchClips(false),
      gamesStore.fetchGames()
    ]);
  }),
});

const { handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onClipUpdated: (clip: Clip) => clipsStore.updateClip(clip),
  onClipDeleted: () => {
    return preserveScrollPosition(async () => {
      await Promise.all([
        clipsStore.fetchClips(false),
        gamesStore.fetchGames()
      ]);
    });
  },
});

/*
 * No page keys here any more.
 *
 * There are no pages to turn: the list grows downwards and the scroll keys
 * already move through it. `onPageNext` is left unwired rather than bound to
 * `loadMore`, because a key that quietly fetched more would be a different
 * promise from one that jumped a page, and the scroll it would need to follow
 * is the thing the wheel already does.
 */
useClipListKeyboardShortcuts({
  toggleViewMode: () => {
    config.public.value.viewMode = config.public.value.viewMode === 'grid' ? 'grouped' : 'grid';
  },
  isLoading: loading,
  isSelectionMode,
});

useKeyboardShortcuts({
  actions: {
    'exit-selection': () => {
      if (isSelectionMode.value) {
        exitSelectionMode();
      }
    },
  },
});

useSelectAllShortcut({
  clips,
  isSelectionMode,
  enterSelectionMode,
  selectAll: selectAllOnScreen,
});

/**
 * The next page, on the end of this one.
 *
 * The store owns the page number and the guard, so this is only the place the
 * failure is reported: a swallowed rejection here is a list that silently
 * stops growing.
 */
async function loadMore(): Promise<void> {
  try {
    await clipsStore.loadMore();
  } catch {
    toastStore.error('Could not load any more clips');
  }
}

onMounted(() => {
  void clipsStore.fetchClips(false);
});
</script>

<template>
  <div>
    <!--
      What describes the list, and what narrows it, pinned to the top.

      The two rows in here answer "which clips am I looking at" and they are
      the two rows somebody scrolls past first and then wants back. So they
      stick, and they shrink as they go: the filter row loses its top padding
      and the collections lose their heading and their second line, which is
      about ninety pixels of chrome returned to the clips.

      One band rather than two sticky elements, because the second would need
      to know the first's height to offset itself, and the first's height is
      the thing that changes. One `border-b` at the bottom of the whole band,
      so `ClipFilters` goes in `flush` and the band supplies the padding it
      would have brought.
    -->
    <div
      class="sticky top-0 z-30 bg-background border-b border-border transition-[padding] duration-200 ease-out"
      :class="scrolled ? 'pt-2' : 'pt-7'"
    >
      <ClipFilters
        flush
        :total-count="total"
        :selected-games="clipsStore.selectedGames"
        :is-selection-mode="isSelectionMode"
        @update:selected-games="clipsStore.setGames($event)"
        @enter-selection="enterSelectionMode"
        @exit-selection="exitSelectionMode"
      />

      <!--
        Collections come before the clips, because a collection is a way of
        looking at them.
      -->
      <CollectionsRow class="px-12 pb-4" :compact="scrolled" />
    </div>

    <!--
      No `pb-16` any more. It was there to keep the last row of clips out from
      under a bar that was on screen whether or not it had anything to say; the
      bar it makes room for now only exists while there is a selection, and a
      selection is something you just made.
    -->
    <div class="px-12 py-6 space-y-6">
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
        :empty-icon="emptyState.icon"
        :empty-title="emptyState.title"
        :empty-description="emptyState.description"
        :empty-action-label="emptyState.actionLabel"
        @empty-action="handleEmptyAction"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        :is-selection-mode="isSelectionMode"
        @clip-updated="handleClipUpdated"
        @clip-deleted="handleClipDeleted"
      />

      <ClipsListFooter
        :loading="loading"
        :has-more="hasMore"
        :loaded="clips.length"
        :total="total"
        @load-more="loadMore"
      />
    </div>

    <!-- The batch toolbar, which is all the floating bar is now -->
    <FloatingControlsBar
      :has-selection="hasSelection"
      :selected-count="selectedCount"
      :selected-clips="selectedClips"
      @deselect-all="deselectAll"
      @delete="handleBatchDelete"
      @add-to-collection="showCollectionDialog = true"
      @publish="handleBatchPublish"
      @unpublish="handleBatchUnpublish"
      @star="handleBatchStar"
      @unstar="handleBatchUnstar"
      @add-tags="showTagDialog = true"
      @open-in-editor="handleOpenInEditor"
    />

    <!-- Batch Tag Dialog -->
    <BatchTagDialog
      v-model:open="showTagDialog"
      :selected-count="selectedCount"
      @add-tags="handleBatchAddTags"
    />

    <!-- Batch Collection Dialog -->
    <BatchCollectionDialog
      v-model:open="showCollectionDialog"
      :selected-count="selectedCount"
      @add-to-collection="handleBatchAddToCollection"
    />
  </div>
</template>
