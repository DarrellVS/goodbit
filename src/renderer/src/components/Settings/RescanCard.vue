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
    The button on the right, level with the middle of the explanation rather
    than with the heading, in the same column as every other control.
  -->
  <div
    data-setting="Rescan the clips folder"
    :class="['setting-card setting-card-row', settingRing('Rescan the clips folder')]"
  >
    <div class="setting-card-body">
      <h3>Rescan the clips folder</h3>
      <p>
        Only needed after adding clips outside GoodBit or reconnecting a drive.
      </p>
    </div>
    <div class="setting-card-actions">
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
