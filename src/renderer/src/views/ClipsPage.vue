<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useClipFilters } from '../composables/useClipFilters';
import { useConfiguration } from '../composables/useConfiguration';
import { useClipHandlers } from '../composables/useClipHandlers';
import { preserveScrollPosition } from '../utils/scroll';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useClipListKeyboardShortcuts } from '../composables/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '../composables/useClipListHandlers';
import { useLibraryRescan } from '../composables/useLibraryRescan';
import { useSelectAllShortcut } from '../composables/useSelectAllShortcut';
import type { Clip } from '../types/clip';
import ClipFilters from '../components/App/ClipFilters.vue';
import CollectionsRow from '../components/App/CollectionsRow.vue';
import ObsNotReadyBanner from '../components/App/ObsNotReadyBanner.vue';
import ClipsDisplay from '../components/App/ClipsDisplay.vue';
import ClipsPaginationControls from '../components/App/ClipsPaginationControls.vue';
import FloatingControlsBar from '../components/App/FloatingControlsBar.vue';
import BatchTagDialog from '../components/App/BatchTagDialog.vue';
import BatchCollectionDialog from '../components/App/BatchCollectionDialog.vue';

const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { activeFilter } = useClipFilters();
const { getVideoUrl, getThumbUrl } = useClipHandlers();
const { rescan } = useLibraryRescan();

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
    Boolean(clipsStore.selectedGame) ||
    activeFilter.value !== 'videos',
);

const emptyState = computed(() => {
  if (clipsStore.searchText) {
    return {
      icon: 'material-symbols:search-off',
      title: `Nothing matches “${clipsStore.searchText}”`,
      description: 'Search looks at clip names, the dates in them, and your tags.',
      actionLabel: 'Clear the search',
    };
  }

  if (activeFilter.value === 'starred') {
    return {
      icon: 'material-symbols:star-outline',
      title: 'Nothing starred yet',
      description: 'Hover a clip and press the star to keep it here.',
      actionLabel: 'Show every clip',
    };
  }

  if (activeFilter.value === 'published' || activeFilter.value === 'not-published') {
    return {
      icon: 'material-symbols:cloud-off',
      title:
        activeFilter.value === 'published' ? 'Nothing published yet' : 'Everything here is published',
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
    clipsStore.setSearch('');
    return;
  }
  if (narrowed.value) {
    activeFilter.value = 'videos';
    clipsStore.setGame('');
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
const currentPage = computed(() => clipsStore.page);
const totalPages = computed(() => clipsStore.totalPages);

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

const { handlePageChange, handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onPageChange: (page: number) => clipsStore.goto(page),
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

useClipListKeyboardShortcuts({
  toggleViewMode: () => {
    config.public.value.viewMode = config.public.value.viewMode === 'grid' ? 'grouped' : 'grid';
  },
  onPageNext: () => handlePageChange(currentPage.value + 1),
  onPagePrevious: () => handlePageChange(currentPage.value - 1),
  canGoNext: computed(() => clipsStore.hasNextPage),
  canGoPrevious: computed(() => clipsStore.hasPreviousPage),
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
  selectAll: handleSelectAll,
});

onMounted(() => {
  void clipsStore.fetchClips(false);
});
</script>

<template>
  <div>
    <ClipFilters
      v-model:active-filter="activeFilter"
      :total-count="total"
      :is-selection-mode="isSelectionMode"
      @enter-selection="enterSelectionMode"
      @exit-selection="exitSelectionMode"
    />

    <!--
      Why the library is empty, said where the emptiness is. Settings has the
      whole diagnostic, but nobody opens Settings to find out why nothing is
      happening.
    -->
    <ObsNotReadyBanner />

    <!--
      No `pb-16` any more. It was there to keep the last row of clips out from
      under a bar that was on screen whether or not it had anything to say; the
      bar it makes room for now only exists while there is a selection, and a
      selection is something you just made.
    -->
    <div class="p-6 space-y-6">
      <!--
        Collections come before the clips, because a collection is a way of
        looking at them.
      -->
      <CollectionsRow />

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

      <ClipsPaginationControls
        :loading="loading"
        :current-page="currentPage"
        :total-pages="totalPages"
        :total="total"
        :has-clips="clips.length > 0"
        @page-change="handlePageChange"
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
