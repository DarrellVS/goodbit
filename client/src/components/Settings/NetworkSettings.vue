<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useConfiguration } from '../../composables/useConfiguration';
import { useLocalMode } from '../../composables/useLocalMode';
import SettingToggle from './SettingToggle.vue';

const config = useConfiguration();
const {
  localInfo,
  infoError,
  detecting,
  isLocalOrigin,
  localStreaming,
  activeMediaOrigin,
  detectLocalMedia,
  redetect,
} = useLocalMode();

onMounted(detectLocalMedia);

const statusLabel = computed(() => {
  if (detecting.value) return 'Checking…';
  return localStreaming.value ? 'Local network' : 'Internet';
});

function onToggle(value: boolean): void {
  config.public.value.preferLocalNetwork = value;
  void redetect();
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Network</h2>
      <p class="text-sm text-muted-500">Control how clips reach your browser</p>
    </div>

    <div class="p-4 bg-white rounded-lg border border-gray-200 space-y-3 dark:bg-slate-900 dark:border-slate-700">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-medium text-gray-900 dark:text-slate-100">Clips are streaming from</div>
          <p class="text-sm text-muted-500 mt-1 font-mono break-all">{{ activeMediaOrigin }}</p>
        </div>
        <span
          class="px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
          :class="localStreaming ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'"
        >
          <Icon :icon="localStreaming ? 'material-symbols:home' : 'material-symbols:cloud'" />
          {{ statusLabel }}
        </span>
      </div>

      <p v-if="isLocalOrigin" class="text-sm text-emerald-700 flex items-start gap-1.5">
        <Icon icon="material-symbols:check-circle" class="text-base mt-0.5 flex-shrink-0" />
        The app itself is served from your PC, so nothing leaves your network.
      </p>
      <p v-else-if="localStreaming" class="text-sm text-emerald-700 flex items-start gap-1.5">
        <Icon icon="material-symbols:check-circle" class="text-base mt-0.5 flex-shrink-0" />
        Video and thumbnails load straight from your PC over the local network.
        Only the page itself came over the internet.
      </p>
      <p v-else class="text-sm text-muted-500 flex items-start gap-1.5">
        <Icon icon="material-symbols:info" class="text-base mt-0.5 flex-shrink-0" />
        Your PC is not reachable on this network, so clips travel over the internet.
      </p>
    </div>

    <div class="p-4 bg-white rounded-lg border border-gray-200 space-y-3 dark:bg-slate-900 dark:border-slate-700">
      <div class="flex items-center justify-between">
        <div class="font-medium text-gray-900 dark:text-slate-100">Detected local addresses</div>
        <button
          class="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="detecting"
          @click="redetect"
        >
          {{ detecting ? 'Checking…' : 'Check again' }}
        </button>
      </div>

      <p v-if="infoError" class="text-sm text-red-600">
        Could not reach the server to look up local addresses.
      </p>

      <p v-else-if="!localInfo" class="text-sm text-muted-500">Looking up local addresses…</p>

      <p v-else-if="localInfo.endpoints.length === 0" class="text-sm text-amber-700">
        No local network address was detected on the server.
      </p>

      <ul v-else class="space-y-2">
        <li
          v-for="endpoint in localInfo.endpoints"
          :key="endpoint.url"
          class="flex items-center justify-between gap-3 text-sm"
        >
          <div class="min-w-0">
            <div class="font-mono text-gray-900 break-all dark:text-slate-100">{{ endpoint.url }}</div>
            <div class="text-xs text-muted-500">{{ endpoint.iface }}</div>
          </div>
          <span
            v-if="endpoint.url === activeMediaOrigin"
            class="text-xs text-emerald-700 font-medium flex-shrink-0"
          >
            In use
          </span>
        </li>
      </ul>
    </div>

    <SettingToggle
      :model-value="config.public.value.preferLocalNetwork"
      label="Stream over the local network when possible"
      description="Load video and thumbnails directly from your PC when it is reachable. Falls back to the internet automatically when you are away from home."
      @update:model-value="onToggle"
    />
  </section>
</template>
