<script setup lang="ts">
import { computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import SettingSelect from './SettingSelect.vue';
import BackupsCard from './BackupsCard.vue';
import RescanCard from './RescanCard.vue';
import SettingAnchor from './SettingAnchor.vue';
import SettingToggle from './SettingToggle.vue';
import SettingsGroup from './SettingsGroup.vue';

/**
 * The section for somebody who is worried about losing something.
 *
 * It is the reason the whole reorganisation was worth doing. `BackupsCard` is
 * the one feature standing between a person and losing tags, notes, display
 * names and collections that cannot be re-derived from the files on disk, and
 * it was two levels down behind a word that means "you probably should not".
 * Now it is the first thing on a page named after the worry that sends you
 * looking for it, and it can put a copy back as well as take one.
 *
 * The other two rows answer the same worry in smaller ways: a rescan is the way
 * back after a drive was unplugged, and the delete confirmation is the one that
 * stops the loss happening.
 */
const config = useConfiguration();
const { settings, save: saveSettings } = useAppSettings();

/*
 * The two thresholds Storage Saver reads.
 *
 * They live here rather than on that screen for the same reason the delete
 * confirmation does: they are not what somebody is doing there, they are how
 * strict it should be, and a control that changes what a destructive list
 * contains does not belong beside the button that acts on it.
 *
 * Fixed choices rather than a number field. Both of these are "about a month"
 * and "about a minute and a half" rather than exact values, and a box taking
 * any integer invites 1, which would offer to delete everything recorded
 * yesterday.
 */
const AGES = [
  { value: 7, label: 'A week' },
  { value: 30, label: 'A month' },
  { value: 90, label: 'Three months' },
  { value: 365, label: 'A year' },
];

const WINDOWS = [
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '1 minute' },
];

/**
 * The stored window, shown as the nearest option. The list used to go up to
 * three minutes, so a library set to 90 or 180 seconds shows the closest one
 * rather than an empty dropdown; choosing it writes that value.
 */
const burstWindow = computed(() => {
  const stored = Number(settings.value.burstWindowSec ?? 30);
  return WINDOWS.reduce((best, option) =>
    Math.abs(option.value - stored) < Math.abs(best.value - stored) ? option : best,
  ).value;
});
</script>

<template>
  <section class="settings-page">
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Your data</h2>
      <p class="mt-2 text-muted-500">
        Backups and cleanup. Your clip files are never touched here.
      </p>
    </div>

    <SettingAnchor label="Library backups">
      <BackupsCard />
    </SettingAnchor>

    <RescanCard />

    <SettingsGroup title="Deleting">
      <SettingToggle
        v-model="config.public.value.confirmBeforeDelete"
        label="Confirm Before Delete"
        description="Ask before deleting a clip."
      />
    </SettingsGroup>

    <SettingsGroup
      title="Storage Saver"
    >
      <SettingSelect
        label="Call a clip forgotten after"
        description="When untouched clips show up in Storage Saver."
        :model-value="settings.unreviewedDays ?? 30"
        :options="AGES"
        @update:model-value="saveSettings({ unreviewedDays: Number($event) })"
      />

      <SettingSelect
        label="Treat saves this close as one moment"
        description="Saves closer together than this count as duplicates."
        :model-value="burstWindow"
        :options="WINDOWS"
        @update:model-value="saveSettings({ burstWindowSec: Number($event) })"
      />
    </SettingsGroup>
  </section>
</template>
