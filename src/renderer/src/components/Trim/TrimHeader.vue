<template>
  <!--
    No back button: the title bar already has one, and two arrows pointing the
    same way is one too many. Kept short. The page below it has to fit a
    preview, a timeline and a transport without scrolling.
  -->
  <header class="relative overflow-hidden border-b border-border shrink-0">
    <div class="relative max-w-7xl mx-auto px-6 py-4">
      <div class="flex items-center gap-4">
        <div class="p-2.5 rounded-md bg-accent shrink-0">
          <Icon icon="material-symbols:content-cut" class="text-accent-fg text-xl" />
        </div>
        <div class="min-w-0">
          <h1 class="text-lg font-display font-medium text-foreground">
            Trim Your Clip
          </h1>
          <p class="text-xs text-muted-400">Select the perfect moment</p>
        </div>

        <!--
          Naming happens here because this is where you decide what the clip
          is. Saved the moment you leave the field, so it sticks whether or not
          you also trim. Empty means "no name": the filename shows instead.
        -->
        <label class="ml-auto flex items-center gap-2 min-w-0 w-full max-w-md">
          <Icon icon="material-symbols:edit" class="text-lg text-muted-400 shrink-0" />
          <input
            :value="name"
            type="text"
            :placeholder="placeholder"
            aria-label="Clip name"
            class="w-full min-w-0 px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-400 focus:outline-hidden focus:ring-1 focus:ring-accent/40 focus:border-accent"
            @input="emit('update:name', ($event.target as HTMLInputElement).value)"
            @change="emit('commit')"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
        </label>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  /** The display name being edited. Empty when the clip has none. */
  name: string;
  /** What shows when there is no name: the filename. */
  placeholder: string;
}

interface Emits {
  (e: 'update:name', value: string): void;
  /** The field was left; save what is in it. */
  (e: 'commit'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>
