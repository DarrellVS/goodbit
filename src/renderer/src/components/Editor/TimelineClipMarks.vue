<script setup lang="ts">
import { computed } from 'vue';
import {
  assignLanes,
  markOnTrimmedBlock,
  MAX_BAND_LANES,
  type Span,
} from '@renderer/utils/goodBits';

/**
 * A clip's GoodBits, drawn on its block in the editor timeline.
 *
 * Before this the editor had no knowledge of GoodBits at all: nothing was
 * being stripped by trimming or stitching, because nothing was ever loaded.
 * The whole point of a mark is that it says where the good part is, and the
 * editor is where somebody is deciding which part to keep, so it was the one
 * screen that most needed them and the one screen that had them least.
 *
 * **Not `Library/ClipGoodBitPips.vue` with a prop.** That component maps a
 * range against the clip's full duration and caps at four pips, because a card
 * is 280 pixels wide and a fifth mark reads as a dashed line. A block shows a
 * *window* of the clip, is as wide as its own trim, and is tall enough for the
 * three stacked rows `assignLanes` was written for. Two call sites of shared
 * helpers, rather than one component with two personalities.
 *
 * The marks are held in the clip's **own** seconds and mapped on every render.
 * Storing block-relative positions would mean rewriting all of them on every
 * drag of either handle, and `markOnTrimmedBlock` is arithmetic with no state.
 */
interface Props {
  /** In the source clip's own seconds. */
  marks?: readonly Span[];
  trimStart: number;
  trimEnd: number;
}

const props = defineProps<Props>();

const bands = computed(() => {
  if (!props.marks?.length) return [];

  // Laned against the source, so two marks that overlap in the recording stay
  // on separate rows whatever the block is currently showing.
  return assignLanes(props.marks)
    .map(({ range, lane }) => {
      const position = markOnTrimmedBlock(range, props.trimStart, props.trimEnd);
      return position ? { ...position, lane } : null;
    })
    .filter((band): band is { leftPercent: number; widthPercent: number; lane: number } =>
      band !== null,
    );
});

/**
 * How tall one row is, as a share of the strip.
 *
 * The strip is `MAX_BAND_LANES` rows however many are actually in use, so a
 * clip with one mark and a clip with three draw their first row at the same
 * height. A strip that grew with the data would move the band under somebody's
 * cursor the moment another mark appeared.
 */
const laneHeightPercent = 100 / MAX_BAND_LANES;
</script>

<template>
  <!--
    Along the bottom edge, on a ground of its own, and never taking a pointer.
    It was a six pixel strip split three ways straight over the thumbnail
    strip, so one mark was a two pixel line that disappeared into whatever
    frame happened to be under it; twelve pixels on the card colour make each
    row four and legible over any picture. The duration label sits above it.
    Never taking a pointer: the block underneath is draggable on
    its whole surface and a band that swallowed a mousedown would make part of
    the clip unmovable.
  -->
  <div
    v-if="bands.length"
    class="absolute left-0 right-0 bottom-0 h-3 bg-card/80 pointer-events-none"
    aria-hidden="true"
  >
    <div
      v-for="(band, index) in bands"
      :key="index"
      class="absolute rounded-full bg-accent"
      :style="{
        left: `${band.leftPercent}%`,
        width: `${band.widthPercent}%`,
        bottom: `${band.lane * laneHeightPercent}%`,
        height: `${laneHeightPercent}%`,
      }"
    />
  </div>
</template>
