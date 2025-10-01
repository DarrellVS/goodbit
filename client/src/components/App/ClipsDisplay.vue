<script setup lang="ts">
import type { Clip } from '../../types/clip';
import ClipsGrid from './ClipsGrid.vue';
import ClipsGrouped from './ClipsGrouped.vue';
import BaseEmptyState from '../Base/BaseEmptyState.vue';

interface Props {
  clips: Clip[];
  viewMode: 'grid' | 'grouped';
  isEmpty: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
  collectionId?: number;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

withDefaults(defineProps<Props>(), {
  emptyIcon: 'material-symbols:video-library',
  emptyTitle: 'No clips found',
  emptyDescription: 'Try adjusting your filters or adding some clips to your library.',
});

const emit = defineEmits<Emits>();
</script>

<template>
  <BaseEmptyState
    v-if="isEmpty"
    :icon="emptyIcon"
    :title="emptyTitle"
    :description="emptyDescription"
  />

  <ClipsGrid
    v-else-if="viewMode === 'grid'"
    :clips="clips"
    :get-video-url="getVideoUrl"
    :get-thumb-url="getThumbUrl"
    :collection-id="collectionId"
    @clip-updated="emit('clip-updated', $event)"
    @clip-deleted="emit('clip-deleted')"
  />

  <ClipsGrouped
    v-else
    :clips="clips"
    :get-video-url="getVideoUrl"
    :get-thumb-url="getThumbUrl"
    :collection-id="collectionId"
    @clip-updated="emit('clip-updated', $event)"
    @clip-deleted="emit('clip-deleted')"
  />
</template>

