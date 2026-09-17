<script setup lang="ts">
import { computed } from 'vue';
/**
 * Waiting, drawn as the app's own mark.
 *
 * `Wordmark` is four frames on a strip with the one worth keeping lit, which is
 * the whole idea of the app in one shape. This is that shape with the light
 * moving: each frame in turn grows to the height the lit one has and settles
 * back, so the highlight travels left to right for as long as the wait lasts.
 * A generic spinner says only that something is happening; this says which
 * program is doing it.
 *
 * ## How it is drawn
 *
 * Four frames of one width, evenly spaced, rather than the mark's own layout.
 * In the mark the lit frame is wider as well as taller, and animating width
 * would either move its neighbours or run them into each other: the gaps are
 * twelve pixels and the difference is forty. Height alone carries the idea and
 * keeps the strip still.
 *
 * Every frame scales about its own centre, which is why all four share a centre
 * line at y=256. `transform-box: fill-box` is what makes `transform-origin`
 * mean the rectangle rather than the whole canvas, and without it they grow
 * from the top left corner of the SVG and fly apart.
 *
 * `currentColor` throughout, so this works on an orange button and on a card
 * without being told which.
 */
interface Props {
  /**
   * Pixels, when a fixed size is wanted. Left out it is `1em`, so it takes the
   * size of the type around it exactly as an icon font does, and every
   * `text-lg` and `text-2xl` that used to size a spinner still means something.
   */
  size?: number;
  /** One full pass of the light, in milliseconds. */
  duration?: number;
  /** What is being waited for, for anyone not looking at the screen. */
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 1100,
  label: 'Loading',
});

const box = computed(() => (props.size ? `${props.size}px` : '1em'));

/*
 * Four starts, evenly spread over the cycle.
 *
 * A quarter apart is what makes one frame shrink while the next grows: each
 * frame is at its tallest a fifth of the way through its own run and back down
 * by halfway, so its neighbour is already on the way up before it has finished
 * coming down.
 */
const FRAMES = [0, 1, 2, 3];
const X = [78, 170, 262, 354];

function delay(index: number): string {
  return `${(index * props.duration) / 4}ms`;
}
</script>

<template>
  <svg
    :width="box"
    :height="box"
    viewBox="0 0 512 512"
    role="img"
    :aria-label="label"
    class="shrink-0 goodbit-loading"
  >
    <rect
      v-for="i in FRAMES"
      :key="i"
      :x="X[i]"
      y="184"
      width="80"
      height="144"
      rx="18"
      fill="currentColor"
      :style="{ animationDuration: `${duration}ms`, animationDelay: delay(i) }"
    />
  </svg>
</template>

<style scoped>
.goodbit-loading rect {
  transform-box: fill-box;
  transform-origin: center;
  animation-name: goodbit-frame;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  animation-iteration-count: infinite;
  opacity: 0.32;
}

/*
 * 1.5556 is 224 over 144: the lit frame's height in the real mark divided by a
 * dim one's, so the tall state here is exactly the tall state there.
 */
@keyframes goodbit-frame {
  0% {
    transform: scaleY(1);
    opacity: 0.32;
  }
  20% {
    transform: scaleY(1.5556);
    opacity: 1;
  }
  45% {
    transform: scaleY(1);
    opacity: 0.32;
  }
  100% {
    transform: scaleY(1);
    opacity: 0.32;
  }
}

/* Somebody who has asked for less motion gets a steady mark, not a still one. */
@media (prefers-reduced-motion: reduce) {
  .goodbit-loading rect {
    animation-name: goodbit-frame-dim;
    animation-timing-function: ease-in-out;
  }

  @keyframes goodbit-frame-dim {
    0%,
    100% {
      opacity: 0.32;
    }
    20% {
      opacity: 1;
    }
  }
}
</style>
