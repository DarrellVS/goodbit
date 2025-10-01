<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useClipFilters } from '../composables/useClipFilters';
import type { Clip } from '../types/clip';
import ClipFilters from '../components/App/ClipFilters.vue';
import ClipsGrid from '../components/App/ClipsGrid.vue';
import BaseEmptyState from '../components/Base/BaseEmptyState.vue';
import BasePagination from '../components/Base/BasePagination.vue';

const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const { activeFilter } = useClipFilters();

const clips = computed(() => clipsStore.items);
const total = computed(() => clipsStore.total);
const currentPage = computed(() => clipsStore.page);
const totalPages = computed(() => clipsStore.totalPages);
const hasNextPage = computed(() => clipsStore.hasNextPage);
const hasPreviousPage = computed(() => clipsStore.hasPreviousPage);
const loading = computed(() => clipsStore.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);
const shouldShowPagination = computed(() => totalPages.value > 1);

function handleClipUpdated(updatedClip: Clip): void {
  clipsStore.updateClip(updatedClip);
}

async function handleClipDeleted(): Promise<void> {
  await Promise.all([
    clipsStore.fetchClips(),
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
  void clipsStore.fetchClips();
});
</script>

<template>
  <div>
    <ClipFilters 
      v-model:active-filter="activeFilter"
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
        v-else
        :clips="clips"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="handleClipDeleted"
      />

      <BasePagination
        v-if="shouldShowPagination"
        :current-page="currentPage"
        :total-pages="totalPages"
        :has-next="hasNextPage"
        :has-previous="hasPreviousPage"
        @next="clipsStore.nextPage()"
        @previous="clipsStore.previousPage()"
      />
    </div>
  </div>
</template>
