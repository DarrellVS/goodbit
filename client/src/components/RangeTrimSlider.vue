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
      v-for="(value, i) in model"
      :key="i"
      :aria-label="i === 0 ? 'Start time' : 'End time'"
      class="relative block h-full w-[1px] bg-orange-500 cursor-ew-resize rounded-md outline-none ring-2 ring-orange-500 pointer-events-auto touch-none"
    >
      <!-- Timestamp label positioned relative to thumb -->
      <div 
        :class="[
          'absolute left-1/2 -translate-x-1/2 px-2 py-0.5 bg-orange-500 text-white text-xs font-mono whitespace-nowrap shadow-lg pointer-events-none',
          i === 0 ? '-top-1 rounded-t' : '-bottom-1 rounded-b'
        ]"
      >
        {{ value.toFixed(1) }}s
      </div>
    </SliderThumb>
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


