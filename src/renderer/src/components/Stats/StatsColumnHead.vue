<script setup lang="ts">
/**
 * The heading over one of the stats columns.
 *
 * `.b-col-head`: a baseline row with the title in the display face at 17px, an
 * optional note on the right, and a hairline under the pair. Its own component
 * because Games, Top Tags, Info and Activity all use it and all four had
 * drifted into slightly different headings inside slightly different boxes.
 */
defineProps<{ title: string; note?: string }>();
</script>

<template>
  <div class="flex items-baseline gap-2.5 pb-2.5 mb-3.5 border-b border-border">
    <h3 class="font-display text-lg font-medium text-foreground">{{ title }}</h3>
    <span v-if="note" class="ml-auto text-sm text-muted-400">{{ note }}</span>
  </div>
</template>
