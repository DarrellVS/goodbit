<script setup lang="ts">
import { computed } from 'vue';
import { assignLanes, bandPosition, goodBitLabel } from '../../utils/goodBits';
import type { GoodBit } from '../../types/goodbit';

/**
 * The GoodBits already marked on this clip, drawn along the frame strip.
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
interface Props {
  goodBits: readonly GoodBit[];
  /** The clip's length. Zero until it has arrived, and then nothing is drawn. */
  durationSec: number;
  /** Which one the handles are currently sitting on, if any. */
  selectedId?: number | null;
}

const props = withDefaults(defineProps<Props>(), { selectedId: null });
const emit = defineEmits<{ (e: 'select', goodBit: GoodBit): void }>();

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
</script>

<template>
  <div
    v-if="durationSec > 0 && goodBits.length > 0"
    class="absolute inset-0 z-40 pointer-events-none rounded-xl overflow-hidden"
  >
    <button
      v-for="item in placed"
      :key="item.goodBit.id"
      type="button"
      class="absolute pointer-events-auto rounded-sm transition-colors"
      :class="
        item.goodBit.id === selectedId
          ? 'bg-orange-500 ring-1 ring-white/70'
          : 'bg-orange-500/55 hover:bg-orange-500/80'
      "
      :style="{
        left: `${item.leftPercent}%`,
        width: `${item.widthPercent}%`,
        bottom: `${item.lane * (LANE_HEIGHT_PX + LANE_GAP_PX)}px`,
        height: `${LANE_HEIGHT_PX}px`,
      }"
      :title="`${goodBitLabel(item.goodBit)}. Press to put the handles on it.`"
      :aria-label="`Edit the GoodBit ${goodBitLabel(item.goodBit)}`"
      :aria-pressed="item.goodBit.id === selectedId"
      @click.stop="emit('select', item.goodBit)"
      @pointerdown.stop
    />
  </div>
</template>
