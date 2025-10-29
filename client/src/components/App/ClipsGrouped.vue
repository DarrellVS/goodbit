<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { Clip } from '../../types/clip';
import { useClipHover } from '../../composables/useClipHover';
import { useConfiguration } from '../../composables/useConfiguration';
import { useGamesStore } from '../../stores/games';
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
const gamesStore = useGamesStore();
const { handleClipHover } = useClipHover();


interface ClipGroup {
  date: string;
  game: string;
  clips: Clip[];
  displayDate: string;
}

interface ClipWithIndex {
  clip: Clip;
  globalIndex: number;
}

interface ClipGroupWithIndices extends Omit<ClipGroup, 'clips'> {
  clips: ClipWithIndex[];
}

const groupedClips = computed(() => {
  const groups = new Map<string, ClipGroupWithIndices>();
  const groupOrder: string[] = [];

  props.clips.forEach((clip, globalIndex) => {
    const date = new Date(clip.createdAt ?? new Date());
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

    groups.get(groupKey)!.clips.push({ clip, globalIndex });
  });

  return groupOrder.map(key => groups.get(key)!);
});

function getGameDisplayName(gameFolderName: string): string {
  const game = gamesStore.items.find(g => g.game === gameFolderName);
  return game?.displayName || gameFolderName;
}

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
            <h3 class="text-sm font-semibold text-gray-900">
              {{ getGameDisplayName(group.game) }}
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
