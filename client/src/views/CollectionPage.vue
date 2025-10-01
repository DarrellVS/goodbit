<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCollectionsStore } from '../stores/collections';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useConfiguration } from '../composables/useConfiguration';
import { useInfiniteScroll } from '../composables/useInfiniteScroll';
import { useClipHandlers } from '../composables/useClipHandlers';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import type { Clip } from '../types/clip';
import ViewModeToggle from '../components/App/ViewModeToggle.vue';
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
const hasMore = computed(() => collectionsStore.hasNextPage);
const collection = computed(() => 
  collectionsStore.items.find(c => c.id === collectionId.value)
);

useInfiniteScroll({
  onLoadMore: () => collectionsStore.loadMoreCollectionClips(),
  enabled: () => hasMore.value && !loading.value,
});

function handleClipUpdated(updatedClip: Clip): void {
  const index = collectionsStore.clipsState.items.findIndex(c => c.id === updatedClip.id);
  if (index !== -1) {
    collectionsStore.clipsState.items[index] = updatedClip;
  }
}

async function handleClipDeleted(): Promise<void> {
  collectionsStore.resetCollectionClips();
  await Promise.all([
    collectionsStore.fetchCollectionClips(collectionId.value),
    gamesStore.fetchGames()
  ]);
}

onMounted(() => {
  void collectionsStore.fetchCollectionClips(collectionId.value);
});

// Watch for collection ID changes (navigating between collections)
watch(collectionId, (newId) => {
  collectionsStore.resetCollectionClips();
  void collectionsStore.fetchCollectionClips(newId);
  
  // Scroll to top when switching collections
  const mainElement = document.querySelector('main');
  if (mainElement) {
    mainElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Watch for filter changes
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

useKeyboardShortcuts({
  shortcuts: {
    KeyL: () => {
      config.public.value.viewMode = config.public.value.viewMode === 'grid' ? 'grouped' : 'grid';
    },
    Space: (event) => {
      if (hasMore.value && !loading.value) {
        event.preventDefault();
        collectionsStore.loadMoreCollectionClips();
      }
    },
    ArrowDown: () => {
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.scrollBy({ top: 300, behavior: 'smooth' });
      }
    },
    ArrowUp: () => {
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.scrollBy({ top: -300, behavior: 'smooth' });
      }
    },
  },
});
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-white/60 backdrop-blur-sm border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ collection?.name || 'Collection' }}</h1>
          <p class="text-sm text-muted-500 mt-1">{{ total }} clip{{ total === 1 ? '' : 's' }}</p>
        </div>
        
        <ViewModeToggle v-model="config.public.value.viewMode" />
      </div>
    </div>

    <div class="p-6 space-y-6">
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
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
        :has-more="hasMore"
        :has-clips="clips.length > 0"
        @load-more="collectionsStore.loadMoreCollectionClips()"
      />
    </div>
  </div>
</template>

