<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  modelValue: 'grid' | 'grouped';
}

interface Emits {
  (e: 'update:modelValue', value: 'grid' | 'grouped'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <!--
    The icons said the opposite of what the modes do.

    A grid icon reads as "more, smaller", and this one gave two wide columns
    with the dates thrown away, while the agenda icon gave four columns under
    day headings. Every tester read it backwards. The icons now match what each
    mode produces and the tooltips say what you get and what you lose.
  -->
  <div class="flex items-center gap-2" role="group" aria-label="How clips are laid out">
    <button
      class="p-2 rounded-lg view-toggle-button"
      :class="modelValue === 'grouped' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
      title="By day: more clips per row, grouped under the day they were recorded"
      aria-label="By day"
      :aria-pressed="modelValue === 'grouped'"
      @click="emit('update:modelValue', 'grouped')"
    >
      <Icon icon="material-symbols:grid-view" class="text-lg transform-transition" />
    </button>
    <button
      class="p-2 rounded-lg view-toggle-button"
      :class="modelValue === 'grid' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
      title="Big: fewer, larger clips in one run, with no day headings"
      aria-label="Big"
      :aria-pressed="modelValue === 'grid'"
      @click="emit('update:modelValue', 'grid')"
    >
      <Icon icon="material-symbols:view-agenda" class="text-lg transform-transition" />
    </button>
  </div>
</template>

