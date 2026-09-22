<script setup lang="ts">
import BasePanel from '@renderer/components/Base/BasePanel.vue';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { ICON_BOX, SECTION_HEADER } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import StorageClipTile from './StorageClipTile.vue';
import { useFormat } from '@renderer/composables/ui/useFormat';
import type { BurstCluster } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

/**
 * One burst: the same moment, saved several times.
 *
 * Every clip in it is shown, with the one being kept marked and every other
 * one marked as going. Not a list with a checkbox on the survivor: the thing
 * being decided is which one to keep, and the rest of the row is the
 * consequence, so the consequence is drawn rather than inferred.
 *
 * **The keeper is a suggestion and the tile says so.** The longest clip is
 * right often enough to save the work of choosing and wrong often enough that
 * changing it has to be one press, because the others are about to be
 * destroyed.
 */
interface Props {
  cluster: BurstCluster;
  keeperId: number;
  deleting?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'keep', clipId: number): void;
  (e: 'delete', clips: Clip[]): void;
}>();

const { formatBytes } = useFormat();

const doomed = computed(() => props.cluster.clips.filter((clip) => clip.id !== props.keeperId));

const span = computed(() => {
  const seconds = Math.round(props.cluster.spanSec);
  return seconds < 60 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`;
});

/** Named rather than implied: one of these is behind a link somebody has. */
const publishedDoomed = computed(() => doomed.value.filter((clip) => clip.published).length);
</script>

<template>
  <BasePanel>
    <div :class="SECTION_HEADER">
      <h3 class="text-sm font-medium text-foreground">
        {{ cluster.clips.length }} saves of one moment
      </h3>
      <span class="text-sm text-muted-500">{{ cluster.game }}, over {{ span }}</span>
      <span class="ml-auto font-mono text-xs tabular-nums text-muted-400">
        {{ formatBytes(cluster.reclaimableBytes) }} to save
      </span>
    </div>

    <p class="mb-3 text-sm text-muted-500">
      Press a clip to keep that one instead. The rest go to the Recycle Bin.
    </p>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StorageClipTile
        v-for="clip in cluster.clips"
        :key="clip.id"
        :clip="clip"
        mode="keep"
        :keeper="clip.id === keeperId"
        @toggle="emit('keep', clip.id)"
      />
    </div>

    <div class="mt-4 flex items-center gap-3">
      <p v-if="publishedDoomed" class="text-sm text-warning">
        {{ publishedDoomed === 1 ? 'One of the clips' : `${publishedDoomed} of the clips` }}
        being deleted {{ publishedDoomed === 1 ? 'is' : 'are' }} published, so
        {{ publishedDoomed === 1 ? 'its link' : 'their links' }} will stop working.
      </p>

      <BaseButton
        tone="danger"
        class="ml-auto"
        :disabled="deleting || doomed.length === 0"
        @click="emit('delete', doomed)"
      >
        <Icon icon="material-symbols:delete-outline" :class="ICON_BOX" />
        Delete the other {{ doomed.length }}
      </BaseButton>
    </div>
  </BasePanel>
</template>
