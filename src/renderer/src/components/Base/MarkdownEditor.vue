<script setup lang="ts">
import { watch, ref } from 'vue';
import { useMarkdown } from '../../composables/useMarkdown';
import MarkdownToolbar from './MarkdownToolbar.vue';
import MarkdownPreview from './MarkdownPreview.vue';
import MarkdownTextarea from './MarkdownTextarea.vue';

interface Props {
  modelValue: string;
  placeholder?: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'timestamp-click', seconds: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write your notes here... Markdown supported.',
});

const emit = defineEmits<Emits>();

const textareaComponent = ref<InstanceType<typeof MarkdownTextarea> | null>(null);

const {
  content,
  showPreview,
  renderedMarkdown,
  insertMarkdown,
  togglePreview,
  setContent,
} = useMarkdown({
  initialValue: props.modelValue,
  onTimestampClick: (seconds) => emit('timestamp-click', seconds),
});

watch(() => props.modelValue, (newValue) => {
  if (newValue !== content.value) {
    setContent(newValue);
  }
});

watch(content, (newValue) => {
  emit('update:modelValue', newValue);
});

function handleInsert(prefix: string, suffix = '') {
  const textarea = textareaComponent.value?.textareaRef;
  if (textarea) {
    insertMarkdown(prefix, suffix, textarea);
  }
}
</script>

<template>
  <div class="markdown-editor">
    <MarkdownToolbar
      :show-preview="showPreview"
      @insert="handleInsert"
      @toggle-preview="togglePreview"
    />

    <div class="relative bg-card">
      <MarkdownTextarea
        v-if="!showPreview"
        ref="textareaComponent"
        v-model="content"
        :placeholder="placeholder"
      />
      
      <MarkdownPreview
        v-else
        :html="renderedMarkdown"
        @timestamp-click="(seconds) => $emit('timestamp-click', seconds)"
      />
    </div>
  </div>
</template>

<style scoped>
.markdown-editor {
  @apply border border-border rounded-lg overflow-hidden shadow-sm;
}
</style>

