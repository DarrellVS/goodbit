<script setup lang="ts">
import { computed } from 'vue';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import type { ComboBoxOption, ComboBoxValue } from '@renderer/components/Base/types';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';

/**
 * One row of the settings screen: what the choice is, what it does, and the
 * dropdown itself. The dropdown is `Base/BaseComboBox.vue`. There is one of
 * those in the app, not one per screen, for the same reason there is one
 * switch: see `SettingToggle.vue`, which this is the shape of.
 *
 * This used to be a bare `<select>`, so every one of these rows was drawn by
 * Windows at a height, a font and a focus ring the rest of the screen did not
 * share.
 */
interface Props {
  modelValue: ComboBoxValue;
  label: string;
  description: string;
  options: ComboBoxOption[];
  /** A search field in the list. Off unless a list is long enough to need it. */
  searchable?: boolean;
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
  (e: 'update:modelValue', value: ComboBoxValue): void;
}

const props = withDefaults(defineProps<Props>(), { searchable: false, disabled: false });
const emit = defineEmits<Emits>();

/* The row's name in `utils/settingsCatalog.ts`. See `SettingToggle.vue`. */
const { settingRing } = useSettingsSearch();
const ring = computed(() => settingRing(props.label));

/**
 * A settings row always has a value. The dropdown can report `null`, since a
 * filter is allowed to choose nothing, so that is dropped here rather than
 * written back over a setting that has to hold something.
 */
function onChange(value: ComboBoxValue | ComboBoxValue[] | null): void {
  if (value === null || Array.isArray(value)) return;
  emit('update:modelValue', value);
}
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
    <!--
      Quiet, because a settings row is a line of prose with an answer at the end
      of it, and the design draws that answer as a word with a chevron. A
      bordered box put a rectangle at the end of every row down the page.
    -->
    <BaseComboBox
      variant="quiet"
      class="shrink-0 mt-0.5"
      :model-value="modelValue"
      :label="label"
      :options="options"
      :searchable="searchable"
      :disabled="disabled"
      @update:model-value="onChange"
    />
  </div>
</template>
