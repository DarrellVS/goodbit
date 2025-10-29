<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useClipFilters } from '../composables/useClipFilters';
import { useConfiguration } from '../composables/useConfiguration';
import { useClipHandlers } from '../composables/useClipHandlers';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useClipListKeyboardShortcuts } from '../composables/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '../composables/useClipListHandlers';
import type { Clip } from '../types/clip';
import ClipFilters, { type ViewMode } from '../components/App/ClipFilters.vue';
import ClipsDisplay from '../components/App/ClipsDisplay.vue';
import ClipsPaginationControls from '../components/App/ClipsPaginationControls.vue';
import BatchOperationsToolbar from '../components/App/BatchOperationsToolbar.vue';
import BatchTagDialog from '../components/App/BatchTagDialog.vue';
import BatchCollectionDialog from '../components/App/BatchCollectionDialog.vue';

const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { activeFilter } = useClipFilters();
const { getVideoUrl, getThumbUrl } = useClipHandlers();

const viewMode = computed({
  get: () => config.public.value.viewMode,
  set: (value: ViewMode) => {
    config.public.value.viewMode = value;
  },
});

const clips = computed(() => clipsStore.items);
const total = computed(() => clipsStore.total);
const loading = computed(() => clipsStore.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);
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
} = useBatchOperations({
  clips,
  onClipsUpdated: async () => {
    await Promise.all([
      clipsStore.fetchClips(false),
      gamesStore.fetchGames()
    ]);
  },
});

const { handlePageChange, handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onPageChange: (page: number) => clipsStore.goto(page),
  onClipUpdated: (clip: Clip) => clipsStore.updateClip(clip),
  onClipDeleted: async () => {
    clipsStore.resetPagination();
    await Promise.all([
      clipsStore.fetchClips(false),
      gamesStore.fetchGames()
    ]);
  },
});

useClipListKeyboardShortcuts({
  toggleViewMode: () => {
    viewMode.value = viewMode.value === 'grid' ? 'grouped' : 'grid';
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

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'a' && clips.value.length > 0) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    
    event.preventDefault();
    if (!isSelectionMode.value) {
      enterSelectionMode();
    }
    handleSelectAll();
  }
});

onMounted(() => {
  void clipsStore.fetchClips(false);
});
</script>

<template>
  <div>
    <ClipFilters 
      v-model:active-filter="activeFilter"
      v-model:view-mode="viewMode"
      :total-count="total"
    >
      <template #actions>
        <button
          v-if="!isSelectionMode && clips.length > 0"
          class="px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-2 text-sm font-medium"
          @click="enterSelectionMode"
          title="Select clips (Ctrl+A to select all)"
        >
          <Icon icon="material-symbols:check-box-outline-blank" class="text-base" />
          <span>Select</span>
        </button>
        <button
          v-else-if="isSelectionMode"
          class="px-3 py-1.5 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm font-medium"
          @click="exitSelectionMode"
          title="Exit selection mode (Esc)"
        >
          <Icon icon="material-symbols:close" class="text-base" />
          <span>Cancel</span>
        </button>
      </template>
    </ClipFilters>

    <div class="p-6 space-y-6">
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
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

    <!-- Batch Operations Toolbar -->
    <BatchOperationsToolbar
      v-if="hasSelection"
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
