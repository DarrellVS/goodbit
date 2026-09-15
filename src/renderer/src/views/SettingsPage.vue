<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsManagement } from '../composables/useSettingsManagement';
import SettingsSidebar from '../components/Settings/SettingsSidebar.vue';
import GeneralSettings from '../components/Settings/GeneralSettings.vue';
import AppSettings from '../components/Settings/AppSettings.vue';
import GamesSettings from '../components/Settings/GamesSettings.vue';
import RecordingSettings from '../components/Settings/RecordingSettings.vue';
import PlaybackSettings from '../components/Settings/PlaybackSettings.vue';
import AdvancedSettings from '../components/Settings/AdvancedSettings.vue';
import McpSettings from '../components/Settings/McpSettings.vue';

const route = useRoute();
const router = useRouter();

const VALID_SECTIONS = ['general', 'app', 'recording', 'games', 'playback', 'connections', 'advanced'] as const;
type SettingSection = typeof VALID_SECTIONS[number];

const sections = [
  { id: 'general', label: 'General', icon: 'material-symbols:settings', description: 'General application settings' },
  { id: 'app', label: 'App', icon: 'material-symbols:tune', description: 'Folders, startup and publishing' },
  {
    id: 'recording',
    label: 'Recording',
    icon: 'material-symbols:fiber-manual-record',
    description: 'OBS, the replay buffer, and a folder per game',
  },
  { id: 'games', label: 'Games', icon: 'material-symbols:videogame-asset', description: 'Hide games from your library' },
  { id: 'playback', label: 'Playback', icon: 'material-symbols:play-circle', description: 'Video playback preferences' },
  {
    id: 'connections',
    label: 'Connections',
    icon: 'material-symbols:robot-2-outline',
    description: 'Let Claude Code work on your clips',
  },
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
  <div class="h-full min-h-0 flex overflow-hidden">
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
        <AppSettings v-if="activeSection === 'app'" />
        <RecordingSettings v-if="activeSection === 'recording'" />
        <GamesSettings v-if="activeSection === 'games'" />
        <PlaybackSettings v-if="activeSection === 'playback'" />
        <McpSettings v-if="activeSection === 'connections'" />
        <AdvancedSettings v-if="activeSection === 'advanced'" />
      </div>
    </main>
  </div>
</template>
