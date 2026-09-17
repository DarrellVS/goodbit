<script setup lang="ts">
import { Icon } from '@iconify/vue';
import BaseButton from './BaseButton.vue';

/**
 * Nothing here, and what to do about it.
 *
 * An empty state that only reports an absence is a dead end. The same three
 * words used to appear whether the library was empty, a filter had hidden
 * everything, or a search had matched nothing, and the advice, "try adding
 * some clips to your library", was wrong in two of those three cases. Every
 * caller now says which case it is and offers the way out of it.
 */
interface Props {
  icon?: string;
  title: string;
  description: string;
  /** Text for the way out. Nothing is drawn without it. */
  actionLabel?: string;
}

interface Emits {
  (e: 'action'): void;
}

withDefaults(defineProps<Props>(), {
  icon: 'material-symbols:inbox',
  actionLabel: '',
});

const emit = defineEmits<Emits>();
</script>

<template>
  <div class="py-20 flex flex-col items-center justify-center text-center gap-4">
    <Icon :icon="icon" class="size-8 block text-muted-300" />
    <div class="space-y-1">
      <h2 class="font-display text-lg font-medium text-foreground">{{ title }}</h2>
      <p class="text-sm text-muted-500 max-w-md">{{ description }}</p>
    </div>
    <BaseButton v-if="actionLabel" variant="primary" class="mt-1" @click="emit('action')">
      {{ actionLabel }}
    </BaseButton>
  </div>
</template>

