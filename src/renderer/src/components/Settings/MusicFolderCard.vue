<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { useSettingsSearch } from '../../composables/useSettingsSearch';
import { useToastStore } from '../../stores/toast';

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
  <div
    data-setting="Music folder"
    :class="[
      'p-4 bg-card rounded-lg border border-border flex items-start justify-between gap-4',
      settingRing('Music folder'),
    ]"
  >
    <div class="min-w-0">
      <label class="font-medium text-foreground">Music folder</label>
      <p class="text-sm text-muted-500 mt-1 truncate">
        {{ settings.audioRoot || 'Not set' }}
      </p>
      <p class="text-xs text-muted-500 mt-1.5">
        Where GoodBit looks for the audio you can lay under a clip in the editor.
      </p>
    </div>
    <button
      class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm shrink-0"
      @click="change"
    >
      Change
    </button>
  </div>
</template>
