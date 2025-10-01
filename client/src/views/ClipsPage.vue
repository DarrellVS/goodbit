<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useClipFilters } from '../composables/useClipFilters';
import { useInfiniteScroll } from '../composables/useInfiniteScroll';
import { useConfiguration } from '../composables/useConfiguration';
import type { Clip } from '../types/clip';
import ClipFilters, { type ViewMode } from '../components/App/ClipFilters.vue';
import ClipsGrid from '../components/App/ClipsGrid.vue';
import ClipsGrouped from '../components/App/ClipsGrouped.vue';
import BaseEmptyState from '../components/Base/BaseEmptyState.vue';

const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { activeFilter } = useClipFilters();
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
const hasMore = computed(() => clipsStore.hasNextPage);

useInfiniteScroll({
  onLoadMore: () => clipsStore.loadMore(),
  enabled: () => hasMore.value && !loading.value,
});

function handleClipUpdated(updatedClip: Clip): void {
  clipsStore.updateClip(updatedClip);
}

async function handleClipDeleted(): Promise<void> {
  clipsStore.resetPagination();
  await Promise.all([
    clipsStore.fetchClips(false),
    gamesStore.fetchGames()
  ]);
}

function getVideoUrl(clip: Clip): string {
  return videoUrlFor(clip.id, clip.fileModifiedAt);
}

function getThumbUrl(clip: Clip): string {
  return thumbUrlFor(clip.id, clip.fileModifiedAt);
}

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
    />

    <div class="p-6 space-y-6">
      <BaseEmptyState
        v-if="isEmpty"
        icon="material-symbols:video-library"
        title="No clips found"
        description="Try adjusting your filters or adding some clips to your library."
      />

      <ClipsGrid
        v-else-if="config.public.value.viewMode === 'grid'"
        :clips="clips"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="handleClipDeleted"
      />

      <ClipsGrouped
        v-else
        :clips="clips"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="handleClipDeleted"
      />

      <div v-if="loading" class="flex justify-center py-8">
        <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
      </div>

      <div v-else-if="hasMore && clips.length > 0" class="flex justify-center py-8">
        <button
          class="px-6 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2"
          @click="clipsStore.loadMore()"
        >
          <Icon icon="material-symbols:expand-more" class="text-xl" />
          <span>Load More</span>
        </button>
      </div>

      <div v-else-if="!hasMore && clips.length > 0" class="text-center py-8 text-sm text-gray-400">
        No more clips to load
      </div>
    </div>
  </div>
</template>
