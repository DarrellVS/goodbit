<script setup lang="ts">
import BaseChip from '@renderer/components/Base/BaseChip.vue';
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
 *
 * The corner itself belongs to the card, which stacks this under the export
 * badge: two things can be true of one clip, and each positioning itself
 * absolutely in the same corner is how they end up on top of each other.
 */
interface Props {
  count?: number | null;
}

defineProps<Props>();
</script>

<template>
  <BaseChip
    v-if="count && count > 0"
    :title="
      count === 1 ? '1 GoodBit found in this clip' : `${count} GoodBits found in this clip`
    "
  >
    <Icon icon="material-symbols:auto-awesome-rounded" class="size-3 shrink-0 block" />
    <span class="tabular-nums">{{ count }}</span>
  </BaseChip>
</template>
