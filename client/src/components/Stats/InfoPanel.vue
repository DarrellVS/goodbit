<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface InfoItem {
  label: string;
  value: string | number;
}

interface Props {
  items: InfoItem[];
}

defineProps<Props>();
</script>

<template>
  <div class="bg-white border border-gray-300 rounded-xl p-6 dark:bg-slate-900 dark:border-slate-700">
    <div class="flex items-center gap-2 mb-4">
      <Icon icon="material-symbols:info" class="text-xl text-orange-500" />
      <h3 class="text-lg font-semibold">Info</h3>
    </div>
    
    <div class="space-y-2 text-sm">
      <div
        v-for="(item, index) in items"
        :key="item.label"
        class="flex justify-between py-2"
        :class="{ 'border-t border-gray-100': index > 0 }"
      >
        <span class="text-gray-600 dark:text-slate-400">{{ item.label }}</span>
        <span class="font-medium text-gray-900 dark:text-slate-100">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

