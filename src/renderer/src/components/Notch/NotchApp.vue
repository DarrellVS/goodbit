<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { AnimatePresence, MotionConfig, motion } from 'motion-v';
import {
  NOTCH_ISLAND,
  NOTCH_LINE,
  NOTCH_PEEK,
  NOTCH_STAGE,
  type NotchState,
} from '@shared/notch';
import NotchPeek from './NotchPeek.vue';
import NotchIsland from './NotchIsland.vue';
import { chime } from './chime';

/**
 * The notch, drawn from whatever main last sent.
 *
 * One black shape that is a line, a peek or an island depending on the mode,
 * and moves between them on a spring rather than a fixed curve, so a line
 * opening into an island and an island folding back mid-way both look like one
 * continuous thing. Main owns every decision; this only draws and reports a
 * button press.
 */

const state = ref<NotchState>({
  mode: 'hidden',
  line: 'none',
  peek: null,
  island: null,
});

let detachState: (() => void) | null = null;
let detachChime: (() => void) | null = null;

onMounted(() => {
  const bridge = window.goodbitNotch;
  if (!bridge) return;
  detachState = bridge.onState((next) => {
    state.value = next;
  });
  detachChime = bridge.onChime((kind, volume) => chime(kind, volume));
  bridge.ready();
});

onBeforeUnmount(() => {
  detachState?.();
  detachChime?.();
});

/** A spring that settles in about a third of a second and barely overshoots. */
const SPRING = { type: 'spring', visualDuration: 0.34, bounce: 0.14 } as const;

const islandHeight = computed(() =>
  state.value.island?.disk ? NOTCH_ISLAND.height : NOTCH_ISLAND.height - 26,
);

const shape = computed(() => {
  switch (state.value.mode) {
    case 'line':
      return { width: NOTCH_LINE.width, height: NOTCH_LINE.height, radius: 4, opacity: 1 };
    case 'peek':
      return { width: NOTCH_PEEK.width, height: NOTCH_PEEK.height, radius: 16, opacity: 1 };
    case 'open':
      return { width: NOTCH_ISLAND.width, height: islandHeight.value, radius: 24, opacity: 1 };
    default:
      return { width: NOTCH_LINE.width, height: 0, radius: 4, opacity: 0 };
  }
});

/** The inverse corners that make it read as part of the bezel. */
const fillet = computed(() => {
  if (state.value.mode === 'hidden') return 0;
  return state.value.mode === 'open' ? 18 : state.value.mode === 'peek' ? 12 : 4;
});

const LINE_COLOUR: Record<string, string> = {
  ready: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
  busy: 'bg-accent',
  none: 'bg-transparent',
};

function act(action: 'trim' | 'open-latest' | 'library'): void {
  window.goodbitNotch?.act(action);
}
</script>

<template>
  <MotionConfig reduced-motion="user">
    <div class="fixed inset-0 flex items-center justify-center">
      <div
        class="relative shrink-0"
        :style="{ width: `${NOTCH_STAGE.along}px`, height: `${NOTCH_STAGE.across}px` }"
      >
        <div class="absolute inset-x-0 top-0 flex justify-center">
          <motion.div
            class="relative bg-notch"
            :initial="false"
            :animate="{
              width: shape.width,
              height: shape.height,
              opacity: shape.opacity,
              borderBottomLeftRadius: shape.radius,
              borderBottomRightRadius: shape.radius,
              boxShadow:
                state.mode === 'open'
                  ? '0 16px 32px rgba(0, 0, 0, 0.38)'
                  : '0 0 0 rgba(0, 0, 0, 0)',
            }"
            :transition="SPRING"
          >
            <motion.div
              class="notch-fillet notch-fillet-left"
              :initial="false"
              :animate="{ width: fillet, height: fillet }"
              :transition="SPRING"
            />
            <motion.div
              class="notch-fillet notch-fillet-right"
              :initial="false"
              :animate="{ width: fillet, height: fillet }"
              :transition="SPRING"
            />

            <!-- The line's one word: a segment in the middle, coloured by state. -->
            <motion.div
              v-if="state.mode === 'line'"
              class="absolute left-1/2 top-0 -ml-[18px] h-[3px] w-9 rounded-b-sm"
              :class="LINE_COLOUR[state.line]"
              :animate="state.line === 'busy' ? { x: [-38, 38] } : { x: 0 }"
              :transition="
                state.line === 'busy'
                  ? { duration: 1.1, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
                  : { duration: 0.2 }
              "
            />

            <div class="absolute inset-0 overflow-hidden">
              <AnimatePresence>
                <motion.div
                  v-if="state.mode === 'peek' && state.peek"
                  key="peek"
                  class="absolute left-1/2 top-0 -translate-x-1/2"
                  :style="{ width: `${NOTCH_PEEK.width}px`, height: `${NOTCH_PEEK.height}px` }"
                  :initial="{ opacity: 0, y: -4 }"
                  :animate="{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.2 } }"
                  :exit="{ opacity: 0, transition: { duration: 0.12 } }"
                >
                  <NotchPeek :peek="state.peek" />
                </motion.div>

                <motion.div
                  v-if="state.mode === 'open' && state.island"
                  key="island"
                  class="absolute left-1/2 top-0 -translate-x-1/2"
                  :style="{ width: `${NOTCH_ISLAND.width}px`, height: `${islandHeight}px` }"
                  :initial="{ opacity: 0, y: -8, scale: 0.98 }"
                  :animate="{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.06, ...SPRING } }"
                  :exit="{ opacity: 0, transition: { duration: 0.1 } }"
                >
                  <NotchIsland :island="state.island" @act="act" />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  </MotionConfig>
</template>

<style scoped>
/*
  A square of black with a transparent quarter circle cut out of it, one on
  each side of the shape where it meets the edge. `farthest-side` from a corner
  is the square's own side, so the curve follows the square as it grows.
*/
.notch-fillet {
  position: absolute;
  top: 0;
  pointer-events: none;
}
.notch-fillet-left {
  right: 100%;
  background: radial-gradient(
    circle farthest-side at 0 100%,
    transparent 96%,
    var(--color-notch) 100%
  );
}
.notch-fillet-right {
  left: 100%;
  background: radial-gradient(
    circle farthest-side at 100% 100%,
    transparent 96%,
    var(--color-notch) 100%
  );
}
</style>
