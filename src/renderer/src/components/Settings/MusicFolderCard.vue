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
  <!--
    A heading, the path, what it is for, then the button. The same shape as the
    clips folder directly above it, which it was not: the button sat level with
    the heading while the path and the sentence ran underneath it, so the one
    control on the row belonged to the shortest line on it.
  -->
  <div
    data-setting="Music folder"
    :class="['setting-card', settingRing('Music folder')]"
  >
    <h3>Music folder</h3>

    <p class="font-mono !text-foreground !mt-2 truncate" :title="settings.audioRoot">
      {{ settings.audioRoot || 'Not set' }}
    </p>

    <p>Where GoodBit looks for the audio you can lay under a clip in the editor.</p>

    <div class="mt-4">
      <BaseButton @click="change">Change</BaseButton>
    </div>
  </div>
</template>
