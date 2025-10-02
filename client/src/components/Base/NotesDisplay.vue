<script setup lang="ts">
import { computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useMarkdown } from '../../composables/useMarkdown';

interface Props {
  notes: string | null;
}

interface Emits {
  (e: 'edit'): void;
  (e: 'timestamp-click', seconds: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { renderedMarkdown, isEmpty, setContent } = useMarkdown({
  initialValue: props.notes || '',
  onTimestampClick: (seconds) => emit('timestamp-click', seconds),
});

// Watch for notes changes and update the markdown content
watch(() => props.notes, (newNotes) => {
  setContent(newNotes || '');
}, { immediate: true });

const hasNotes = computed(() => props.notes && props.notes.trim().length > 0);
</script>

<template>
  <div class="notes-display">
    <!-- Empty State -->
    <div
      v-if="!hasNotes"
      class="flex flex-col items-center justify-center py-12 px-6 text-center"
    >
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center mb-4">
        <Icon icon="material-symbols:note-add" class="text-3xl text-orange-600" />
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">No notes yet</h3>
      <p class="text-sm text-gray-600 mb-6 max-w-md">
        Add notes to remember context, mark important moments with timestamps, or annotate your clip with markdown formatting.
      </p>
      <button
        class="px-6 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30 flex items-center gap-2"
        @click="emit('edit')"
      >
        <Icon icon="material-symbols:add" class="text-xl" />
        <span>Add Notes</span>
      </button>
    </div>

    <!-- Notes Content -->
    <div v-else class="relative">
      <div class="absolute top-0 right-0 z-10">
        <button
          class="px-4 py-2 rounded-lg bg-white border border-gray-300 hover:border-orange-500 hover:bg-orange-50 transition-all shadow-sm flex items-center gap-2 text-sm font-medium"
          @click="emit('edit')"
        >
          <Icon icon="material-symbols:edit" class="text-lg" />
          <span>Edit Notes</span>
        </button>
      </div>
      
      <div class="pr-28">
        <div class="prose prose-sm max-w-none" v-html="renderedMarkdown" />
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.prose) {
  @apply text-gray-800;
}

:deep(.prose h1) {
  @apply text-2xl font-bold mt-6 mb-4 text-gray-900;
}

:deep(.prose h2) {
  @apply text-xl font-bold mt-5 mb-3 text-gray-900;
}

:deep(.prose h3) {
  @apply text-lg font-bold mt-4 mb-2 text-gray-900;
}

:deep(.prose p) {
  @apply mb-3 leading-relaxed;
}

:deep(.prose ul) {
  @apply list-disc list-inside mb-3 space-y-1;
}

:deep(.prose ol) {
  @apply list-decimal list-inside mb-3 space-y-1;
}

:deep(.prose li) {
  @apply mb-1;
}

:deep(.prose a) {
  @apply text-orange-500 hover:text-orange-600 underline;
}

:deep(.prose code) {
  @apply bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-orange-600;
}

:deep(.prose pre) {
  @apply bg-gray-900 text-gray-100 p-4 rounded-lg mb-3 overflow-x-auto;
}

:deep(.prose pre code) {
  @apply bg-transparent p-0 text-gray-100;
}

:deep(.prose blockquote) {
  @apply border-l-4 border-orange-400 pl-4 italic my-3 text-gray-600;
}

:deep(.prose strong) {
  @apply font-bold text-gray-900;
}

:deep(.prose em) {
  @apply italic;
}

:deep(.prose .timestamp-link) {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 font-medium no-underline hover:from-orange-200 hover:to-amber-200 transition-all cursor-pointer shadow-sm;
}

:deep(.prose .timestamp-link)::before {
  content: '⏱';
  @apply text-sm;
}
</style>

