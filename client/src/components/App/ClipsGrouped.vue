<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { Clip } from '../../types/clip';
import { useClipHover } from '../../composables/useClipHover';
import AppClipCard from './AppClipCard.vue';

interface Props {
  clips: Clip[];
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { handleClipHover } = useClipHover();


interface ClipGroup {
  date: string;
  game: string;
  clips: Clip[];
  displayDate: string;
}

const groupedClips = computed(() => {
  const groups = new Map<string, ClipGroup>();
  const groupOrder: string[] = [];

  props.clips.forEach(clip => {
    const date = new Date(clip.fileModifiedAt);
    const dateKey = date.toISOString().split('T')[0];
    const groupKey = `${dateKey}-${clip.game}`;

    if (!groups.has(groupKey)) {
      groupOrder.push(groupKey);
      groups.set(groupKey, {
        date: dateKey,
        game: clip.game,
        clips: [],
        displayDate: formatDate(date),
      });
    }

    groups.get(groupKey)!.clips.push(clip);
  });

  return groupOrder.map(key => groups.get(key)!);
});

function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateStr = date.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
}

function handleClipUpdated(clip: Clip): void {
  emit('clip-updated', clip);
}

function handleClipDeleted(): void {
  emit('clip-deleted');
}
</script>

<template>
  <div class="space-y-6">
    <div
      v-for="group in groupedClips"
      :key="`${group.date}-${group.game}`"
      class="space-y-3"
    >
      <div class="flex items-center gap-3 px-2">
        <Icon icon="material-symbols:stacks" class="w-5 h-5 text-orange-500" />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-900">
              {{ group.game }}
            </h3>
            <span class="text-xs text-gray-500">•</span>
            <span class="text-xs text-gray-500">{{ group.displayDate }}</span>
            <span class="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {{ group.clips.length }}
            </span>
          </div>
        </div>
      </div>

      <div class="relative">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <AppClipCard
            v-for="(clip, index) in group.clips"
            :key="clip.id"
            :clip="clip"
            :video-url="getVideoUrl(clip)"
            :poster-url="getThumbUrl(clip)"
            @is-hovered="isHovered => handleClipHover(clip.id, isHovered)"
            @updated="handleClipUpdated"
            @deleted="handleClipDeleted"
          />
        </div>
      </div>
    </div>
  </div>
</template>
