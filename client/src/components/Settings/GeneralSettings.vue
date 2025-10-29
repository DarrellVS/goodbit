<script setup lang="ts">
import { useConfiguration } from '../../composables/useConfiguration';
import SettingToggle from './SettingToggle.vue';
import SettingSelect from './SettingSelect.vue';

const config = useConfiguration();

const pageSizeOptions = [
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
];

const viewModeOptions = [
  { value: 'grouped', label: 'Grouped' },
  { value: 'grid', label: 'Grid' },
];

const dateFormatOptions = [
  { value: 'relative', label: 'Relative (Today, Yesterday)' },
  { value: 'absolute', label: 'Absolute (MM/DD/YYYY)' },
];
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">General Settings</h2>
      <p class="text-sm text-muted-500">General application settings and preferences</p>
    </div>

    <div class="space-y-4">
      <SettingSelect
        v-model="config.public.value.viewMode"
        label="Default View Mode"
        description="Choose how clips are displayed by default"
        :options="viewModeOptions"
      />

      <SettingSelect
        v-model="config.public.value.dateFormat"
        label="Date Format"
        description="How dates should be displayed"
        :options="dateFormatOptions"
      />

      <SettingToggle
        v-model="config.public.value.showMetadata"
        label="Show Clip Metadata"
        description="Display file size, resolution, and other details"
      />

      <SettingToggle
        v-model="config.public.value.compactMode"
        label="Compact Mode"
        description="Reduce spacing and show more content"
      />

      <SettingSelect
        v-model.number="config.public.value.pageSize"
        label="Items Per Page"
        description="Number of clips to load at once (lower = faster)"
        :options="pageSizeOptions"
      />

      <SettingToggle
        v-model="config.public.value.confirmBeforeDelete"
        label="Confirm Before Delete"
        description="Ask for confirmation when deleting clips"
      />
    </div>
  </section>
</template>

