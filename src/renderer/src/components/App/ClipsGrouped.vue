<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { Clip } from '../../types/clip';
import { useClipHover } from '../../composables/useClipHover';
import { useConfiguration } from '../../composables/useConfiguration';
import { useClipGrouping } from '../../composables/useClipGrouping';
import AppClipCard from './AppClipCard.vue';

/** Structural shape of one grouped day, as `useClipGrouping` builds it. */
interface DayGroup {
  clips: Array<{ clip: Clip }>;
}

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
const router = useRouter();
const config = useConfiguration();
const { handleClipHover } = useClipHover();

const { groupedClips, getGameDisplayName } = useClipGrouping(computed(() => props.clips));

function handleClipUpdated(clip: Clip): void {
  emit('clip-updated', clip);
}

function handleClipDeleted(): void {
  emit('clip-deleted');
}

/**
 * Send a whole day into the editor, in the order it was played.
 *
 * The library lists newest first, which is the wrong way round for a montage,
 * so the ids go over in recording order and land on the timeline that way.
 * `EditorPage` reads them from `?clips=` and appends left to right.
 */
function editDayInEditor(group: DayGroup): void {
  const ids = [...group.clips]
    .sort((a, b) => time(a.clip) - time(b.clip))
    .map((entry) => entry.clip.id);

  if (ids.length === 0) return;

  void router.push({ path: '/editor', query: { clips: ids.join(',') } });
}

/**
 * When a clip happened, which is the file's own date.
 *
 * `createdAt` is when the row was written, so it is the install date for every
 * clip that was already on disk, and only a fallback for a row that somehow
 * has no file date.
 */
function time(clip: Clip): number {
  const stamp = clip.recordedAt ?? clip.fileModifiedAt ?? clip.createdAt;
  return stamp ? new Date(stamp).getTime() : 0;
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
            <h3 class="text-sm font-semibold text-foreground">
              {{ getGameDisplayName(group.game) }}
            </h3>
            <span class="text-xs text-muted-500">•</span>
            <span class="text-xs text-muted-500">{{ group.displayDate }}</span>
            <span class="text-xs font-medium text-muted-400 bg-muted-100 px-2 py-0.5 rounded-full">
              {{ group.clips.length }}
            </span>
          </div>
        </div>

        <!--
          A day of one game is the unit a montage is usually made from, so it
          gets a one-click way into the editor with the whole day already on the
          timeline, oldest first.
        -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-600 hover:text-orange-500 hover:bg-orange-500/10 transition-colors shrink-0"
          :title="`Open these ${group.clips.length} clips in the editor, oldest first`"
          @click="editDayInEditor(group)"
        >
          <Icon icon="material-symbols:movie-edit" class="text-base" />
          Open this day in the editor
        </button>
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
