<script setup lang="ts">
import { Icon } from '@iconify/vue';

/**
 * "This one was made in the editor", on the card.
 *
 * An export lands in its own game's folder now, which is the right place for
 * it and also means it sits in the grid among the recordings it was cut from,
 * with the same thumbnail, the same length and the same date. Nothing about a
 * rendered montage looks different from a recording of one, and the difference
 * matters: a recording is the only copy of a moment, and an export can be made
 * again from the timeline it came from.
 *
 * `isExport` is on the row rather than worked out from the path here, because
 * the card is handed a DTO and asking it to parse a path would be a second
 * answer to a question the scan already settles.
 *
 * Stacked under the suggestion badge in the card's top left column, so the two
 * cannot land on each other: a clip can be both, and a badge that moves when
 * another one appears is the layout-shift rule broken by data.
 */
interface Props {
  isExport?: boolean;
}

defineProps<Props>();
</script>

<template>
  <span
    v-if="isExport"
    class="inline-flex items-center gap-1 rounded-full bg-scrim px-2 py-0.5 text-[11px] font-medium text-on-video"
    title="Made in the editor, from clips in this game"
  >
    <Icon icon="material-symbols:movie-edit-outline-rounded" class="size-3 shrink-0 block" />
    Export
  </span>
</template>
