<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { pipLayout, type Span } from '../../utils/goodBits';

/**
 * A clip's GoodBits, at a glance, on a library card.
 *
 * ## What the prototype found, before any of this was wired up
 *
 * The brainstorm asked for "pips on the frame strip of `AppClipCard.vue`" and
 * warned that if a card cannot show three GoodBits without becoming a table
 * then the feature is wrong on the card. Three things came out of trying it.
 *
 * **There is no frame strip on a card.** The card is a `<video>` with a poster
 * and, under it, a two pixel line that fills as a hover preview plays. The
 * strip of ten decoded frames is the trimmer's, and it costs a tone mapped
 * decode to build; putting one on every tile is the mistake the thumbnail width
 * already taught this project (181 KB on disk, 18.9 MB decoded, forty cards
 * carrying three quarters of a gigabyte). So these are drawn over the bottom of
 * the picture, and the card's layout does not change at all.
 *
 * **A band, not a pip, and that is what makes it work.** A GoodBit has a length
 * and the length is most of what a glance wants to know. On a 300 pixel card a
 * two second GoodBit in a thirty second recording is twenty pixels: visible,
 * countable, and proportionate. A dot at its start would throw that away and
 * would be no easier to see.
 *
 * **Four, and then a number.** Past four the bands stop being countable at a
 * glance and read as a dashed line, which says nothing a number does not say
 * better. `pipLayout` makes that decision and `MAX_CARD_PIPS` is where it is
 * written down. Overlapping GoodBits are the case this cannot draw honestly:
 * they are laid out in one row here rather than stacked, so a long GoodBit with
 * a short one inside it looks like one band. The list is where that is read.
 *
 * So: pips work, with the length in them, up to four, over the picture rather
 * than on a strip the card does not have.
 */
interface Props {
  /** Every marked range on this clip. Empty draws nothing and costs nothing. */
  ranges: readonly Span[];
  /** The clip's stored length. Zero or missing draws nothing. */
  durationSec?: number | null;
}

const props = defineProps<Props>();

/**
 * The card's own width, because the minimum pip is in pixels.
 *
 * The library's grid is responsive and a card on a 21:9 screen is not the width
 * of one on a laptop, so a three pixel floor cannot be expressed as a
 * percentage in advance. Measured rather than assumed, and zero until it has
 * been: `pipLayout` then draws the bands at their true size, which is right on
 * the first frame and corrected as soon as the observer fires.
 */
const host = ref<HTMLElement | null>(null);
const widthPx = ref(0);
let observer: ResizeObserver | null = null;

/*
 * Watched rather than attached on mount.
 *
 * The whole layer is behind a `v-if`, so on a clip with nothing marked there is
 * no element when `onMounted` runs and there never would be one afterwards: the
 * card stays mounted while the library refetches, so the first GoodBit on it
 * would arrive to an observer that was never attached and a width stuck at
 * zero. The same watcher covers the element going away again.
 */
watch(host, (element) => {
  observer?.disconnect();
  observer = null;
  if (!element) return;

  widthPx.value = element.clientWidth;

  // Guarded, because a card that never learns its width still has to draw.
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver((entries) => {
    widthPx.value = entries[0]?.contentRect.width ?? element.clientWidth;
  });
  observer.observe(element);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const layout = computed(() =>
  pipLayout(props.ranges, props.durationSec ?? 0, widthPx.value),
);

const show = computed(
  () => props.ranges.length > 0 && (props.durationSec ?? 0) > 0,
);

const plural = computed(() => (props.ranges.length === 1 ? 'GoodBit' : 'GoodBits'));
</script>

<template>
  <!--
    Over the picture and inert.

    `pointer-events-none`, because the card's own click opens the clip and that
    is the right answer everywhere on it: a band you could press to play a range
    would be a four pixel target competing with the one gesture the tile has.
    Playing a GoodBit is in the clip's panel, which is where the press goes.

    White and black are literal here on purpose. This sits on a video frame,
    which is a fixed-dark ground that does not follow the theme, and it is the
    one case CLAUDE.md leaves a literal in.
  -->
  <div
    v-if="show"
    ref="host"
    class="absolute inset-x-0 bottom-1.5 px-1.5 pointer-events-none z-10"
    :aria-label="`${ranges.length} ${plural} marked on this clip`"
  >
    <div v-if="layout.kind === 'pips'" class="relative h-[3px]">
      <span
        v-for="(pip, index) in layout.pips"
        :key="index"
        class="absolute inset-y-0 rounded-full bg-orange-400 shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
        :style="{ left: `${pip.leftPercent}%`, width: `${pip.widthPercent}%` }"
      ></span>
    </div>

    <!--
      Too many to count at a glance, so it says how many instead. A dashed line
      of eight bands tells you less than the number eight does.
    -->
    <span
      v-else
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-xs text-white text-[10px] font-medium"
    >
      {{ layout.count }} {{ plural }}
    </span>
  </div>
</template>
