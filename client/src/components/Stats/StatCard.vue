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
  iconBg: 'bg-orange-50',
  clickable: false,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="bg-white border border-gray-300 rounded-xl p-6 text-left dark:bg-slate-900 dark:border-slate-700"
    :class="{ 'hover:bg-gray-50 transition-colors cursor-pointer': clickable }"
    @click="clickable && emit('click')"
  >
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-medium text-gray-600 dark:text-slate-400">{{ title }}</span>
      <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="iconBg">
        <Icon :icon="icon" class="text-xl" :class="iconColor" />
      </div>
    </div>
    <div class="text-3xl font-bold text-gray-900 dark:text-slate-100">{{ value }}</div>
    <div v-if="subtitle" class="text-xs text-gray-500 mt-1 dark:text-slate-400">{{ subtitle }}</div>
  </component>
</template>

