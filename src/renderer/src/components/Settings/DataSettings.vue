<script setup lang="ts">
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import SettingSelect from './SettingSelect.vue';
import BackupsCard from './BackupsCard.vue';
import RescanCard from './RescanCard.vue';
import SettingAnchor from './SettingAnchor.vue';
import SettingToggle from './SettingToggle.vue';

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
  { value: 30, label: '30 seconds' },
  { value: 90, label: '90 seconds' },
  { value: 180, label: '3 minutes' },
];
</script>

<template>
  <section>
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Your data</h2>
      <p class="mt-2 text-muted-500">
        Your clips are files on disk and GoodBit never touches them. Everything on this page is
        about the other half: the names, tags, notes and collections that only exist here.
      </p>
    </div>

    <SettingAnchor label="Library backups">
      <BackupsCard />
    </SettingAnchor>

    <RescanCard />

    <SettingToggle
      v-model="config.public.value.confirmBeforeDelete"
      label="Confirm Before Delete"
      description="Ask for confirmation when deleting clips"
    />

    <h3 class="setting-subhead">Storage Saver</h3>

    <SettingSelect
      label="Call a clip forgotten after"
      description="How long a clip can go unopened, unstarred, untagged and unmarked before Storage Saver offers it up."
      :model-value="settings.unreviewedDays ?? 30"
      :options="AGES"
      @update:model-value="saveSettings({ unreviewedDays: Number($event) })"
    />

    <SettingSelect
      label="Treat saves this close as one moment"
      description="The replay buffer holds the last few seconds, so two presses this close apart have the same footage in both files."
      :model-value="settings.burstWindowSec ?? 90"
      :options="WINDOWS"
      @update:model-value="saveSettings({ burstWindowSec: Number($event) })"
    />
  </section>
</template>
