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
  /**
   * Inside a group that already has a card around it.
   *
   * A feature with four settings under it was five bordered boxes in a row, one
   * per switch, which made four dependent choices look like four unrelated
   * ones. Flat drops the card and the minimum height so a row can sit inside a
   * section that provides both.
   */
  flat?: boolean;
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
  <div
    :class="
      flat
        ? 'flex items-center justify-between gap-4 py-3'
        : 'flex items-center justify-between gap-4 min-h-[72px] p-4 bg-card rounded-lg border border-border'
    "
  >
    <div>
      <label class="font-medium text-foreground">{{ label }}</label>
      <p class="text-sm text-muted-500 mt-1">{{ description }}</p>
    </div>
    <!-- A fixed width, so a column of these has one right edge and not four. -->
    <select
      :value="modelValue"
      class="w-44 flex-shrink-0 px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
      @change="handleChange"
    >
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

