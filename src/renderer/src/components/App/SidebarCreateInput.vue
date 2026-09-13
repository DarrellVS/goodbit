<script setup lang="ts">
interface Props {
  modelValue: string;
  placeholder?: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
  (e: 'cancel'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="px-3 mb-2">
    <input
      :value="modelValue"
      :placeholder="placeholder"
      class="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-card/5 outline-none focus:ring-2 focus:ring-orange-500/50"
      @input="handleInput"
      @keyup.enter="emit('submit')"
      @keyup.esc="emit('cancel')"
    />
  </div>
</template>

