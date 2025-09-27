<template>
  <SliderRoot
    v-model="model"
    :max="max"
    :step="step"
    :min-steps-between-thumbs="minStepsBetweenThumbs"
    class="absolute inset-0 z-50 flex items-center touch-none select-none pointer-events-auto"
  >
    <SliderTrack class="relative w-full h-full">
      <SliderRange class="absolute h-full bg-primary/20" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, i) in 2"
      :key="i"
      aria-label="Trim handle"
      class="block h-full w-[10px] bg-primary cursor-ew-resize rounded-md shadow-soft border border-ring outline-none focus:ring-2 focus:ring-ring pointer-events-auto touch-none"
    />
  </SliderRoot>
</template>

<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';

withDefaults(defineProps<{
  max: number;
  step?: number;
  minStepsBetweenThumbs?: number;
}>(), {
  step: 0.1,
  minStepsBetweenThumbs: 0,
});

const model = defineModel<number[]>({ required: true });
</script>

<style scoped>
</style>


