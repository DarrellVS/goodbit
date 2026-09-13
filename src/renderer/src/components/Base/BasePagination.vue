<script setup lang="ts">
interface Props {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface Emits {
  (e: 'next'): void;
  (e: 'previous'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <nav 
    class="flex items-center justify-center gap-3 pt-6" 
    aria-label="Pagination"
  >
    <button 
      class="px-4 py-2 rounded-lg bg-white/5 border border-gray-300 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700" 
      :disabled="!hasPrevious" 
      :aria-label="hasPrevious ? 'Go to previous page' : 'No previous page'"
      @click="emit('previous')"
    >
      Prev
    </button>
    
    <span class="text-sm text-muted-400" aria-current="page">
      {{ currentPage }} / {{ totalPages }}
    </span>
    
    <button 
      class="px-4 py-2 rounded-lg bg-white/5 border border-gray-300 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700" 
      :disabled="!hasNext" 
      :aria-label="hasNext ? 'Go to next page' : 'No next page'"
      @click="emit('next')"
    >
      Next
    </button>
  </nav>
</template>

