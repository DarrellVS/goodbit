<template>
  <!--
    The root takes no pointer events and the thumbs take all of them.
    Radix's slider normally treats a click anywhere on its track as "move the
    nearest thumb here", which over a frame strip means every attempt to put the
    playhead somewhere silently retrimmed the clip instead. Only the handles
    move the trim now; whatever sits behind this gets the rest of the strip.
  -->
  <SliderRoot
    v-model="model"
    :max="max"
    :step="step"
    :min-steps-between-thumbs="minStepsBetweenThumbs"
    class="absolute inset-0 z-50 flex items-center touch-none select-none pointer-events-none"
  >
    <SliderTrack class="relative w-full h-full">
      <SliderRange class="absolute h-full bg-primary/20" />
    </SliderTrack>
    <!--
      The thumb itself has no width on purpose.
      Radix positions a thumb by percentage and then pulls it back inside the
      track by a share of its own width, so a wide thumb lands visibly short of
      0% and past 100%. The handle sat several pixels away from the edge of the
      strip it was supposed to mark. A zero-width thumb is positioned exactly,
      and the parts you can see and grab hang off it.
    -->
    <SliderThumb
      v-for="(value, i) in model"
      :key="i"
      :aria-label="i === 0 ? 'Start time' : 'End time'"
      :title="i === 0 ? 'Drag to move the start' : 'Drag to move the end'"
      class="group relative block h-full w-0 outline-none pointer-events-auto touch-none"
    >
      <!--
        A hairline you can see, and a target eight times wider you can hit. A
        one-pixel target is why the strip behind it kept getting grabbed instead.
      -->
      <div class="absolute inset-y-0 -left-2 -right-2 cursor-ew-resize" />
      <div
        class="absolute inset-y-0 left-0 -translate-x-1/2 w-[3px] bg-orange-500 rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none transition-[width,background-color] group-hover:w-[5px] group-focus-visible:w-[5px] group-focus-visible:bg-orange-400"
      />

      <div
        :class="[
          // The thumb has no width, so the label centres on its left edge.
          'absolute left-0 -translate-x-1/2 px-2 py-0.5 bg-orange-500 text-white text-xs font-mono whitespace-nowrap shadow-lg pointer-events-none',
          i === 0 ? '-top-1 rounded-t' : '-bottom-1 rounded-b',
        ]"
      >
        {{ value.toFixed(1) }}s
      </div>
    </SliderThumb>
  </SliderRoot>
</template>

<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';

withDefaults(
  defineProps<{
    max: number;
    step?: number;
    minStepsBetweenThumbs?: number;
  }>(),
  {
    step: 0.1,
    minStepsBetweenThumbs: 0,
  },
);

const model = defineModel<number[]>({ required: true });
</script>
