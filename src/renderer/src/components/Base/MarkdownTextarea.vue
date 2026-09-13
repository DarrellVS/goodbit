<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  modelValue: string;
  placeholder?: string;
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
    class="w-full min-h-[300px] p-4 border-0 outline-none focus:ring-0 resize-none font-mono text-sm bg-card"
    @input="handleInput"
  />
</template>

<style scoped>
textarea {
  font-family: 'Courier New', Courier, monospace;
}
</style>

