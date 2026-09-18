<script setup lang="ts">
import { computed } from 'vue';
import { assignLanes, bandPosition, goodBitLabel } from '@renderer/utils/goodBits';
import type { GoodBit } from '@renderer/types/goodbit';

/**
 * The GoodBits marked on this clip, and the ones the game's HUD offered,
 * drawn along the frame strip.
 *
 * **The handles are the GoodBit being marked; these are the ones that are
 * saved.** So they are the same orange in a lighter weight rather than a second
 * colour: one accent in two strengths reads as "this is the live one and those
 * are the others", where two colours would read as two unrelated features on
 * one strip.
 *
 * A band is also a band and not a pin. A GoodBit has a length, that length is
 * the thing being decided, and a pin at its start throws that away; the
 * measurement behind this feature found events 1 to 5 seconds long in clips of
 * 30, so the length is a tenth of the strip and perfectly visible.
 *
 * **Pressing one loads it into the handles**, which makes editing a saved
 * GoodBit the same gesture as marking a new one. Without that there would have
 * to be a second way to change a range, and the handles are already the way.
 *
 * ## Why this sits where it does in the strip's stack
 *
 * The strip has a full-size scrub catcher at `z-40` and the range slider at
 * `z-50`. These bands go at `z-40` too, *after* the catcher in document order,
 * so they paint above it and take the pointer where they actually are while the
 * strip between them still scrubs (the container is `pointer-events-none`, each
 * band is not). Below `z-50`, so a handle parked over a band is still a handle:
 * grabbing it trims rather than selecting whatever is underneath.
 */
/**
 * A range the HUD found and nobody has kept yet.
 *
 * Deliberately not a `GoodBit`: it has no row, no id and nothing on disk, and
 * giving it the same type would make "is this saved" a question about whether
 * a field happens to be set.
 */
export interface SuggestedBand {
  key: string;
  startSec: number;
  endSec: number;
  /** The sentence the module wrote, for the tooltip. */
  reason: string;
  /** What it would be called once kept: `Kill`, `Death`. */
  name: string | null;
}

interface Props {
  goodBits: readonly GoodBit[];
  /** The clip's length. Zero until it has arrived, and then nothing is drawn. */
  durationSec: number;
  /** Which one the handles are currently sitting on, if any. */
  selectedId?: number | null;
  /**
   * What the screen found and nobody has kept, drawn as outlines.
   *
   * Only when there is more than one of them, which is the case the banner
   * above cannot show: one range is what the handles are already sitting on,
   * and drawing an outline around the handles says nothing. Two or more is a
   * clip holding two moments, and a row of times in a banner is a poor way to
   * say where in half a minute of footage they are.
   */
  suggested?: readonly SuggestedBand[];
}

const props = withDefaults(defineProps<Props>(), { selectedId: null, suggested: () => [] });
const emit = defineEmits<{
  (e: 'select', goodBit: GoodBit): void;
  (e: 'keep-suggested', band: SuggestedBand): void;
}>();

/** Six pixels a row, so three rows cost eighteen of a 128 pixel strip. */
const LANE_HEIGHT_PX = 6;
const LANE_GAP_PX = 1;

const placed = computed(() =>
  assignLanes(props.goodBits).map(({ range, lane }) => ({
    goodBit: range,
    lane,
    ...bandPosition(range, props.durationSec),
  })),
);

/**
 * The offered ranges, above the kept ones.
 *
 * Their own lanes rather than shared ones: a suggestion sitting in the gap
 * between two saved marks would read as a third saved mark, and the whole
 * point of drawing them is that they are the ones not saved yet.
 */
const offered = computed(() =>
  assignLanes(
    props.suggested.map((band) => ({ ...band, startSec: band.startSec, endSec: band.endSec })),
  ).map(({ range, lane }) => ({
    band: range,
    lane,
    ...bandPosition(range, props.durationSec),
  })),
);

/** Where the offered rows start, clear of every kept row. */
const OFFERED_LANE_OFFSET = 3;

function laneBottom(lane: number): string {
  return `${lane * (LANE_HEIGHT_PX + LANE_GAP_PX)}px`;
}
</script>

<template>
  <div
    v-if="durationSec > 0 && (goodBits.length > 0 || suggested.length > 0)"
    class="absolute inset-0 z-40 pointer-events-none rounded-md overflow-hidden"
  >
    <button
      v-for="item in placed"
      :key="item.goodBit.id"
      type="button"
      class="absolute pointer-events-auto rounded-xs transition-colors"
      :class="
        item.goodBit.id === selectedId
          ? 'bg-accent ring-1 ring-on-video/70'
          : 'bg-accent/55 hover:bg-accent/80'
      "
      :style="{
        left: `${item.leftPercent}%`,
        width: `${item.widthPercent}%`,
        bottom: laneBottom(item.lane),
        height: `${LANE_HEIGHT_PX}px`,
      }"
      :title="`${goodBitLabel(item.goodBit)}. Press to put the handles on it.`"
      :aria-label="`Edit the GoodBit ${goodBitLabel(item.goodBit)}`"
      :aria-pressed="item.goodBit.id === selectedId"
      @click.stop="emit('select', item.goodBit)"
      @pointerdown.stop
    />

    <!--
      Offered, not kept: an outline where a kept band is a fill.

      Same colour, because these become those, and the difference between a
      suggestion and a decision is exactly the difference between an outline
      and a fill. A second hue would read as a second feature.
    -->
    <button
      v-for="item in offered"
      :key="item.band.key"
      type="button"
      class="absolute pointer-events-auto rounded-xs border border-accent bg-accent/15 hover:bg-accent/40 transition-colors"
      :style="{
        left: `${item.leftPercent}%`,
        width: `${item.widthPercent}%`,
        bottom: laneBottom(item.lane + OFFERED_LANE_OFFSET),
        height: `${LANE_HEIGHT_PX}px`,
      }"
      :title="`${item.band.reason}. Press to keep it as a GoodBit.`"
      :aria-label="`Keep ${item.band.name ?? 'this moment'} as a GoodBit`"
      @click.stop="emit('keep-suggested', item.band)"
      @pointerdown.stop
    />
  </div>
</template>
