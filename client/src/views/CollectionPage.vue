<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
import { useCollectionsStore } from '../stores/collections';
import { useConfiguration } from '../composables/useConfiguration';
import type { Clip } from '../types/clip';
import ClipsGrid from '../components/App/ClipsGrid.vue';
import ClipsGrouped from '../components/App/ClipsGrouped.vue';
import BaseEmptyState from '../components/Base/BaseEmptyState.vue';
import { Icon } from '@iconify/vue';

const route = useRoute();
const collectionsStore = useCollectionsStore();
const config = useConfiguration();

const collectionId = computed(() => Number(route.params.id));
const clips = computed(() => collectionsStore.currentCollectionClips);
const loading = computed(() => collectionsStore.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);
const collection = computed(() => 
  collectionsStore.items.find(c => c.id === collectionId.value)
);

function handleClipUpdated(updatedClip: Clip): void {
  const index = clips.value.findIndex(c => c.id === updatedClip.id);
  if (index !== -1) {
    clips.value[index] = updatedClip;
  }
}

async function handleClipDeleted(clipId: number): Promise<void> {
  await collectionsStore.removeClipFromCollection(collectionId.value, clipId);
}

function getVideoUrl(clip: Clip): string {
  return videoUrlFor(clip.id, clip.fileModifiedAt);
}

function getThumbUrl(clip: Clip): string {
  return thumbUrlFor(clip.id, clip.fileModifiedAt);
}

onMounted(() => {
  void collectionsStore.fetchCollectionClips(collectionId.value);
});
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-white/60 backdrop-blur-sm border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ collection?.name || 'Collection' }}</h1>
          <p class="text-sm text-muted-500 mt-1">{{ clips.length }} clips</p>
        </div>
        
        <div class="flex items-center gap-2">
          <button
            class="p-2 rounded-lg transition-colors"
            :class="config.public.value.viewMode === 'grid' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
            @click="config.public.value.viewMode = 'grid'"
            title="Grid view"
          >
            <Icon icon="material-symbols:grid-view" class="text-lg" />
          </button>
          <button
            class="p-2 rounded-lg transition-colors"
            :class="config.public.value.viewMode === 'grouped' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
            @click="config.public.value.viewMode = 'grouped'"
            title="Grouped view"
          >
            <Icon icon="material-symbols:view-agenda" class="text-lg" />
          </button>
        </div>
      </div>
    </div>

    <div class="p-6 space-y-6">
      <BaseEmptyState
        v-if="isEmpty"
        icon="material-symbols:folder-open"
        title="No clips in this collection"
        description="Drag and drop clips from your library to add them here."
      />

      <ClipsGrid
        v-else-if="config.public.value.viewMode === 'grid'"
        :clips="clips"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="() => handleClipDeleted"
      />

      <ClipsGrouped
        v-else
        :clips="clips"
        :get-video-url="getVideoUrl"
        :get-thumb-url="getThumbUrl"
        @clip-updated="handleClipUpdated"
        @clip-deleted="() => handleClipDeleted"
      />

      <div v-if="loading" class="flex justify-center py-8">
        <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    </div>
  </div>
</template>

