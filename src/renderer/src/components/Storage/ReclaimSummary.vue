<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { ICON_BOX_LG } from '@renderer/components/Base/geometry';
import { useFormat } from '@renderer/composables/ui/useFormat';

/**
 * How much there is to get back, and out of how much.
 *
 * A bare "48.2 GB" is a number nobody can act on. "48.2 GB, a third of your
 * library" is the one somebody can, and it is also the one that stops this
 * screen overstating itself: on a library where the answer is four hundred
 * megabytes, the share says so rather than letting a large-looking byte count
 * imply there is work worth doing here.
 */
interface Props {
  bytes: number;
  clips: number;
  libraryBytes?: number;
  libraryClips?: number;
}

const props = defineProps<Props>();
const { formatBytes } = useFormat();

const share = computed(() => {
  if (!props.libraryBytes || !props.bytes) return null;
  const percent = Math.round((props.bytes / props.libraryBytes) * 100);
  // Under one percent is "almost none of it", which the number cannot say:
  // `0%` reads as a bug rather than as an answer.
  return percent < 1 ? 'under 1% of your library' : `${percent}% of your library`;
});
</script>

<template>
  <div class="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3.5">
    <Icon icon="material-symbols:hard-drive" :class="[ICON_BOX_LG, 'text-muted-400']" />
    <div class="min-w-0">
      <div class="font-mono text-lg tabular-nums text-foreground">{{ formatBytes(bytes) }}</div>
      <p class="text-xs text-muted-500">
        across {{ clips }} {{ clips === 1 ? 'clip' : 'clips' }}<template v-if="share">, {{ share }}</template>
      </p>
    </div>
  </div>
</template>
