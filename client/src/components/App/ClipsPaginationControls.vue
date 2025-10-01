<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  loading: boolean;
  hasMore: boolean;
  hasClips: boolean;
}

interface Emits {
  (e: 'load-more'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div v-if="loading" class="flex justify-center py-8">
    <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
  </div>

  <div v-else-if="hasMore && hasClips" class="flex justify-center py-8">
    <button
      class="px-6 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2"
      @click="emit('load-more')"
    >
      <Icon icon="material-symbols:expand-more" class="text-xl" />
      <span>Load More</span>
    </button>
  </div>

  <div v-else-if="!hasMore && hasClips" class="text-center py-8 text-sm text-gray-400">
    No more clips to load
  </div>
</template>

