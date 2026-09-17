<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';

/**
 * Marks a card as the thing a search result names.
 *
 * `SettingToggle` and `SettingSelect` carry their own `data-setting`, because
 * they already hold the label. A card does not: `BackupsCard` and
 * `SuggestionsCard` are whole features with their own heading, and neither
 * should have to know that a search exists. So the mark goes on the outside, at
 * the one place the card is used.
 */
interface Props {
  /** Exactly the label in `utils/settingsCatalog.ts`. */
  label: string;
}

const props = defineProps<Props>();
const { settingRing } = useSettingsSearch();

const ring = computed(() => settingRing(props.label));
</script>

<template>
  <div :data-setting="label" :class="ring">
    <slot />
  </div>
</template>
