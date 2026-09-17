<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  title: string;
  actionIcon?: string;
  actionTitle?: string;
}

interface Emits {
  (e: 'action'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="text-xs font-semibold text-muted-500 px-3 mb-2 flex items-center justify-between">
    <span>{{ title }}</span>
    <button
      v-if="actionIcon"
      class="p-1 rounded-sm hover:bg-card/10 transition-colors"
      :title="actionTitle"
      @click="emit('action')"
    >
      <Icon :icon="actionIcon" class="text-sm" />
    </button>
  </div>
</template>

