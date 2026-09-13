<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCollectionsStore } from '../stores/collections';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useConfiguration } from '../composables/useConfiguration';
import { useClipHandlers } from '../composables/useClipHandlers';
import { useClipListKeyboardShortcuts } from '../composables/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '../composables/useClipListHandlers';
import { scrollToTop } from '../utils/scroll';
import { pluralize } from '../utils/pluralize';
import type { Clip } from '../types/clip';
import ViewModeToggle from '../components/Base/BaseViewModeToggle.vue';
import ClipsDisplay from '../components/App/ClipsDisplay.vue';
import ClipsPaginationControls from '../components/App/ClipsPaginationControls.vue';

const route = useRoute();
const collectionsStore = useCollectionsStore();
const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { getVideoUrl, getThumbUrl } = useClipHandlers();

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

const { handlePageChange, handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onPageChange: (page: number) => collectionsStore.gotoPage(page),
  onClipUpdated: (updatedClip: Clip) => {
    const index = collectionsStore.clipsState.items.findIndex(c => c.id === updatedClip.id);
    if (index !== -1) {
      collectionsStore.clipsState.items[index] = updatedClip;
    }
  },
  onClipDeleted: async () => {
    collectionsStore.resetCollectionClips();
    await Promise.all([
      collectionsStore.fetchCollectionClips(collectionId.value),
      gamesStore.fetchGames()
    ]);
  },
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
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ collection?.name || 'Collection' }}</h1>
          <p class="text-sm text-muted-500 mt-1">{{ total }} {{ pluralize(total, 'clip') }}</p>
        </div>
        
        <ViewModeToggle v-model="config.public.value.viewMode" />
      </div>
    </div>

    <div class="p-6 space-y-6">
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
        :collection-id="collectionId"
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
  </div>
</template>

