<script setup lang="ts">
import { Icon } from '@iconify/vue';

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
  <div class="py-24 flex flex-col items-center justify-center text-center gap-4">
    <div class="rounded-full w-20 h-20 flex items-center justify-center bg-card/5 border border-border">
      <Icon :icon="icon" class="text-3xl text-muted-400" />
    </div>
    <div>
      <h2 class="text-2xl font-semibold mb-2">{{ title }}</h2>
      <p class="text-muted-400 max-w-md">{{ description }}</p>
    </div>
    <button
      v-if="actionLabel"
      class="mt-1 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

