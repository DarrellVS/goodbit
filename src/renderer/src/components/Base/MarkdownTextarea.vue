<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  modelValue: string;
  placeholder?: string;
  /** Rough height, in rows, so a panel can ask for less than a page. */
  rows?: number;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write your notes here... Markdown supported.',
});

const emit = defineEmits<Emits>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}

defineExpose({
  textareaRef,
});
</script>

<template>
  <textarea
    ref="textareaRef"
    :value="modelValue"
    :placeholder="placeholder"
    class="w-full p-4 border-0 outline-hidden focus:ring-0 resize-none font-mono text-sm bg-card"
    :style="{ minHeight: `${(rows ?? 6) * 1.5 + 2}rem` }"
    @input="handleInput"
  />
</template>

<style scoped>
textarea {
  font-family: 'Courier New', Courier, monospace;
}
</style>

