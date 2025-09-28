<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{ variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'outline' }>();

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'text-primary-fg bg-gradient-to-br from-primary via-violet-500 to-cyan-500';
    case 'danger':
      return 'bg-danger text-danger-fg';
    case 'ghost':
      return 'bg-transparent';
    case 'outline':
      return 'bg-transparent border border-border hover:bg-muted-50';
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


