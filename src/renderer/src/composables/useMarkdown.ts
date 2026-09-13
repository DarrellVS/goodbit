import { ref, computed, type Ref } from 'vue';
import { marked } from 'marked';
import { enhanceMarkdownWithTimestamps } from '../utils/timestampParser';

export interface UseMarkdownOptions {
  initialValue?: string;
  onTimestampClick?: (seconds: number) => void;
}

export function useMarkdown(options: UseMarkdownOptions = {}) {
  const content = ref(options.initialValue || '');
  const showPreview = ref(false);
  
  const renderedMarkdown = computed(() => {
    try {
      let html = marked(content.value || '') as string;
      
      if (options.onTimestampClick) {
        html = enhanceMarkdownWithTimestamps(html, options.onTimestampClick);
      }
      
      return html;
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return '<p class="text-red-500">Error parsing markdown</p>';
    }
  });

  const isEmpty = computed(() => !content.value || content.value.trim().length === 0);

  function insertMarkdown(prefix: string, suffix = '', textarea?: HTMLTextAreaElement | null) {
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = content.value;
    const selectedText = text.substring(start, end);
    
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    content.value = newText;
    
    // Set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  }

  function togglePreview() {
    showPreview.value = !showPreview.value;
  }

  function setContent(value: string) {
    content.value = value;
  }

  return {
    content,
    showPreview,
    renderedMarkdown,
    isEmpty,
    insertMarkdown,
    togglePreview,
    setContent,
  };
}

