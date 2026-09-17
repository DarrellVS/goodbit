<script setup lang="ts">
import StatsColumnHead from './StatsColumnHead.vue';

interface TagStat {
  tag: string;
  count: number;
}

withDefaults(defineProps<{ tags: TagStat[]; limit?: number }>(), { limit: 5 });
</script>

<template>
  <section>
    <StatsColumnHead title="Top Tags" />

    <p v-if="tags.length === 0" class="py-8 text-sm text-muted-500">No tags yet</p>

    <!--
      A rank, a name and a count, on one hairline-separated row. The rank and
      the count are mono and tabular so the two numeric columns line up down
      the list however long the names are.
    -->
    <div
      v-for="(tag, index) in tags.slice(0, limit)"
      :key="tag.tag"
      class="flex items-center gap-3 py-3 px-0.5 border-t border-border text-sm"
    >
      <span class="font-mono text-xs tabular-nums text-muted-400 w-4">{{ index + 1 }}</span>
      <span class="truncate text-foreground">#{{ tag.tag }}</span>
      <span class="ml-auto font-mono text-xs tabular-nums text-muted-500">{{ tag.count }}</span>
    </div>
  </section>
</template>
