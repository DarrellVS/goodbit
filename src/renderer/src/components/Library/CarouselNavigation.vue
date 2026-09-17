<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  canPrev: boolean;
  canNext: boolean;
  showControls: boolean;
}

interface Emits {
  (e: 'previous'): void;
  (e: 'next'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <template v-if="showControls">
    <button
      class="absolute -left-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full w-11 h-11 flex items-center justify-center bg-video-bed/70 backdrop-blur-sm border border-on-video/15 shadow-md hover:shadow-lg hover:bg-video-bed/85"
      :class="{ 'group-hover:opacity-40 cursor-not-allowed': !canPrev }"
      :disabled="!canPrev"
      aria-label="Previous clip"
      @click="emit('previous')"
    >
      <Icon icon="material-symbols:chevron-left" class="text-on-video text-xl" />
    </button>
    
    <button
      class="absolute -right-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full w-11 h-11 flex items-center justify-center bg-video-bed/70 backdrop-blur-sm border border-on-video/15 shadow-md hover:shadow-lg hover:bg-video-bed/85"
      :class="{ 'group-hover:opacity-40 cursor-not-allowed': !canNext }"
      :disabled="!canNext"
      aria-label="Next clip"
      @click="emit('next')"
    >
      <Icon icon="material-symbols:chevron-right" class="text-on-video text-xl" />
    </button>
  </template>
</template>

