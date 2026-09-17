<script setup lang="ts">
interface Props {
  published?: boolean;
}

defineProps<Props>();
</script>

<template>
  <div v-if="published" class="absolute top-3 right-4 z-10 group-hover:right-14 transition-all">
    <span class="bg-green-500/90 text-white text-xs font-medium px-2 py-1 rounded-sm">
      Published
    </span>
  </div>
</template>

