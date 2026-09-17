<script lang="ts" setup>
import { computed } from 'vue';
import type { ButtonVariant } from './types';

const props = defineProps<{ variant?: ButtonVariant }>();

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-accent text-accent-fg border-transparent hover:bg-accent-hover';
    case 'danger':
      return 'bg-danger text-danger-fg';
    case 'ghost':
      return 'bg-transparent';
    case 'outline':
      return 'bg-transparent border border-border hover:bg-muted-50';
    case 'muted':
      return 'bg-transparent border border-border hover:bg-muted-50 bg-card/50';
    default:
      return '';
  }
});

</script>

<template>
  <button
    class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-soft border border-border hover:shadow-md transition-all duration-200 active:scale-[0.98]"
    :class="variantClass"
  >
    <slot />
  </button>
</template>


