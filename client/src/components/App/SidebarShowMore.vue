<script setup lang="ts">
interface Props {
  showAll: boolean;
  totalCount: number;
  visibleCount: number;
}

interface Emits {
  (e: 'toggle'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <button
    class="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-xs text-muted-400 hover:text-foreground"
    @click="emit('toggle')"
  >
    {{ showAll ? 'Show less' : `Show ${totalCount - visibleCount} more` }}
  </button>
</template>

