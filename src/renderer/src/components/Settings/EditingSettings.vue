<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import SettingToggle from './SettingToggle.vue';
import MusicFolderCard from './MusicFolderCard.vue';
import SettingAnchor from './SettingAnchor.vue';
import SuggestionsCard from './SuggestionsCard.vue';

/**
 * Cutting a clip, and what that costs.
 *
 * Three things that were in three different sections and are one job. The trim
 * compression switch was under App, beside the startup options. The music
 * folder was under App too, next to the clips folder, on the grounds that both
 * are folders. And the suggestion calibration, which is a model fitted to the
 * trims you have already made, was under Advanced, which is where everything
 * went that nobody could name.
 */
const { settings, load, save } = useAppSettings();

onMounted(load);
</script>

<template>
  <section>
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Editing</h2>
      <p class="mt-2 text-muted-500">
        Trimming, your music, and what the suggestions have learned
      </p>
    </div>

    <!--
      The other half of this decision, compressing a published copy, is under
      Connections with the publisher. They read like one setting and are two:
      a trim replaces the only copy of that moment, and a published copy is a
      copy. Off here, on there, and the reason is in each description.
    -->
    <SettingToggle
      label="Compress clips when trimming"
      description="A trim always lands on the exact frames you chose, and it replaces the only copy of that moment. Off keeps the picture close to the recording. On squeezes it to roughly a fifth of the size."
      :model-value="settings.compressTrims === true"
      @update:model-value="save({ compressTrims: $event })"
    />

    <MusicFolderCard />

    <SettingAnchor label="Suggestions learn from your trims">
      <SuggestionsCard />
    </SettingAnchor>
  </section>
</template>
