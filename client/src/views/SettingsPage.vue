<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useConfiguration } from '../composables/useConfiguration';
import { useToastStore } from '../stores/toast';

const config = useConfiguration();
const toastStore = useToastStore();
const activeSection = ref<string>('general');

interface SettingSection {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const sections: SettingSection[] = [
  { id: 'general', label: 'General', icon: 'material-symbols:settings', description: 'General application settings' },
  { id: 'playback', label: 'Playback', icon: 'material-symbols:play-circle', description: 'Video playback preferences' },
  { id: 'advanced', label: 'Advanced', icon: 'material-symbols:tune', description: 'Advanced configuration' },
];

const pageSizeOptions = [10, 25, 50, 100, 200];

function resetToDefaults() {
  if (confirm('Are you sure you want to reset all settings to their default values?')) {
        config.public.value = {
          viewMode: 'grouped',
          pageSize: 50,
          autoPlayOnHover: true,
          showMetadata: true,
          dateFormat: 'relative',
          enableKeyboardShortcuts: true,
          confirmBeforeDelete: true,
          compactMode: false,
          muteVideosByDefault: false,
        };
    toastStore.success('Settings reset to defaults');
  }
}

function exportSettings() {
  const data = JSON.stringify(config.public.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `filmpje-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toastStore.success('Settings exported successfully');
}

function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        config.public.value = { ...config.public.value, ...imported };
        toastStore.success('Settings imported successfully');
      } catch (error) {
        toastStore.error('Failed to import settings. Invalid file format.');
      }
    }
  };
  input.click();
}
</script>

<template>
  <div class="h-full flex">
    <!-- Settings Sidebar -->
    <aside class="w-64 border-r border-gray-200 bg-gray-50/50 flex flex-col">
      <div class="p-6">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <Icon icon="material-symbols:settings" class="text-orange-500" />
          Settings
        </h1>
        <p class="text-sm text-muted-500 mt-1">Customize your experience</p>
      </div>

      <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
        <button
          v-for="section in sections"
          :key="section.id"
          class="w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-colors text-left"
          :class="activeSection === section.id 
            ? 'bg-orange-500/10 text-orange-600' 
            : 'hover:bg-white/50 text-gray-700'"
          @click="activeSection = section.id"
        >
          <Icon :icon="section.icon" class="text-xl mt-0.5 flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="font-medium">{{ section.label }}</div>
            <div class="text-xs text-muted-500 mt-0.5">{{ section.description }}</div>
          </div>
        </button>
      </nav>

      <div class="p-3 border-t border-gray-200 space-y-2">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/50 transition-colors text-sm text-gray-700"
          @click="exportSettings"
        >
          <Icon icon="material-symbols:download" />
          Export Settings
        </button>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/50 transition-colors text-sm text-gray-700"
          @click="importSettings"
        >
          <Icon icon="material-symbols:upload" />
          Import Settings
        </button>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm text-red-600"
          @click="resetToDefaults"
        >
          <Icon icon="material-symbols:restart-alt" />
          Reset to Defaults
        </button>
      </div>
    </aside>

    <!-- Settings Content -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto p-8">
        <!-- General Settings -->
        <section v-if="activeSection === 'general'" class="space-y-6">
          <div>
            <h2 class="text-xl font-semibold mb-1">General Settings</h2>
            <p class="text-sm text-muted-500">General application settings and preferences</p>
          </div>

          <div class="space-y-4">
            <!-- View Mode -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Default View Mode</label>
                <p class="text-sm text-muted-500 mt-1">Choose how clips are displayed by default</p>
              </div>
              <select
                v-model="config.public.value.viewMode"
                class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                <option value="grouped">Grouped</option>
                <option value="grid">Grid</option>
              </select>
            </div>

            <!-- Date Format -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Date Format</label>
                <p class="text-sm text-muted-500 mt-1">How dates should be displayed</p>
              </div>
              <select
                v-model="config.public.value.dateFormat"
                class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                <option value="relative">Relative (Today, Yesterday)</option>
                <option value="absolute">Absolute (MM/DD/YYYY)</option>
              </select>
            </div>

            <!-- Show Metadata -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Show Clip Metadata</label>
                <p class="text-sm text-muted-500 mt-1">Display file size, resolution, and other details</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.showMetadata ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.showMetadata = !config.public.value.showMetadata"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.showMetadata ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- Compact Mode -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Compact Mode</label>
                <p class="text-sm text-muted-500 mt-1">Reduce spacing and show more content</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.compactMode ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.compactMode = !config.public.value.compactMode"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.compactMode ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- Page Size -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Items Per Page</label>
                <p class="text-sm text-muted-500 mt-1">Number of clips to load at once (lower = faster)</p>
              </div>
              <select
                v-model.number="config.public.value.pageSize"
                class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                <option v-for="size in pageSizeOptions" :key="size" :value="size">
                  {{ size }}
                </option>
              </select>
            </div>

            <!-- Confirm Delete -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Confirm Before Delete</label>
                <p class="text-sm text-muted-500 mt-1">Ask for confirmation when deleting clips</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.confirmBeforeDelete ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.confirmBeforeDelete = !config.public.value.confirmBeforeDelete"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.confirmBeforeDelete ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>
        </section>

        <!-- Playback Settings -->
        <section v-if="activeSection === 'playback'" class="space-y-6">
          <div>
            <h2 class="text-xl font-semibold mb-1">Playback Settings</h2>
            <p class="text-sm text-muted-500">Control video playback behavior</p>
          </div>

          <div class="space-y-4">
            <!-- Auto Play on Hover -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Auto-play on Hover</label>
                <p class="text-sm text-muted-500 mt-1">Automatically play clips when hovering over them</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.autoPlayOnHover ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.autoPlayOnHover = !config.public.value.autoPlayOnHover"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.autoPlayOnHover ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- Mute by Default -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Mute Videos by Default</label>
                <p class="text-sm text-muted-500 mt-1">Start videos muted (can be unmuted manually)</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.muteVideosByDefault ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.muteVideosByDefault = !config.public.value.muteVideosByDefault"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.muteVideosByDefault ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>
        </section>

        <!-- Advanced Settings -->
        <section v-if="activeSection === 'advanced'" class="space-y-6">
          <div>
            <h2 class="text-xl font-semibold mb-1">Advanced Settings</h2>
            <p class="text-sm text-muted-500">Advanced features and experimental options</p>
          </div>

          <div class="space-y-4">
            <!-- Keyboard Shortcuts -->
            <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
              <div>
                <label class="font-medium text-gray-900">Enable Keyboard Shortcuts</label>
                <p class="text-sm text-muted-500 mt-1">Use keyboard shortcuts for navigation and actions</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="config.public.value.enableKeyboardShortcuts ? 'bg-orange-500' : 'bg-gray-300'"
                @click="config.public.value.enableKeyboardShortcuts = !config.public.value.enableKeyboardShortcuts"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="config.public.value.enableKeyboardShortcuts ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- Info Box -->
            <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex gap-3">
                <Icon icon="material-symbols:info" class="text-blue-500 text-xl flex-shrink-0" />
                <div>
                  <h3 class="font-medium text-blue-900">Storage Information</h3>
                  <p class="text-sm text-blue-700 mt-1">
                    Settings are automatically saved to your browser's local storage. 
                    They will persist across sessions on this device and won't be lost when you close the app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

