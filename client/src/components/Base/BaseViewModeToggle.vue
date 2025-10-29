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
  <div class="flex items-center gap-2">
    <button
      class="p-2 rounded-lg transition-colors"
      :class="modelValue === 'grouped' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
      title="Grouped view"
      @click="emit('update:modelValue', 'grouped')"
    >
      <Icon icon="material-symbols:view-agenda" class="text-lg" />
    </button>
    <button
      class="p-2 rounded-lg transition-colors"
      :class="modelValue === 'grid' ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-black/5'"
      title="Grid view"
      @click="emit('update:modelValue', 'grid')"
    >
      <Icon icon="material-symbols:grid-view" class="text-lg" />
    </button>
  </div>
</template>

