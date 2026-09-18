<template>
  <!--
    One value along a track, which is the control this app did not have.

    `BaseRangeSlider` is not it: that one is two handles drawn *over* a frame
    strip, with zero width thumbs so they land on the exact pixel of a frame,
    and no track of its own. Reusing it for a level would mean a control with
    no visible track and a timecode label hanging off the handle.

    Reka's Slider for the same reason `BaseComboBox` is on Reka's Combobox: the
    arrow keys, Home, End, Page Up and the ARIA attributes come with it, and a
    level that cannot be nudged with a keyboard is a level nobody can set
    precisely.
  -->
  <SliderRoot
    v-model="model"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    class="relative flex items-center select-none touch-none w-full h-5 data-[disabled]:opacity-40"
  >
    <!--
      2px, which puts it in the decorative half of the ramp: `muted-300` is for
      rules and toggle tracks, and a track is exactly that. The filled part is
      the accent, because it is the value.
    -->
    <SliderTrack class="relative grow h-0.5 rounded-full bg-muted-300">
      <SliderRange class="absolute h-full rounded-full bg-accent" />
    </SliderTrack>
    <SliderThumb
      :class="[
        'block size-4 rounded-full bg-card border-2 border-accent shadow-pop',
        'hover:border-accent-hover',
        MOTION,
        FOCUS_RING,
      ]"
    />
  </SliderRoot>
</template>

<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';
import { computed } from 'vue';
import { FOCUS_RING, MOTION } from './geometry';

/**
 * A single value on a track.
 *
 * Nothing about it knows what the value means, which is the test for anything
 * in `Base/`: no store, no service, no domain type. The caller formats its own
 * readout, because a decibel, a percentage and a second are three different
 * strings and none of them belongs in here.
 *
 * **Nothing changes size on hover or focus.** The thumb's border changes
 * colour and the focus ring is painted outside the box, so the row it sits in
 * cannot shift under a pointer.
 */
withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    /** What a screen reader calls this, since the readout beside it is visual. */
    label?: string;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false, label: undefined },
);

/**
 * Reka works in arrays, callers think in numbers.
 *
 * Wrapped here rather than at every call site: a component whose `v-model` is
 * `[number]` for one value is an implementation detail leaking out, and the
 * first thing every caller would do is write this same adapter.
 */
const value = defineModel<number>({ required: true });

const model = computed<number[]>({
  get: () => [value.value],
  set: ([next]) => {
    value.value = next;
  },
});
</script>
