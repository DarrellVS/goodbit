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
      
      /*
       * Chips only where a press would do something.
       *
       * The handler is not passed on, because the enhancement no longer
       * registers any listeners: it writes `data-seconds` and the preview
       * reads it back off one delegated handler. What is left of the option
       * here is whether there is anywhere for a press to go, and a chip that
       * looks pressable and is not is worse than a plain number.
       */
      if (options.onTimestampClick) {
        html = enhanceMarkdownWithTimestamps(html);
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

