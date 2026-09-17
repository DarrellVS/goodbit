<script setup lang="ts">
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import BackupsCard from './BackupsCard.vue';
import RescanCard from './RescanCard.vue';
import SettingAnchor from './SettingAnchor.vue';
import SettingToggle from './SettingToggle.vue';

/**
 * The section for somebody who is worried about losing something.
 *
 * It is the reason the whole reorganisation was worth doing. `BackupsCard` is
 * the one feature standing between a person and losing tags, notes, display
 * names and collections that cannot be re-derived from the files on disk, and
 * it was two levels down behind a word that means "you probably should not".
 * Now it is the first thing on a page named after the worry that sends you
 * looking for it, and it can put a copy back as well as take one.
 *
 * The other two rows answer the same worry in smaller ways: a rescan is the way
 * back after a drive was unplugged, and the delete confirmation is the one that
 * stops the loss happening.
 */
const config = useConfiguration();
</script>

<template>
  <section>
    <div class="pb-2">
      <h2 class="font-display text-2xl font-medium text-foreground mb-1">Your data</h2>
      <p class="text-sm text-muted-500">
        Your clips are files on disk and GoodBit never touches them. Everything on this page is
        about the other half: the names, tags, notes and collections that only exist here.
      </p>
    </div>

    <div class="space-y-4">
      <SettingAnchor label="Library backups">
        <BackupsCard />
      </SettingAnchor>

      <RescanCard />

      <SettingToggle
        v-model="config.public.value.confirmBeforeDelete"
        label="Confirm Before Delete"
        description="Ask for confirmation when deleting clips"
      />
    </div>
  </section>
</template>
