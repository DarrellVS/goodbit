<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsManagement } from '@renderer/composables/settings/useSettingsManagement';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import {
  DEFAULT_SECTION,
  resolveSection,
  SETTING_SECTIONS,
  type SettingSectionId,
} from '@renderer/utils/settingsSections';
import type { SettingEntry } from '@renderer/utils/settingsCatalog';
import SettingsSidebar from '@renderer/components/Settings/SettingsSidebar.vue';
import SettingsSearchField from '@renderer/components/Settings/SettingsSearchField.vue';
import SettingsSearchResults from '@renderer/components/Settings/SettingsSearchResults.vue';
import RecordingSettings from '@renderer/components/Settings/RecordingSettings.vue';
import WatchingSettings from '@renderer/components/Settings/WatchingSettings.vue';
import EditingSettings from '@renderer/components/Settings/EditingSettings.vue';
import DataSettings from '@renderer/components/Settings/DataSettings.vue';
import ConnectionsSettings from '@renderer/components/Settings/ConnectionsSettings.vue';
import AdvancedSettings from '@renderer/components/Settings/AdvancedSettings.vue';

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
 * `/settings` with nothing after it, with a name a section used to have, or
 * with something nobody recognises.
 *
 * The tray opens the first. The second is somebody's bookmark, a bench script
 * or `screens.spec.ts`, all of which still ask for `general`, `app`, `games`
 * and `playback`: `resolveSection` sends each to wherever the bulk of that page
 * went, and the URL is then rewritten to the section actually on screen so
 * there is one spelling of where you are. The third is a typo, and it lands on
 * a real page rather than an empty panel.
 */
watch(
  () => route.query.section,
  (section) => {
    if (route.name !== 'settings') return;

    const resolved = resolveSection(section);
    if (resolved === section) return;

    void router.replace({ name: 'settings', query: { section: resolved ?? DEFAULT_SECTION } });
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

    <main class="flex-1 overflow-y-auto scroll-p-1.5">
      <div class="max-w-4xl mx-auto p-8">
        <!--
          The results take the panel rather than sitting over it in a popover.
          A setting on another page is the case this field exists for, so the
          answer is allowed the whole screen, and the sidebar stays beside it so
          that giving up on the search is one click rather than a dead end.
        -->
        <SettingsSearchResults v-if="searching" @select="openResult" />

        <template v-else>
          <RecordingSettings v-if="activeSection === 'recording'" />
          <WatchingSettings v-if="activeSection === 'watching'" />
          <EditingSettings v-if="activeSection === 'editing'" />
          <DataSettings v-if="activeSection === 'data'" />
          <ConnectionsSettings v-if="activeSection === 'connections'" />
          <AdvancedSettings v-if="activeSection === 'advanced'" />
        </template>
      </div>
    </main>
  </div>
</template>
