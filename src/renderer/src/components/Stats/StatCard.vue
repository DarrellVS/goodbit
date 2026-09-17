<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  iconBg?: string;
  clickable?: boolean;
}

interface Emits {
  (e: 'click'): void;
}

withDefaults(defineProps<Props>(), {
  iconColor: 'text-muted-400',
  iconBg: '',
  clickable: false,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="bg-muted-50 rounded-md p-5 text-left w-full outline-none focus-visible:focus-ring"
    :class="{ 'hover:bg-muted-100 transition-colors duration-150 cursor-pointer': clickable }"
    @click="clickable && emit('click')"
  >
    <!--
      A tile is a tone step, and its glyph is a glyph.

      It was a bordered card holding a 40px filled disc, so a row of four read
      as four buttons rather than as four numbers, and the disc was the second
      loudest thing in each one after the number it was supposed to label.
    -->
    <div class="flex items-center justify-between gap-2 mb-3">
      <span class="text-sm text-muted-500">{{ title }}</span>
      <Icon :icon="icon" class="size-4 shrink-0 block" :class="iconColor" />
    </div>
    <div class="font-mono text-2xl font-medium text-foreground tabular-nums">{{ value }}</div>
    <div v-if="subtitle" class="text-xs text-muted-500 mt-1">{{ subtitle }}</div>
  </component>
</template>

