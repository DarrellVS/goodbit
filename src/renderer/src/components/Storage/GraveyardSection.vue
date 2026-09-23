<script setup lang="ts">
import { computed } from 'vue';
import { SECTION_HEADER } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import BaseEmptyState from '@renderer/components/Base/BaseEmptyState.vue';
import StorageClipTile from './StorageClipTile.vue';
import ReclaimSummary from './ReclaimSummary.vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { useFormat } from '@renderer/composables/ui/useFormat';
import type { UnreviewedResult } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

/**
 * The clips nobody ever did anything with.
 *
 * Never opened, never named, never starred, never tagged, never marked by hand, and old
 * enough that it is not going to happen. Grouped by game, because that is how
 * somebody decides: "I am never going to watch any of the Rocket League" is a
 * sentence, and "I am never going to watch clip 41 of 190" is not.
 *
 * Nothing here is ticked to begin with. This screen deletes recordings, and a
 * page that opens with 190 clips already selected is a page where the button
 * is pressed before the list is read.
 */
interface Props {
  data: UnreviewedResult | null;
  loading?: boolean;
  deleting?: boolean;
  selected: Set<number>;
  days: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle', clipId: number): void;
  (e: 'toggle-group', game: string): void;
  (e: 'delete'): void;
  (e: 'renamed', clip: Clip): void;
}>();

const { formatBytes } = useFormat();

/** What the ticked clips weigh, for the bar that deletes them. */
const selectedBytes = computed(() =>
  (props.data?.groups ?? [])
    .flatMap((group) => group.clips)
    .filter((clip) => props.selected.has(clip.id))
    .reduce((sum, clip) => sum + (clip.sizeBytes ?? 0), 0),
);

function groupSelected(clips: Clip[]): boolean {
  return clips.length > 0 && clips.every((clip) => props.selected.has(clip.id));
}
</script>

<template>
  <section>
    <div :class="SECTION_HEADER">
      <h2 class="text-base font-medium text-foreground">Never opened</h2>
      <span class="text-sm text-muted-500">
        Older than {{ days }} days, and never watched, named, starred, tagged or marked
      </span>
    </div>

    <div v-if="loading" class="flex justify-center py-10">
      <BaseSpinner />
    </div>

    <!--
      Warmly, not as an empty grid. Somebody opening this screen has usually
      just been told they are low on disk space, and "nothing here" is good
      news that should read like it rather than like a failed search.
    -->
    <BaseEmptyState
      v-else-if="!data?.groups.length"
      size="panel"
      tone="success"
      icon="material-symbols:check-circle-outline"
      title="Nothing has been forgotten"
    >
      Every clip older than {{ days }} days has been opened, named, starred, tagged or marked.
    </BaseEmptyState>

    <template v-else>
      <ReclaimSummary
        :bytes="data.totalBytes"
        :clips="data.totalClips"
        :library-bytes="data.libraryBytes"
        :library-clips="data.libraryClips"
      />

      <div v-for="group in data.groups" :key="group.game" class="mt-6">
        <div :class="SECTION_HEADER">
          <h3 class="text-sm font-medium text-foreground">{{ group.game }}</h3>
          <span class="font-mono text-xs tabular-nums text-muted-400">
            {{ group.clips.length }} · {{ formatBytes(group.reclaimableBytes) }}
          </span>
          <BaseButton
            size="sm"
            class="ml-auto"
            @click="emit('toggle-group', group.game)"
          >
            {{ groupSelected(group.clips) ? 'Clear' : 'Select all' }}
          </BaseButton>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StorageClipTile
            v-for="clip in group.clips"
            :key="clip.id"
            :clip="clip"
            :selected="selected.has(clip.id)"
            @toggle="emit('toggle', clip.id)"
            @renamed="emit('renamed', $event)"
          />
        </div>
      </div>

      <!--
        The delete, outlined in danger and never filled, and it says how much
        it frees as well as how many: the whole screen is about space, and the
        count alone made somebody add up sizes by eye.
      -->
      <div
        v-if="selected.size"
        class="sticky bottom-4 mt-6 flex items-center gap-3 rounded-lg border border-line-strong bg-card px-4 py-3 shadow-pop"
      >
        <span class="text-sm text-foreground">
          {{ selected.size }} selected
          <span class="font-mono text-xs tabular-nums text-muted-500">
            · {{ formatBytes(selectedBytes) }}
          </span>
        </span>
        <BaseButton
          tone="danger"
          icon="material-symbols:delete-outline"
          class="ml-auto"
          :disabled="deleting"
          @click="emit('delete')"
        >
          Delete selected
        </BaseButton>
      </div>
    </template>
  </section>
</template>
