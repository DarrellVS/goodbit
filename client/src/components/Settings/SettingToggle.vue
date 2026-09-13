<script setup lang="ts">
interface Props {
  modelValue: boolean;
  label: string;
  description: string;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function toggle(): void {
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 dark:bg-slate-900 dark:border-slate-700">
    <div>
      <label class="font-medium text-gray-900 dark:text-slate-100">{{ label }}</label>
      <p class="text-sm text-muted-500 mt-1">{{ description }}</p>
    </div>
    <button
      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      :class="modelValue ? 'bg-orange-500' : 'bg-gray-300'"
      @click="toggle"
    >
      <span
        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform dark:bg-slate-900"
        :class="modelValue ? 'translate-x-6' : 'translate-x-1'"
      />
    </button>
  </div>
</template>

