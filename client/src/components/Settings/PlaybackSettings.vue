<script setup lang="ts">
import { useConfiguration } from '../../composables/useConfiguration';
import SettingToggle from './SettingToggle.vue';

const config = useConfiguration();
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Playback Settings</h2>
      <p class="text-sm text-muted-500">Control video playback behavior</p>
    </div>

    <div class="space-y-4">
      <SettingToggle
        v-model="config.public.value.autoPlayOnHover"
        label="Auto-play on Hover"
        description="Automatically play clips when hovering over them"
      />

      <SettingToggle
        v-model="config.public.value.muteVideosByDefault"
        label="Mute Videos by Default"
        description="Start videos muted (can be unmuted manually)"
      />
    </div>
  </section>
</template>

