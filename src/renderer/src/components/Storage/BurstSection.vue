<script setup lang="ts">
import { SECTION_HEADER } from '@renderer/components/Base/geometry';
import BaseEmptyState from '@renderer/components/Base/BaseEmptyState.vue';
import BurstClusterCard from './BurstCluster.vue';
import ReclaimSummary from './ReclaimSummary.vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import type { BurstResult } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

/**
 * The same moment, saved several times.
 *
 * The replay buffer holds the last thirty seconds, so pressing the key twice
 * ten seconds apart writes two files with twenty seconds of the same footage
 * in both. Nobody does that on purpose, which is why this is worth a section:
 * it is the one kind of waste in a library that nobody chose.
 */
interface Props {
  data: BurstResult | null;
  loading?: boolean;
  deleting?: boolean;
  keepers: Map<number, number>;
  windowSec: number;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: 'keep', clusterIndex: number, clipId: number): void;
  (e: 'delete', clips: Clip[]): void;
}>();
</script>

<template>
  <section>
    <div :class="SECTION_HEADER">
      <h2 class="text-base font-medium text-foreground">Saved more than once</h2>
      <span class="text-sm text-muted-500">
        Clips of one game saved within {{ windowSec }} seconds of each other
      </span>
    </div>

    <div v-if="loading" class="flex justify-center py-10">
      <BaseSpinner />
    </div>

    <BaseEmptyState
      v-else-if="!data?.clusters.length"
      size="panel"
      tone="success"
      icon="material-symbols:check-circle-outline"
      title="No duplicates of one moment"
    >
      Nothing was saved twice within {{ windowSec }} seconds.
    </BaseEmptyState>

    <template v-else>
      <ReclaimSummary :bytes="data.reclaimableBytes" :clips="data.totalClips" />

      <div class="mt-6 space-y-4">
        <BurstClusterCard
          v-for="(cluster, index) in data.clusters"
          :key="`${cluster.game}-${cluster.clips[0]?.id}`"
          :cluster="cluster"
          :keeper-id="keepers.get(index) ?? cluster.suggestedKeeperId"
          :deleting="deleting"
          @keep="emit('keep', index, $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
  </section>
</template>
