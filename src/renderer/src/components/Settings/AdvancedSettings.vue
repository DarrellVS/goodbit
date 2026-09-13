<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useConfiguration } from '../../composables/useConfiguration';
import SettingToggle from './SettingToggle.vue';
import KeyboardShortcutCustomization from './KeyboardShortcutCustomization.vue';
import BackupsCard from './BackupsCard.vue';

const config = useConfiguration();
const showShortcuts = computed(() => config.public.value.enableKeyboardShortcuts);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Advanced Settings</h2>
      <p class="text-sm text-muted-500">Advanced features and experimental options</p>
    </div>

    <div class="space-y-4">
      <SettingToggle
        v-model="config.public.value.enableKeyboardShortcuts"
        label="Enable Keyboard Shortcuts"
        description="Use keyboard shortcuts for navigation and actions"
      />

      <KeyboardShortcutCustomization v-if="showShortcuts" />

      <BackupsCard />

      <div class="p-4 bg-blue-500/8 border border-blue-500/30 rounded-lg">
        <div class="flex gap-3">
          <Icon icon="material-symbols:info" class="text-blue-500 text-xl flex-shrink-0" />
          <div>
            <h3 class="font-medium text-foreground">Where settings are kept</h3>
            <p class="text-sm text-muted-600 mt-1">
              These preferences live on this computer and stay put between sessions. Where your
              clips are, and where GoodBit publishes to, are under App.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

