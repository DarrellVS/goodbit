<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import BaseButton from './BaseButton.vue';

/**
 * Back, a position, forward.
 *
 * `10-modal-pager` is this control getting two things wrong at once. `1 of 11`
 * was not centred against its chevrons, and the chevrons moved as the number
 * changed, because the readout was as wide as whatever it happened to say.
 *
 * Both are fixed by the same two decisions. The figures are tabular, so every
 * digit is the same width, and the readout has a `min-width` computed from the
 * widest value it can ever hold, so `1 of 11` and `11 of 11` occupy the same
 * box. The three items are square hit boxes on one axis with one gap between
 * them, so nothing is centred by eye.
 */
const props = withDefaults(
  defineProps<{
    position: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
    /** What one of these is, for the buttons' accessible names. */
    noun?: string;
  }>(),
  { noun: 'clip' },
);

defineEmits<{ (e: 'previous'): void; (e: 'next'): void }>();

/**
 * Wide enough for the largest reading, in `ch` units of the mono face.
 *
 * `4 of 11` is seven characters; `11 of 11` is eight. Sizing to the current
 * value would move the chevrons every time the position crossed ten.
 */
const widthCh = computed(() => {
  const digits = String(props.total).length;
  return digits * 2 + ' of '.length;
});
</script>

<template>
  <div class="inline-flex items-center gap-1">
    <BaseButton
      tone="quiet"
      size="dense"
      icon-only
      :disabled="!hasPrevious"
      :title="`Previous ${noun} ([)`"
      :aria-label="`Previous ${noun}`"
      @click="$emit('previous')"
    >
      <Icon icon="material-symbols:chevron-left" class="size-4 shrink-0 block" />
    </BaseButton>

    <span
      class="font-mono text-xs tabular-nums text-muted-500 text-center select-none"
      :style="{ minWidth: `${widthCh}ch` }"
      role="status"
    >
      {{ position }} of {{ total }}
    </span>

    <BaseButton
      tone="quiet"
      size="dense"
      icon-only
      :disabled="!hasNext"
      :title="`Next ${noun} (])`"
      :aria-label="`Next ${noun}`"
      @click="$emit('next')"
    >
      <Icon icon="material-symbols:chevron-right" class="size-4 shrink-0 block" />
    </BaseButton>
  </div>
</template>
