<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { Clip } from '../../types/clip';
import { useClipHover } from '../../composables/useClipHover';
import { useConfiguration } from '../../composables/useConfiguration';
import { useClipGrouping } from '../../composables/useClipGrouping';
import AppClipCard from './AppClipCard.vue';

interface Props {
  clips: Clip[];
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
  collectionId?: number;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelectionMode: false,
});

const emit = defineEmits<Emits>();
const config = useConfiguration();
const { handleClipHover } = useClipHover();

const { groupedClips, getGameDisplayName } = useClipGrouping(computed(() => props.clips));

function handleClipUpdated(clip: Clip): void {
  emit('clip-updated', clip);
}

function handleClipDeleted(): void {
  emit('clip-deleted');
}
</script>

<template>
  <div :class="config.public.value.compactMode ? 'space-y-4' : 'space-y-8'">
    <div
      v-for="group in groupedClips"
      :key="`${group.date}-${group.game}`"
      :class="config.public.value.compactMode ? 'space-y-2' : 'space-y-3'"
    >
      <div class="flex items-center gap-3 px-2">
        <Icon icon="material-symbols:label" class="w-5 h-5 text-orange-500" />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {{ getGameDisplayName(group.game) }}
            </h3>
            <span class="text-xs text-gray-500 dark:text-slate-400">•</span>
            <span class="text-xs text-gray-500 dark:text-slate-400">{{ group.displayDate }}</span>
            <span class="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full dark:text-slate-500 dark:bg-slate-800">
              {{ group.clips.length }}
            </span>
          </div>
        </div>
      </div>

      <div class="relative">
        <div 
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          :class="config.public.value.compactMode ? 'gap-2' : 'gap-4'"
        >
          <AppClipCard
            v-for="clipWithIndex in group.clips"
            :key="clipWithIndex.clip.id"
            :clip="clipWithIndex.clip"
            :clip-index="clipWithIndex.globalIndex"
            :video-url="getVideoUrl(clipWithIndex.clip)"
            :poster-url="getThumbUrl(clipWithIndex.clip)"
            :collection-id="collectionId"
            :is-selection-mode="isSelectionMode"
            @is-hovered="isHovered => handleClipHover(clipWithIndex.clip.id, isHovered)"
            @updated="handleClipUpdated"
            @deleted="handleClipDeleted"
          />
        </div>
      </div>
    </div>
  </div>
</template>
