<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsManagement } from '../composables/useSettingsManagement';
import { useSettingsSearch } from '../composables/useSettingsSearch';
import {
  DEFAULT_SECTION,
  resolveSection,
  SETTING_SECTIONS,
  type SettingSectionId,
} from '../utils/settingsSections';
import type { SettingEntry } from '../utils/settingsCatalog';
import SettingsSidebar from '../components/Settings/SettingsSidebar.vue';
import SettingsSearchField from '../components/Settings/SettingsSearchField.vue';
import SettingsSearchResults from '../components/Settings/SettingsSearchResults.vue';
import GeneralSettings from '../components/Settings/GeneralSettings.vue';
import AppSettings from '../components/Settings/AppSettings.vue';
import GamesSettings from '../components/Settings/GamesSettings.vue';
import RecordingSettings from '../components/Settings/RecordingSettings.vue';
import PlaybackSettings from '../components/Settings/PlaybackSettings.vue';
import AdvancedSettings from '../components/Settings/AdvancedSettings.vue';
import McpSettings from '../components/Settings/McpSettings.vue';

const route = useRoute();
const router = useRouter();

const { query, searching, activeIndex, reveal, reset } = useSettingsSearch();

const activeSection = computed<SettingSectionId>(
  () => resolveSection(route.query.section) ?? DEFAULT_SECTION,
);

function setActiveSection(section: string): void {
  void router.push({
    name: 'settings',
    query: { section: resolveSection(section) ?? DEFAULT_SECTION },
  });
}

/**
 * A result names a setting; getting to it is two moves.
 *
 * The section has to be on screen before there is a row to point at, so the
 * navigation happens first and `reveal` waits for the row to be drawn. The
 * query is dropped on the way, because the results panel is what the section
 * is replacing and leaving it up would mean the result went nowhere visible.
 */
async function openResult(entry: SettingEntry): Promise<void> {
  query.value = '';
  activeIndex.value = 0;

  if (entry.section !== activeSection.value) {
    await router.push({ name: 'settings', query: { section: entry.section } });
  }

  reveal(entry);
}

/**
 * `/settings` with nothing after it, or with something nobody recognises.
 *
 * The tray opens the first, and the second is what a stale bookmark looks like.
 * Both land on a real section rather than an empty panel, and the URL is
 * rewritten so there is one spelling of where you are.
 */
watch(
  () => route.query.section,
  (section) => {
    if (route.name !== 'settings') return;
    if (resolveSection(section) !== null) return;
    void router.replace({ name: 'settings', query: { section: DEFAULT_SECTION } });
  },
  { immediate: true },
);

// A search left running is a search that greets the next visit with a results
// list instead of the screen somebody asked for.
onUnmounted(reset);

const { resetToDefaults, exportSettings, importSettings } = useSettingsManagement();
</script>

<template>
  <div class="h-full min-h-0 flex overflow-hidden">
    <SettingsSidebar
      :sections="SETTING_SECTIONS"
      :active-section="activeSection"
      @update:active-section="setActiveSection"
      @export="exportSettings"
      @import="importSettings"
      @reset="resetToDefaults"
    >
      <template #search>
        <SettingsSearchField @select="openResult" />
      </template>
    </SettingsSidebar>

    <main class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto p-8">
        <!--
          The results take the panel rather than sitting over it in a popover.
          A setting on another page is the case this field exists for, so the
          answer is allowed the whole screen, and the sidebar stays beside it so
          that giving up on the search is one click rather than a dead end.
        -->
        <SettingsSearchResults v-if="searching" @select="openResult" />

        <template v-else>
          <GeneralSettings v-if="activeSection === 'general'" />
          <AppSettings v-if="activeSection === 'app'" />
          <RecordingSettings v-if="activeSection === 'recording'" />
          <GamesSettings v-if="activeSection === 'games'" />
          <PlaybackSettings v-if="activeSection === 'playback'" />
          <McpSettings v-if="activeSection === 'connections'" />
          <AdvancedSettings v-if="activeSection === 'advanced'" />
        </template>
      </div>
    </main>
  </div>
</template>
