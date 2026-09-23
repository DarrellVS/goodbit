<script setup lang="ts">
import { computed } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import type { NotchTileData, NotchTilePress, NotchTiles } from '@shared/notch';
import { WING_CELL, tileSize, type Placement, type WingRects, type WingSide } from '@shared/notchWings';
import NotchTile from './NotchTile.vue';

/**
 * One wing: a handle beside the island, and the panel it opens.
 *
 * Main decides when it is open, from the pointer, the same way it decides for
 * the island; this draws the answer. The panel grows out of its handle on a
 * spring with some give in it, and its tiles follow one after another, so
 * opening one reads as the island reaching sideways rather than a second
 * window appearing.
 */
const props = defineProps<{
  side: WingSide;
  rects: WingRects;
  open: boolean;
  /** Handles are for opening on hover. Open with the island, there is nothing to rest on. */
  handle: boolean;
  placements: Placement[];
  tiles: NotchTiles;
  /**
   * Seconds to wait before the panel comes out. Opened with the island, the
   * island has to land first, or both grow at once and neither reads as the
   * thing that moved.
   */
  delay?: number;
}>();
const emit = defineEmits<{ press: [press: NotchTilePress] }>();

const outward = computed(() => (props.side === 'left' ? -1 : 1));

const SPRING = { type: 'spring', visualDuration: 0.42, bounce: 0.32 } as const;

function data(placement: Placement): NotchTileData {
  return props.tiles[placement.id] as NotchTileData;
}

function area(placement: Placement): string {
  const { w, h } = tileSize(placement);
  return `${placement.y + 1} / ${placement.x + 1} / span ${h} / span ${w}`;
}

/** Tiles land in reading order, starting beside the island. */
function order(placement: Placement): number {
  const column = props.side === 'left' ? 1 - placement.x : placement.x;
  return placement.y * 2 + column;
}
</script>

<template>
  <!-- The handle: a pill that swells as the pointer finds it. -->
  <AnimatePresence>
    <motion.div
      v-if="handle"
      class="wing-handle group absolute"
      :style="{
        left: `${rects.zone.x}px`,
        top: `${rects.zone.y}px`,
        width: `${rects.zone.width}px`,
        height: `${rects.zone.height}px`,
      }"
      :initial="{ opacity: 0, x: -outward * 10, scaleY: 0.4 }"
      :animate="{ opacity: open ? 0 : 1, x: 0, scaleY: 1 }"
      :exit="{ opacity: 0, scaleY: 0.4, transition: { duration: 0.12 } }"
      :transition="{ ...SPRING, delay: open ? 0 : 0.12 }"
      aria-hidden="true"
    >
      <!-- The whole zone swells the pill, since resting anywhere in it opens the wing. -->
      <span
        class="absolute flex items-center justify-center"
        :style="{
          left: `${rects.handle.x - rects.zone.x}px`,
          top: `${rects.handle.y - rects.zone.y}px`,
          width: `${rects.handle.width}px`,
          height: `${rects.handle.height}px`,
        }"
      >
      <span
        class="block h-7 w-1.5 rounded-full bg-notch shadow-[0_0_0_1px_var(--color-on-video-track)] transition-[height,width] duration-150 group-hover:h-9 group-hover:w-[7px]"
      />
      </span>
  </motion.div>
  </AnimatePresence>

  <AnimatePresence>
    <motion.div
      v-if="open"
      key="panel"
      class="absolute grid rounded-[18px] bg-notch shadow-pop"
      :style="{
        left: `${rects.panel.x}px`,
        top: `${rects.panel.y}px`,
        width: `${rects.panel.width}px`,
        height: `${rects.panel.height}px`,
        padding: `${WING_CELL.pad}px`,
        gap: `${WING_CELL.gap}px`,
        gridTemplateColumns: `repeat(2, ${WING_CELL.width}px)`,
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        transformOrigin: side === 'left' ? '100% 50%' : '0% 50%',
      }"
      :initial="{ opacity: 0, scaleX: 0.08, scaleY: 0.3, x: -outward * 12 }"
      :animate="{ opacity: 1, scaleX: 1, scaleY: 1, x: 0 }"
      :exit="{ opacity: 0, scaleX: 0.2, scaleY: 0.5, x: -outward * 8, transition: { duration: 0.16 } }"
      :transition="{ ...SPRING, delay: delay ?? 0 }"
    >
      <motion.div
        v-for="placement in placements"
        :key="`${placement.id}-${placement.tall ? 't' : 'w'}`"
        class="min-h-0 min-w-0"
        :style="{ gridArea: area(placement) }"
        :initial="{ opacity: 0, scale: 0.7, x: -outward * 14 }"
        :animate="{ opacity: 1, scale: 1, x: 0 }"
        :transition="{ ...SPRING, delay: (delay ?? 0) + 0.06 + order(placement) * 0.045 }"
      >
        <NotchTile :data="data(placement)" :size="tileSize(placement)" @press="emit('press', $event)" />
      </motion.div>
    </motion.div>
  </AnimatePresence>
</template>
