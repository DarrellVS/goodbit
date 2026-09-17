<script setup lang="ts">
import type { Clip } from '@renderer/types/clip';
import ClipsGrid from './ClipsGrid.vue';
import ClipsGrouped from './ClipsGrouped.vue';
import BaseEmptyState from '@renderer/components/Base/BaseEmptyState.vue';

interface Props {
  clips: Clip[];
  viewMode: 'grid' | 'grouped';
  isEmpty: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
  collectionId?: number;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
  (e: 'empty-action'): void;
}

withDefaults(defineProps<Props>(), {
  emptyIcon: 'material-symbols:video-library',
  emptyTitle: 'No clips found',
  emptyDescription: 'Try adjusting your filters or adding some clips to your library.',
  emptyActionLabel: '',
  isSelectionMode: false,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <BaseEmptyState
    v-if="isEmpty"
    :icon="emptyIcon"
    :title="emptyTitle"
    :description="emptyDescription"
    :action-label="emptyActionLabel"
    @action="emit('empty-action')"
  />

  <ClipsGrid
    v-else-if="viewMode === 'grid'"
    :clips="clips"
    :get-video-url="getVideoUrl"
    :get-thumb-url="getThumbUrl"
    :collection-id="collectionId"
    :is-selection-mode="isSelectionMode"
    @clip-updated="emit('clip-updated', $event)"
    @clip-deleted="emit('clip-deleted')"
  />

  <ClipsGrouped
    v-else
    :clips="clips"
    :get-video-url="getVideoUrl"
    :get-thumb-url="getThumbUrl"
    :collection-id="collectionId"
    :is-selection-mode="isSelectionMode"
    @clip-updated="emit('clip-updated', $event)"
    @clip-deleted="emit('clip-deleted')"
  />
</template>

