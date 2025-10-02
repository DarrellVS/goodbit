<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { marked } from 'marked';
import { enhanceMarkdownWithTimestamps } from '../../utils/timestampParser';

interface Props {
  modelValue: string;
  placeholder?: string;
  readonly?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'timestamp-click', seconds: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write your notes here... Markdown supported.',
  readonly: false,
});

const emit = defineEmits<Emits>();

const showPreview = ref(false);
const localValue = ref(props.modelValue);
const previewRef = ref<HTMLElement | null>(null);

watch(() => props.modelValue, (newValue) => {
  if (newValue !== localValue.value) {
    localValue.value = newValue;
  }
});

const renderedMarkdown = computed(() => {
  try {
    let html = marked(localValue.value || '') as string;
    
    // Enhance with clickable timestamps
    html = enhanceMarkdownWithTimestamps(html, (seconds) => {
      emit('timestamp-click', seconds);
    });
    
    return html;
  } catch (error) {
    console.error('Markdown parsing error:', error);
    return '<p class="text-red-500">Error parsing markdown</p>';
  }
});

onMounted(() => {
  attachTimestampListeners();
});

watch(showPreview, async () => {
  if (showPreview.value) {
    await nextTick();
    attachTimestampListeners();
  }
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

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  localValue.value = target.value;
  emit('update:modelValue', target.value);
}

function insertMarkdown(prefix: string, suffix = '') {
  const textarea = document.querySelector('.markdown-textarea') as HTMLTextAreaElement;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = localValue.value;
  const selectedText = text.substring(start, end);
  
  const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
  localValue.value = newText;
  emit('update:modelValue', newText);
  
  // Set cursor position after the inserted text
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, end + prefix.length);
  }, 0);
}
</script>

<template>
  <div class="markdown-editor">
    <!-- Toolbar -->
    <div v-if="!readonly" class="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Bold"
        @click="insertMarkdown('**', '**')"
      >
        <Icon icon="material-symbols:format-bold" class="text-lg" />
      </button>
      
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Italic"
        @click="insertMarkdown('*', '*')"
      >
        <Icon icon="material-symbols:format-italic" class="text-lg" />
      </button>
      
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Heading"
        @click="insertMarkdown('## ')"
      >
        <Icon icon="material-symbols:format-h2" class="text-lg" />
      </button>
      
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Link"
        @click="insertMarkdown('[', '](url)')"
      >
        <Icon icon="material-symbols:link" class="text-lg" />
      </button>
      
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Bullet List"
        @click="insertMarkdown('- ')"
      >
        <Icon icon="material-symbols:format-list-bulleted" class="text-lg" />
      </button>
      
      <button
        type="button"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Code"
        @click="insertMarkdown('`', '`')"
      >
        <Icon icon="material-symbols:code" class="text-lg" />
      </button>
      
      <div class="flex-1" />
      
      <button
        type="button"
        class="px-3 py-1.5 rounded hover:bg-gray-200 transition-colors flex items-center gap-2"
        :class="{ 'bg-orange-100 text-orange-600': showPreview }"
        @click="showPreview = !showPreview"
      >
        <Icon :icon="showPreview ? 'material-symbols:edit' : 'material-symbols:visibility'" class="text-lg" />
        <span class="text-sm font-medium">{{ showPreview ? 'Edit' : 'Preview' }}</span>
      </button>
    </div>

    <!-- Editor/Preview -->
    <div class="relative">
      <textarea
        v-if="!showPreview"
        :value="localValue"
        :placeholder="placeholder"
        :readonly="readonly"
        class="markdown-textarea w-full min-h-[200px] p-4 border-0 outline-none focus:ring-0 resize-none font-mono text-sm"
        :class="readonly ? 'bg-gray-50 cursor-default' : 'bg-white'"
        @input="handleInput"
      />
      
      <div
        v-else
        ref="previewRef"
        class="markdown-preview min-h-[200px] p-4 bg-white prose prose-sm max-w-none"
        v-html="renderedMarkdown"
      />
    </div>
  </div>
</template>

<style scoped>
.markdown-editor {
  @apply border border-gray-300 rounded-lg overflow-hidden;
}

.markdown-textarea {
  font-family: 'Courier New', Courier, monospace;
}

/* Markdown Preview Styles */
:deep(.markdown-preview) {
  @apply text-gray-800;
}

:deep(.markdown-preview h1) {
  @apply text-2xl font-bold mt-6 mb-4;
}

:deep(.markdown-preview h2) {
  @apply text-xl font-bold mt-5 mb-3;
}

:deep(.markdown-preview h3) {
  @apply text-lg font-bold mt-4 mb-2;
}

:deep(.markdown-preview p) {
  @apply mb-3;
}

:deep(.markdown-preview ul) {
  @apply list-disc list-inside mb-3;
}

:deep(.markdown-preview ol) {
  @apply list-decimal list-inside mb-3;
}

:deep(.markdown-preview li) {
  @apply mb-1;
}

:deep(.markdown-preview a) {
  @apply text-orange-500 hover:text-orange-600 underline;
}

:deep(.markdown-preview code) {
  @apply bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono;
}

:deep(.markdown-preview pre) {
  @apply bg-gray-100 p-3 rounded mb-3 overflow-x-auto;
}

:deep(.markdown-preview pre code) {
  @apply bg-transparent p-0;
}

:deep(.markdown-preview blockquote) {
  @apply border-l-4 border-gray-300 pl-4 italic my-3;
}

:deep(.markdown-preview strong) {
  @apply font-bold;
}

:deep(.markdown-preview em) {
  @apply italic;
}

:deep(.markdown-preview .timestamp-link) {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium no-underline hover:bg-orange-200 transition-colors cursor-pointer;
}

:deep(.markdown-preview .timestamp-link)::before {
  content: '⏱';
  @apply text-sm;
}
</style>

