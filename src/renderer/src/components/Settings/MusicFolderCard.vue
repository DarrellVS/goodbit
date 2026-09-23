<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import { useToastStore } from '@renderer/stores/toast';

/**
 * Where the music comes from, under Editing because that is the only place it
 * is ever used.
 *
 * It was beside the clips folder, in a section called App, on the grounds that
 * both are folders. That is a filing rule rather than a reason: nothing about
 * this folder has anything to do with where clips are kept, and somebody
 * looking for it has come from the editor.
 *
 * The line under it is new. The row was a label and a path, which told anybody
 * who did not already know what it was for exactly nothing.
 */
const { settings, load, pickFolder } = useAppSettings();
const { settingRing } = useSettingsSearch();
const toast = useToastStore();

onMounted(load);

async function change(): Promise<void> {
  const chosen = await pickFolder('audioRoot', 'Where is your music?');
  if (chosen) toast.success('Folder updated');
}
</script>

<template>
  <!-- The same shape as the clips folder: what it is, then the button on the right. -->
  <div
    data-setting="Music folder"
    :class="['setting-card setting-card-row', settingRing('Music folder')]"
  >
    <div class="setting-card-body">
      <h3>Music folder</h3>
      <p class="font-mono !text-foreground !mt-2 truncate" :title="settings.audioRoot">
        {{ settings.audioRoot || 'Not set' }}
      </p>
      <p>Music for the editor.</p>
    </div>
    <div class="setting-card-actions">
      <BaseButton @click="change">Change</BaseButton>
    </div>
  </div>
</template>
