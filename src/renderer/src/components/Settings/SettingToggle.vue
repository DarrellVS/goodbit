<script setup lang="ts">
import BaseToggle from '../Base/BaseToggle.vue';

/**
 * One row of the settings screen: what the switch is, what it does, and the
 * switch itself. The switch is `Base/BaseToggle.vue`. There is one of those
 * in the app, not one per screen.
 */
interface Props {
  modelValue: boolean;
  label: string;
  description: string;
  disabled?: boolean;
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
  (e: 'update:modelValue', value: boolean): void;
}

withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<Emits>();
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
    <BaseToggle
      :model-value="modelValue"
      :label="label"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
