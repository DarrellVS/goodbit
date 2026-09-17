<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useLibraryRescan } from '@renderer/composables/library/useLibraryRescan';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';

/**
 * Reread the clips folder, which used to be the biggest button in the app.
 *
 * It was solid orange, in the library header, beside the search field; 3.9
 * moved it into Settings, next to the folder it reads. It is here in Your data
 * instead, beside the backups, because the two answer the same worry with the
 * same shape of promise: something is missing and there is a way to get it
 * back. Somebody who has just unplugged a drive is not looking for the folder
 * picker, they are looking for the undo.
 */
const { rescanning, rescan } = useLibraryRescan();
const { settingRing } = useSettingsSearch();
</script>

<template>
  <div
    data-setting="Rescan the clips folder"
    :class="[
      'p-4 bg-card rounded-lg border border-border flex items-start justify-between gap-4',
      settingRing('Rescan the clips folder'),
    ]"
  >
    <div class="min-w-0">
      <label class="font-medium text-foreground">Rescan the clips folder</label>
      <p class="text-sm text-muted-500 mt-1">
        GoodBit indexes a clip the moment it is recorded and sweeps the folder every few hours, so
        this is rarely needed. It is the way back after a drive was unplugged, or after clips were
        added by something other than GoodBit.
      </p>
    </div>
    <button
      class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm flex items-center gap-2 shrink-0"
      :disabled="rescanning"
      @click="rescan"
    >
      <Icon icon="material-symbols:refresh" :class="{ 'animate-spin': rescanning }" />
      <span>{{ rescanning ? 'Scanning' : 'Rescan' }}</span>
    </button>
  </div>
</template>
