<script setup lang="ts">
import { onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useLocalMode } from '../../composables/useLocalMode';

const {
  showSuggestion,
  localUrl,
  switchFailed,
  activate,
  switchToLocal,
  dismissSuggestion,
} = useLocalMode();

onMounted(activate);
</script>

<template>
  <div
    v-if="switchFailed"
    class="flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-sm"
  >
    <Icon icon="material-symbols:wifi-off" class="text-lg text-amber-600 flex-shrink-0" />
    <span class="text-amber-900">
      Local network unreachable — staying on the internet connection for now.
    </span>
  </div>

  <div
    v-else-if="showSuggestion"
    class="flex items-center gap-3 px-6 py-2.5 bg-orange-50 border-b border-orange-200 text-sm"
  >
    <Icon icon="material-symbols:rocket-launch" class="text-lg text-orange-600 flex-shrink-0" />

    <div class="min-w-0 flex-1">
      <span class="text-orange-900 font-medium">Faster streaming available on your local network.</span>
      <span class="text-orange-700 ml-1.5 hidden sm:inline">
        Clips load straight from this PC instead of routing over the internet.
      </span>
    </div>

    <button
      class="px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors flex-shrink-0"
      :title="localUrl ?? undefined"
      @click="switchToLocal()"
    >
      Switch
    </button>

    <button
      class="p-1.5 rounded-lg text-orange-700 hover:bg-orange-100 transition-colors flex-shrink-0"
      title="Dismiss"
      @click="dismissSuggestion"
    >
      <Icon icon="material-symbols:close" class="text-lg" />
    </button>
  </div>
</template>
