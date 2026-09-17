<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { AudioDevice } from '@renderer/services/obs';

/**
 * One audio endpoint, and whether to record it.
 *
 * Written out twice before this, once for the outputs and once for the
 * microphones, with nothing different between them.
 */

interface Props {
  device: AudioDevice;
  chosen: boolean;
}

interface Emits {
  (e: 'toggle'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <button
    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors"
    :class="chosen ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-muted-50'"
    @click="emit('toggle')"
  >
    <Icon
      :icon="chosen ? 'material-symbols:check-circle' : 'material-symbols:circle-outline'"
      class="text-lg shrink-0"
      :class="chosen ? 'text-muted-500' : 'text-muted-400'"
    />
    <span class="min-w-0">
      <span class="block text-sm text-foreground truncate">{{ device.name }}</span>
      <!-- Three endpoints called Speakers are three devices. -->
      <span v-if="device.description" class="block text-xs text-muted-500 truncate">
        {{ device.description }}
      </span>
    </span>
  </button>
</template>
