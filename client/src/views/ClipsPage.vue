<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useClipFilters } from '../composables/useClipFilters';
import { useInfiniteScroll } from '../composables/useInfiniteScroll';
import { useConfiguration } from '../composables/useConfiguration';
import { useClipHandlers } from '../composables/useClipHandlers';
import type { Clip } from '../types/clip';
import ClipFilters, { type ViewMode } from '../components/App/ClipFilters.vue';
import ClipsDisplay from '../components/App/ClipsDisplay.vue';
import ClipsPaginationControls from '../components/App/ClipsPaginationControls.vue';

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
      <ClipsDisplay
        :clips="clips"
        :view-mode="config.public.value.viewMode"
        :is-empty="isEmpty"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="handleClipDeleted"
      />

      <ClipsPaginationControls
        :loading="loading"
        :has-more="hasMore"
        :has-clips="clips.length > 0"
        @load-more="clipsStore.loadMore()"
      />
    </div>
  </div>
</template>
