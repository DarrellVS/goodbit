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
    type="button"
    class="w-full h-9 pl-4 pr-3 flex items-center rounded-md text-left text-sm text-muted-500 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
    @click="emit('toggle')"
  >
    {{ showAll ? 'Show less' : `Show ${totalCount - visibleCount} more` }}
  </button>
</template>

