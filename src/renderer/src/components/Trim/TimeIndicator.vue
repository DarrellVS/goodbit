<template>
  <div class="flex items-center gap-2" :class="containerClass">
    <div class="w-2 h-2 rounded-full bg-orange-500" />
    <span class="text-muted-400">{{ label }}:</span>
    <span class="font-mono font-semibold" :class="textClass">{{ time }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  label: string;
  time: string;
  variant?: 'default' | 'primary';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
});

const isPrimary = computed(() => props.variant === 'primary');

const containerClass = computed(() => 
  isPrimary.value 
    ? 'px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20' 
    : ''
);

const textClass = computed(() => 
  isPrimary.value ? 'text-orange-500' : ''
);
</script>

