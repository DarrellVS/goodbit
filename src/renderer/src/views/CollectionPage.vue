<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCollectionsStore } from '../stores/collections';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useConfiguration } from '../composables/useConfiguration';
import { useClipHandlers } from '../composables/useClipHandlers';
import { useClipFilters } from '../composables/useClipFilters';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useClipListKeyboardShortcuts } from '../composables/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '../composables/useClipListHandlers';
import { useSelectAllShortcut } from '../composables/useSelectAllShortcut';
import { scrollToTop } from '../utils/scroll';
import type { Clip } from '../types/clip';
import ClipFilters from '../components/App/ClipFilters.vue';
import ClipsDisplay from '../components/App/ClipsDisplay.vue';
import ClipsPaginationControls from '../components/App/ClipsPaginationControls.vue';
import FloatingControlsBar from '../components/App/FloatingControlsBar.vue';
import BatchTagDialog from '../components/App/BatchTagDialog.vue';
import BatchCollectionDialog from '../components/App/BatchCollectionDialog.vue';

/**
 * A collection, which is a list of clips and should behave like one.
 *
 * It had a view mode toggle of its own and no selection at all, which is the
 * wrong way round twice over: the view mode is one stored value with five ways
 * to set it, and this is the screen where acting on ten clips at once is most
 * obviously wanted, since "take these out of this collection" cannot be said
 * anywhere else. So the toggle is gone, the filter row is the library's own,
 * and the batch toolbar is the same component the library uses.
 */
const route = useRoute();
const collectionsStore = useCollectionsStore();
const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { getVideoUrl, getThumbUrl } = useClipHandlers();
const { activeFilter } = useClipFilters();

const collectionId = computed(() => Number(route.params.id));
const clips = computed(() => collectionsStore.clipsState.items);
const total = computed(() => collectionsStore.clipsState.total);
const loading = computed(() => collectionsStore.clipsState.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);
const currentPage = computed(() => collectionsStore.clipsState.page);
const totalPages = computed(() => collectionsStore.totalPages);
const collection = computed(() =>
  collectionsStore.items.find(c => c.id === collectionId.value)
);

async function reload(): Promise<void> {
  collectionsStore.resetCollectionClips();
  await Promise.all([
    collectionsStore.fetchCollectionClips(collectionId.value),
    gamesStore.fetchGames(),
  ]);
}

const { handlePageChange, handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onPageChange: (page: number) => collectionsStore.gotoPage(page),
  onClipUpdated: (updatedClip: Clip) => {
    const index = collectionsStore.clipsState.items.findIndex(c => c.id === updatedClip.id);
    if (index !== -1) {
      collectionsStore.clipsState.items[index] = updatedClip;
    }
  },
  onClipDeleted: reload,
});

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
  handleBatchRemoveFromCollection,
  handleOpenInEditor,
} = useBatchOperations({
  clips,
  // The one option the library does not pass, and the reason the toolbar grows
  // a Remove from Collection entry. Passed as the ref, since this component is
  // reused when the route's id changes.
  collectionId,
  onClipsUpdated: reload,
});

useClipListKeyboardShortcuts({
  toggleViewMode: () => {
    config.public.value.viewMode = config.public.value.viewMode === 'grid' ? 'grouped' : 'grid';
  },
  onPageNext: () => handlePageChange(currentPage.value + 1),
  onPagePrevious: () => handlePageChange(currentPage.value - 1),
  canGoNext: computed(() => collectionsStore.hasNextPage),
  canGoPrevious: computed(() => collectionsStore.hasPreviousPage),
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
  void collectionsStore.fetchCollectionClips(collectionId.value);
});

watch(collectionId, (newId) => {
  collectionsStore.resetCollectionClips();
  void collectionsStore.fetchCollectionClips(newId);
  scrollToTop();
});

watch([
  () => clipsStore.selectedGame,
  () => clipsStore.searchText,
  () => clipsStore.selectedTags,
  () => clipsStore.publishedFilter,
  () => clipsStore.starredFilter,
], () => {
  collectionsStore.resetCollectionClips();
  void collectionsStore.fetchCollectionClips(collectionId.value);
});
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-card/60 backdrop-blur-sm border-b border-border px-6 py-4">
      <!--
        The name, and nothing else. The count used to be under it and is in the
        filter row now, which is where it is on every other screen.
      -->
      <h1 class="text-2xl font-bold">{{ collection?.name || 'Collection' }}</h1>
    </div>

    <ClipFilters
      v-model:active-filter="activeFilter"
      :total-count="total"
      :is-selection-mode="isSelectionMode"
      :sortable="false"
      @enter-selection="enterSelectionMode"
      @exit-selection="exitSelectionMode"
    />

    <div class="p-6 space-y-6">
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
        :collection-id="collectionId"
        :is-selection-mode="isSelectionMode"
        empty-icon="material-symbols:folder-open"
        empty-title="No clips in this collection"
        empty-description="Drag and drop clips from your library to add them here."
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
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

    <FloatingControlsBar
      :has-selection="hasSelection"
      :selected-count="selectedCount"
      :selected-clips="selectedClips"
      :collection-id="collectionId"
      @deselect-all="deselectAll"
      @delete="handleBatchDelete"
      @add-to-collection="showCollectionDialog = true"
      @remove-from-collection="handleBatchRemoveFromCollection"
      @publish="handleBatchPublish"
      @unpublish="handleBatchUnpublish"
      @star="handleBatchStar"
      @unstar="handleBatchUnstar"
      @add-tags="showTagDialog = true"
      @open-in-editor="handleOpenInEditor"
    />

    <BatchTagDialog
      v-model:open="showTagDialog"
      :selected-count="selectedCount"
      @add-tags="handleBatchAddTags"
    />

    <BatchCollectionDialog
      v-model:open="showCollectionDialog"
      :selected-count="selectedCount"
      @add-to-collection="handleBatchAddToCollection"
    />
  </div>
</template>
