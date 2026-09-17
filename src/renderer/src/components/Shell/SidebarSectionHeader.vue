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
  <div class="h-8 pl-4 pr-3 flex items-center justify-between">
    <span class="text-xs font-medium text-muted-400 uppercase tracking-label">{{ title }}</span>
    <button
      v-if="actionIcon"
      type="button"
      class="size-6 inline-flex items-center justify-center rounded-sm text-muted-500 hover:text-foreground hover:bg-muted-100 outline-none focus-visible:focus-ring transition-colors duration-150"
      :title="actionTitle"
      @click="emit('action')"
    >
      <Icon :icon="actionIcon" class="size-4 shrink-0 block" />
    </button>
  </div>
</template>

