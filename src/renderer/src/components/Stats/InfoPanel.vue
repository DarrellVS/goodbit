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
  <div class="bg-muted-50 rounded-md p-5">
    <div class="flex items-center gap-2 mb-4">
      <h3 class="text-sm font-medium text-muted-600">Info</h3>
    </div>

    <div class="space-y-2 text-sm">
      <div
        v-for="(item, index) in items"
        :key="item.label"
        class="flex justify-between py-2"
        :class="{ 'border-t border-border': index > 0 }"
      >
        <span class="text-muted-600">{{ item.label }}</span>
        <span class="font-medium text-foreground">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

