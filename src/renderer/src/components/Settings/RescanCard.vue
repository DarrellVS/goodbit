<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useLibraryRescan } from '@renderer/composables/library/useLibraryRescan';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { ICON_BOX } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

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
  <!--
    The button is under the sentence, not level with the heading.

    `.b-setting` puts a control on the right, and that is the shape for a
    switch or a dropdown: a question and its answer on one line. This is a
    two line explanation of when you would want it, and a button floated
    beside the first of those lines reads as belonging to the heading rather
    than to the paragraph that says what pressing it does.
  -->
  <div
    data-setting="Rescan the clips folder"
    :class="['setting-card', settingRing('Rescan the clips folder')]"
  >
    <h3>Rescan the clips folder</h3>
    <p>
      GoodBit indexes a clip the moment it is recorded and sweeps the folder every few hours, so
      this is rarely needed. It is the way back after a drive was unplugged, or after clips were
      added by something other than GoodBit.
    </p>
    <div class="mt-4">
      <BaseButton :disabled="rescanning" @click="rescan">
        <Icon
          icon="material-symbols:refresh"
          :class="[ICON_BOX, { 'animate-spin': rescanning }]"
        />
        <span>{{ rescanning ? 'Scanning' : 'Rescan' }}</span>
      </BaseButton>
    </div>
  </div>
</template>
