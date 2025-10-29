<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsManagement } from '../composables/useSettingsManagement';
import SettingsSidebar from '../components/Settings/SettingsSidebar.vue';
import GeneralSettings from '../components/Settings/GeneralSettings.vue';
import PlaybackSettings from '../components/Settings/PlaybackSettings.vue';
import AdvancedSettings from '../components/Settings/AdvancedSettings.vue';

const route = useRoute();
const router = useRouter();

const VALID_SECTIONS = ['general', 'playback', 'advanced'] as const;
type SettingSection = typeof VALID_SECTIONS[number];

const sections = [
  { id: 'general', label: 'General', icon: 'material-symbols:settings', description: 'General application settings' },
  { id: 'playback', label: 'Playback', icon: 'material-symbols:play-circle', description: 'Video playback preferences' },
  { id: 'advanced', label: 'Advanced', icon: 'material-symbols:tune', description: 'Advanced configuration' },
];

const activeSection = computed<SettingSection>(() => {
  const section = route.query.section as string;
  return VALID_SECTIONS.includes(section as SettingSection) ? (section as SettingSection) : 'general';
});

function setActiveSection(section: string): void {
  const validSection = VALID_SECTIONS.includes(section as SettingSection) ? section : 'general';
  router.push({ 
    name: 'settings', 
    query: { section: validSection }
  });
}

watch(() => route.query.section, (section) => {
  if (!section && route.name === 'settings') {
    router.replace({ name: 'settings', query: { section: 'general' } });
  }
}, { immediate: true });

const { resetToDefaults, exportSettings, importSettings } = useSettingsManagement();
</script>

<template>
  <div class="h-full flex">
    <SettingsSidebar
      :sections="sections"
      :active-section="activeSection"
      @update:active-section="setActiveSection"
      @export="exportSettings"
      @import="importSettings"
      @reset="resetToDefaults"
    />

    <main class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto p-8">
        <GeneralSettings v-if="activeSection === 'general'" />
        <PlaybackSettings v-if="activeSection === 'playback'" />
        <AdvancedSettings v-if="activeSection === 'advanced'" />
      </div>
    </main>
  </div>
</template>
