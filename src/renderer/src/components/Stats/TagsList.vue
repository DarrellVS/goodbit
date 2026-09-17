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
  <div class="bg-card border border-border rounded-md p-6">
    <div class="flex items-center gap-2 mb-4">
      <Icon icon="material-symbols:label" class="text-xl text-muted-500" />
      <h3 class="text-lg font-semibold">Top Tags</h3>
    </div>
    
    <div v-if="tags.length === 0" class="text-center py-8 text-muted-400 text-sm">
      No tags yet
    </div>
    
    <div v-else class="space-y-2">
      <div
        v-for="(tag, index) in tags.slice(0, limit)"
        :key="tag.tag"
        class="flex items-center justify-between py-2 px-3 rounded-lg bg-muted-50"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-muted-400 w-5">{{ index + 1 }}</span>
          <span class="text-sm font-medium text-foreground">#{{ tag.tag }}</span>
        </div>
        <span class="text-xs text-muted-500">{{ tag.count }}</span>
      </div>
    </div>
  </div>
</template>

