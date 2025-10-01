<script lang="ts" setup>
defineProps<{ active?: boolean }>();
</script>

<template>
  <button
    class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-white text-sm font-medium text-foreground/80 border border-gray-300 shadow-soft hover:bg-muted-50 transition"
    :class="{ 'ring-2 ring-primary/40 border-primary/60': active }"
  >
    <slot />
  </button>
</template>


