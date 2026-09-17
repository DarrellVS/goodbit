<script setup lang="ts">
import { Icon } from '@iconify/vue';

/**
 * One number, in a row of four divided by hairlines.
 *
 * The tile draws no border of its own. `.b-tiles` sets a one pixel grid gap
 * over a `border` coloured background, so the rules between the tiles are the
 * ground showing through, and the row reads as one band rather than as four
 * boxes. That is also why this has the page colour behind it rather than a
 * raised surface: it has to match what a gap of one pixel is cut out of.
 */
interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  clickable?: boolean;
}

interface Emits {
  (e: 'click'): void;
}

withDefaults(defineProps<Props>(), { clickable: false });

const emit = defineEmits<Emits>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="block w-full bg-background px-5 pt-6 pb-6 text-left outline-none focus-visible:focus-ring"
    :class="{ 'hover:bg-muted-50 transition-colors duration-150 cursor-pointer': clickable }"
    @click="clickable && emit('click')"
  >
    <span class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium uppercase tracking-label text-muted-400">{{ title }}</span>
      <Icon :icon="icon" class="size-4 shrink-0 block text-accent" />
    </span>

    <span class="block font-display text-[34px] leading-[1.1] font-medium text-foreground mt-2.5 mb-1">
      {{ value }}
    </span>

    <span v-if="subtitle" class="block text-sm text-muted-500">{{ subtitle }}</span>
  </component>
</template>
