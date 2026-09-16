<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useConfiguration } from '../../composables/useConfiguration';
import SettingToggle from './SettingToggle.vue';
import KeyboardShortcutCustomization from './KeyboardShortcutCustomization.vue';
import BackupsCard from './BackupsCard.vue';
import SuggestionsCard from './SuggestionsCard.vue';
import SettingAnchor from './SettingAnchor.vue';
import { useSettingsSearch } from '../../composables/useSettingsSearch';

const config = useConfiguration();
const router = useRouter();

/* This one card is written here rather than being a component of its own. */
const { settingRing } = useSettingsSearch();
const showShortcuts = computed(() => config.public.value.enableKeyboardShortcuts);

/**
 * Walk through the first run again.
 *
 * It is the only place that puts the whole thing in order: what GoodBit is,
 * the folder, OBS if it is missing, and the recording setup. Someone who
 * skipped a step on day one, or changed their monitor, or reads it once and
 * wants to change one answer, would otherwise have to remember which settings
 * screen each piece lives on.
 *
 * Nothing is reset by going there. Every step shows what is already set and
 * changes only what is answered.
 */
function runOnboarding(): void {
  void router.push({ name: 'welcome' });
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Advanced Settings</h2>
      <p class="text-sm text-muted-500">Advanced features and experimental options</p>
    </div>

    <div class="space-y-4">
      <div
        data-setting="Run the setup again"
        :class="[
          'p-4 bg-card rounded-lg border border-border flex items-start justify-between gap-4',
          settingRing('Run the setup again'),
        ]"
      >
        <div class="min-w-0">
          <p class="font-medium text-foreground">Run the setup again</p>
          <p class="text-sm text-muted-500 mt-1">
            The first run, from the start: your clips folder, OBS if it is missing, and the
            recording setup. Nothing is reset, and every step shows what is already set.
          </p>
        </div>
        <button
          class="px-3 py-2 rounded-lg border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-sm font-medium text-foreground flex-shrink-0"
          @click="runOnboarding"
        >
          Start it
        </button>
      </div>

      <SettingToggle
        v-model="config.public.value.enableKeyboardShortcuts"
        label="Enable Keyboard Shortcuts"
        description="Use keyboard shortcuts for navigation and actions"
      />

      <!--
        The cards below are whole features with their own headings, so the mark
        that lets a search result point at one goes on the outside rather than
        into three components that have no business knowing a search exists.
      -->
      <SettingAnchor v-if="showShortcuts" label="Keyboard Shortcut Customization">
        <KeyboardShortcutCustomization />
      </SettingAnchor>

      <SettingAnchor label="Suggestions learn from your trims">
        <SuggestionsCard />
      </SettingAnchor>

      <SettingAnchor label="Library backups">
        <BackupsCard />
      </SettingAnchor>

      <div
        data-setting="Where settings are kept"
        :class="[
          'p-4 bg-blue-500/8 border border-blue-500/30 rounded-lg',
          settingRing('Where settings are kept'),
        ]"
      >
        <div class="flex gap-3">
          <Icon icon="material-symbols:info" class="text-blue-500 text-xl flex-shrink-0" />
          <div>
            <h3 class="font-medium text-foreground">Where settings are kept</h3>
            <p class="text-sm text-muted-600 mt-1">
              These preferences live on this computer and stay put between sessions. Where your
              clips are, and where GoodBit publishes to, are under App.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

