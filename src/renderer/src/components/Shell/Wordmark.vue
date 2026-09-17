<script setup lang="ts">
/**
 * GoodBit's mark, drawn rather than loaded.
 *
 * The same shape as `build/icon.png`, a strip of frames with the one worth
 * keeping lit, but as SVG so it stays crisp at the 20 px the title bar shows it
 * at and needs no image request. `scripts/icon-options.mjs` is where the shape
 * came from; if the icon ever changes, both change together.
 *
 * `bare` drops the orange tile and draws the frames in the current text colour,
 * for places that already have a ground of their own: a banner, a menu row, a
 * line of type.
 */
interface Props {
  /** Rendered size in pixels. */
  size?: number;
  /** Frames only, in `currentColor`, with no tile behind them. */
  bare?: boolean;
}

withDefaults(defineProps<Props>(), { size: 20, bare: false });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 512 512"
    role="img"
    aria-label="GoodBit"
    class="shrink-0"
  >
    <rect v-if="!bare" width="512" height="512" rx="96" fill="#f97316" />
    <g :fill="bare ? 'currentColor' : '#ffffff'" :opacity="bare ? 0.38 : 0.34">
      <rect x="56" y="184" width="80" height="144" rx="18" />
      <rect x="148" y="184" width="80" height="144" rx="18" />
      <rect x="376" y="184" width="80" height="144" rx="18" />
    </g>
    <rect
      x="244"
      y="144"
      width="120"
      height="224"
      rx="26"
      :fill="bare ? 'currentColor' : '#ffffff'"
    />
  </svg>
</template>
