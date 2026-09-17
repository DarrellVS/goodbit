<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import SettingToggle from './SettingToggle.vue';
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
const { settingRing } = useSettingsSearch();

const showShortcuts = computed(() => config.public.value.enableKeyboardShortcuts);
</script>

<template>
  <section>
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Advanced</h2>
      <p class="mt-2 text-muted-500">Keyboard shortcuts, and what this machine can do</p>
    </div>

    <div class="space-y-4">
      <SettingToggle
        v-model="config.public.value.enableKeyboardShortcuts"
        label="Enable Keyboard Shortcuts"
        description="Use keyboard shortcuts for navigation and actions"
      />

      <SettingAnchor v-if="showShortcuts" label="Keyboard Shortcut Customization">
        <KeyboardShortcutCustomization />
      </SettingAnchor>

      <HealthCard />

      <div
        data-setting="Where settings are kept"
        :class="[
          'p-4 bg-muted-50 border border-border rounded-lg',
          settingRing('Where settings are kept'),
        ]"
      >
        <div class="flex gap-3">
          <Icon icon="material-symbols:info" class="text-muted-500 text-xl shrink-0" />
          <div>
            <h3 class="font-medium text-foreground">Where settings are kept</h3>
            <p class="text-sm text-muted-600 mt-1">
              These preferences live on this computer and stay put between sessions. Export, Import
              and Reset, at the foot of the list on the left, work on all of them at once.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
