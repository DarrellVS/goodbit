<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';

interface Props {
  html: string;
}

interface Emits {
  (e: 'timestamp-click', seconds: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const previewRef = ref<HTMLElement | null>(null);

onMounted(() => {
  attachTimestampListeners();
});

watch(() => props.html, async () => {
  await nextTick();
  attachTimestampListeners();
});

function attachTimestampListeners() {
  if (!previewRef.value) return;
  
  const timestampLinks = previewRef.value.querySelectorAll('.timestamp-link');
  timestampLinks.forEach((link) => {
    const seconds = parseFloat(link.getAttribute('data-seconds') || '0');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      emit('timestamp-click', seconds);
    });
  });
}
</script>

<template>
  <div
    ref="previewRef"
    class="markdown-preview min-h-full p-4 prose prose-sm max-w-none overflow-auto"
    v-html="html"
  />
</template>

<style scoped>
:deep(.markdown-preview) {
  @apply text-muted-800;
}

:deep(.markdown-preview h1) {
  @apply text-2xl font-bold mt-6 mb-4 text-foreground;
}

:deep(.markdown-preview h2) {
  @apply text-xl font-bold mt-5 mb-3 text-foreground;
}

:deep(.markdown-preview h3) {
  @apply text-lg font-bold mt-4 mb-2 text-foreground;
}

:deep(.markdown-preview p) {
  @apply mb-3 leading-relaxed;
}

:deep(.markdown-preview ul) {
  @apply list-disc list-inside mb-3 space-y-1;
}

:deep(.markdown-preview ol) {
  @apply list-decimal list-inside mb-3 space-y-1;
}

:deep(.markdown-preview li) {
  @apply mb-1;
}

:deep(.markdown-preview a) {
  @apply text-orange-500 hover:text-orange-600 underline;
}

:deep(.markdown-preview code) {
  @apply bg-muted-100 px-1.5 py-0.5 rounded text-sm font-mono text-orange-600;
}

:deep(.markdown-preview pre) {
  @apply bg-gray-900 text-muted-100 p-4 rounded-lg mb-3 overflow-x-auto;
}

:deep(.markdown-preview pre code) {
  @apply bg-transparent p-0 text-muted-100;
}

:deep(.markdown-preview blockquote) {
  @apply border-l-4 border-orange-400 pl-4 italic my-3 text-muted-600;
}

:deep(.markdown-preview strong) {
  @apply font-bold text-foreground;
}

:deep(.markdown-preview em) {
  @apply italic;
}

:deep(.markdown-preview .timestamp-link) {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-700 font-medium no-underline hover:from-orange-500/30 hover:to-amber-500/30 transition-all cursor-pointer shadow-sm;
}

:deep(.markdown-preview .timestamp-link)::before {
  content: '⏱';
  @apply text-sm;
}
</style>

