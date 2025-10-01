<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  icon: string;
  message: string;
  actionText: string;
}

interface Emits {
  (e: 'action'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="px-3 py-6 text-center">
    <Icon :icon="icon" class="text-3xl text-muted-300 mb-2 mx-auto" />
    <p class="text-xs text-muted-400">{{ message }}</p>
    <button
      class="mt-2 text-xs text-orange-500 hover:text-orange-600 transition-colors"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>

