<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Tag {
  tag: string;
  count: number;
}

interface Props {
  tags: Tag[];
  limit?: number;
}

withDefaults(defineProps<Props>(), {
  limit: 5,
});
</script>

<template>
  <div class="bg-white border border-gray-300 rounded-xl p-6 dark:bg-slate-900 dark:border-slate-700">
    <div class="flex items-center gap-2 mb-4">
      <Icon icon="material-symbols:label" class="text-xl text-orange-500" />
      <h3 class="text-lg font-semibold">Top Tags</h3>
    </div>
    
    <div v-if="tags.length === 0" class="text-center py-8 text-gray-400 text-sm dark:text-slate-500">
      No tags yet
    </div>
    
    <div v-else class="space-y-2">
      <div
        v-for="(tag, index) in tags.slice(0, limit)"
        :key="tag.tag"
        class="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-800"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-400 w-5 dark:text-slate-500">{{ index + 1 }}</span>
          <span class="text-sm font-medium text-gray-900 dark:text-slate-100">#{{ tag.tag }}</span>
        </div>
        <span class="text-xs text-gray-500 dark:text-slate-400">{{ tag.count }}</span>
      </div>
    </div>
  </div>
</template>

