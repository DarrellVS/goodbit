<script setup lang="ts">
import { computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import SettingToggle from './SettingToggle.vue';
import SettingsGroup from './SettingsGroup.vue';
import SettingAnchor from './SettingAnchor.vue';
import KeyboardShortcutCustomization from './KeyboardShortcutCustomization.vue';
import HealthCard from './HealthCard.vue';

/**
 * Advanced, meaning it now.
 *
 * It used to hold the database backups, the calibration for the whole highlight
 * analysis and re-running the setup, which is to say it held the most important
 * screen in the app behind a word that means "you probably should not". Backups
 * are under Your data, the calibration is under Editing beside the trim
 * settings it learns from, and the setup is under Recording, which is what it
 * walks you through.
 *
 * What is left is two things for people who want to look under the lid, and a
 * note. That is allowed to be short: a section that is short because everything
 * in it found a better home is the point, not a gap.
 *
 * It also used to end with a box explaining that the clips folder and the
 * publisher were on a different screen. That box is gone. A screen that has to
 * tell you about another screen is the maze admitting it, and the search field
 * answers the question it was standing in for.
 */
const config = useConfiguration();

const showShortcuts = computed(() => config.public.value.enableKeyboardShortcuts);
</script>

<template>
  <section class="settings-page">
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Advanced</h2>
      <p class="mt-2 text-muted-500">Shortcuts and system info</p>
    </div>

    <SettingsGroup title="Keyboard">
      <SettingToggle
        v-model="config.public.value.enableKeyboardShortcuts"
        label="Keyboard shortcuts"
        description="Use the app without the mouse."
      />

      <SettingAnchor v-if="showShortcuts" label="Change a shortcut">
        <KeyboardShortcutCustomization />
      </SettingAnchor>
    </SettingsGroup>

    <HealthCard />
  </section>
</template>
