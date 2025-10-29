<script setup lang="ts">
interface SelectOption {
  value: string | number;
  label: string;
}

interface Props {
  modelValue: string | number;
  label: string;
  description: string;
  options: SelectOption[];
}

interface Emits {
  (e: 'update:modelValue', value: string | number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function handleChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const option = props.options.find(opt => String(opt.value) === target.value);
  if (option) {
    emit('update:modelValue', option.value);
  }
}
</script>

<template>
  <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
    <div>
      <label class="font-medium text-gray-900">{{ label }}</label>
      <p class="text-sm text-muted-500 mt-1">{{ description }}</p>
    </div>
    <select
      :value="modelValue"
      class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
      @change="handleChange"
    >
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

