<script setup lang="ts">
import { ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
import { sharedCardHeight, useNearViewport } from '@renderer/composables/media/useNearViewport';
import ClipCard from './ClipCard.vue';

/**
 * A clip's place in the grid, which is always there, and its card, which is not.
 *
 * The library does not page any more, so a long scroll leaves every clip it has
 * passed in the DOM. Measured on a real library: the bottom of 266 clips took
 * the app from 445 MB to 1424 MB. Measured on a thousand: 29,175 nodes, 27,556
 * event listeners, 237 MB of JS heap and 832 MB of renderer.
 *
 * ## What was tried, in order, and what each was worth
 *
 * At a thousand clips, renderer working set:
 *
 * | | |
 * |---|---|
 * | as it was | 832 MB |
 * | dropping each card's `<video>` and its 2.7 MB poster | no change worth the name |
 * | `content-visibility: auto` on the card | 875 MB, inside the run to run spread |
 * | dropping the card's tools, a `Menubar` apiece | 679 MB |
 * | dropping everything inside the card | 479 MB |
 * | not mounting the card at all, which is this | see below |
 *
 * The pictures were never the cost. The cost is a thousand Vue components: each
 * one's setup runs eight composables, registers listeners and holds an
 * `IntersectionObserver` entry, whether or not anything of it is on screen.
 *
 * ## Why this rather than a virtual list
 *
 * A virtual list recycles a fixed pool of components across a window of rows,
 * which means knowing how many columns there are. Here that is
 * `repeat(auto-fill, minmax(400px, 1fr))`: the count is decided by CSS from the
 * container's width, it changes with the window, the sidebar and compact mode,
 * and nothing in JavaScript knows it without measuring. The grouped view is
 * worse: date headers interleaved with cards rather than a flat array. And a
 * recycled card loses its hover, its focus and its selection.
 *
 * This keeps one element per clip, so the grid stays CSS's business, the scroll
 * height is exact rather than estimated, and nothing is ever recycled: a card
 * that comes back is a new one with the same props, which is what Vue does with
 * a `v-if` anyway.
 *
 * ## The height
 *
 * An empty slot has to occupy exactly what a card would, or the scrollbar moves
 * under the pointer as cards mount. Every card in a view is the same height by
 * construction, so the rendered ones measure it and share the number: see
 * `sharedCardHeight`.
 */
interface Props {
  clip: Clip;
  clipIndex: number;
  posterUrl: string;
  videoUrl: string;
  collectionId?: number;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: 'is-hovered', hovered: boolean): void;
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const slot = ref<HTMLElement | null>(null);
const near = useNearViewport(slot);
const cardHeight = sharedCardHeight();
</script>

<template>
  <div
    ref="slot"
    :data-clip-slot="clip.id"
    :style="near ? undefined : { height: `${cardHeight}px` }"
  >
    <ClipCard
      v-if="near"
      :clip="clip"
      :clip-index="clipIndex"
      :poster-url="posterUrl"
      :video-url="videoUrl"
      :collection-id="collectionId"
      :is-selection-mode="isSelectionMode"
      @is-hovered="emit('is-hovered', $event)"
      @updated="emit('updated', $event)"
      @deleted="emit('deleted')"
    />
  </div>
</template>
