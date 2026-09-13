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
  iconColor: 'text-orange-500',
  iconBg: 'bg-orange-500/8',
  clickable: false,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="bg-card border border-border rounded-xl p-6 text-left"
    :class="{ 'hover:bg-muted-50 transition-colors cursor-pointer': clickable }"
    @click="clickable && emit('click')"
  >
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-medium text-muted-600">{{ title }}</span>
      <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="iconBg">
        <Icon :icon="icon" class="text-xl" :class="iconColor" />
      </div>
    </div>
    <div class="text-3xl font-bold text-foreground">{{ value }}</div>
    <div v-if="subtitle" class="text-xs text-muted-500 mt-1">{{ subtitle }}</div>
  </component>
</template>

