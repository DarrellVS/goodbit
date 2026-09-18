<script setup lang="ts">
import { Icon } from '@iconify/vue';

/**
 * "The screen found something in this one", on the card.
 *
 * The sweep that runs when a game closes reads the session's clips and leaves
 * the measurement in the cache; without something on the tile, the only way to
 * discover that is to open every clip, which is the work the sweep was meant
 * to save. So it also records how many moments it was confident about, and
 * this is that number.
 *
 * **Absent is not zero.** `suggestedCount` is null for a clip nobody has read,
 * which is most of a library the first time this ships, and a badge that could
 * not tell the two apart would say "nothing here" about a clip nobody has ever
 * looked at. Only a positive count draws.
 *
 * Top left, because the published badge owns the top right and a clip can be
 * both. Over the picture, so it reads on any frame: `on-video` and `scrim` are
 * the two tokens fixed in both palettes for exactly this.
 */
interface Props {
  count?: number | null;
}

defineProps<Props>();
</script>

<template>
  <div v-if="count && count > 0" class="absolute top-2 left-2 z-10">
    <span
      class="inline-flex items-center gap-1 rounded-full bg-scrim px-2 py-0.5 text-[11px] font-medium text-on-video"
      :title="
        count === 1
          ? '1 GoodBit found in this clip'
          : `${count} GoodBits found in this clip`
      "
    >
      <Icon icon="material-symbols:auto-awesome-rounded" class="size-3 shrink-0 block" />
      <span class="tabular-nums">{{ count }}</span>
    </span>
  </div>
</template>
