<script setup lang="ts">
import { computed } from 'vue';
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';

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

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<Emits>();

/*
 * The label is also this row's name in `utils/settingsCatalog.ts`, so a search
 * result can scroll to it and ring it without every call site passing an id
 * that would only ever repeat the label back.
 */
const { settingRing } = useSettingsSearch();
const ring = computed(() => settingRing(props.label));
</script>

<template>
  <div
    :data-setting="label"
    :class="[
      flat
        ? 'flex items-start justify-between gap-6 py-3'
        : 'setting-block flex items-start justify-between gap-6',
      ring,
    ]"
  >
    <div class="flex-1 min-w-0">
      <label class="text-sm font-medium text-foreground">{{ label }}</label>
      <p class="text-sm text-muted-500 mt-0.5">{{ description }}</p>
    </div>
    <BaseToggle
      class="shrink-0 mt-0.5"
      :model-value="modelValue"
      :label="label"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
