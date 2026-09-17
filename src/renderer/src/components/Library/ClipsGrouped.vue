<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { Clip } from '@renderer/types/clip';
import { useClipHover } from '@renderer/composables/clips/useClipHover';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useClipGrouping } from '@renderer/composables/library/useClipGrouping';
import ClipCard from './ClipCard.vue';

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
      class="group/day"
      :class="config.public.value.compactMode ? 'space-y-2' : 'space-y-3'"
    >
      <!--
        The date leads, because the grouping is by day.

        It read `[icon] Battlefield 6 . Today (3)`: a label glyph in front of a
        date, the game where the date belongs, and the count in a pill. The
        game is the qualifier on the day and the count is a fact about it, so
        both are quiet, and the hairline under the row is what separates one
        day from the next.
      -->
      <div class="flex items-center gap-3 pb-2 border-b border-border">
        <h3 class="text-xs font-medium uppercase tracking-label text-foreground shrink-0">
          {{ group.displayDate }}
        </h3>
        <span class="text-sm text-muted-500 truncate">
          {{ getGameDisplayName(group.game) }}
        </span>
        <span class="font-mono text-xs tabular-nums text-muted-400 shrink-0">
          {{ group.clips.length }}
        </span>
        <span class="flex-1" aria-hidden="true"></span>

        <!--
          A day of one game is the unit a montage is usually made from, so it
          gets a one-click way into the editor with the whole day already on the
          timeline, oldest first.

          On hover, because it is one header per game per day and this was the
          most repeated text in the app: a library with forty clips spread over
          thirty days drew thirty copies of a five word secondary action down
          the page, competing with the clips somebody actually came to look at.
          It stays keyboard reachable through `focus-within`, so hiding it
          costs nothing but the repetition.
        -->
        <button
          type="button"
          class="h-7 inline-flex items-center gap-2 px-2 rounded-sm text-xs font-medium text-muted-500 hover:text-foreground shrink-0
                 opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 outline-none focus-visible:focus-ring transition-opacity duration-150"
          :title="`Open these ${group.clips.length} clips in the editor, oldest first`"
          @click="editDayInEditor(group)"
        >
          <Icon icon="material-symbols:movie-edit" class="size-4 shrink-0 block" />
          Open this day in the editor
        </button>
      </div>

      <div class="relative">
        <div 
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          :class="config.public.value.compactMode ? 'gap-2' : 'gap-4'"
        >
          <ClipCard
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
