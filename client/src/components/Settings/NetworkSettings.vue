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
  isLocalOrigin,
  localUrl,
  remoteOrigin,
  canSwitchToLocal,
  canSwitchToRemote,
  loadInfo,
  switchToLocal,
  switchToRemote,
} = useLocalMode();

onMounted(loadInfo);

const currentOrigin = computed(() => window.location.origin);

const statusLabel = computed(() =>
  isLocalOrigin.value ? 'Local network' : 'Internet'
);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Network</h2>
      <p class="text-sm text-muted-500">Control how clips reach your browser</p>
    </div>

    <div class="p-4 bg-white rounded-lg border border-gray-200 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">Current connection</div>
          <p class="text-sm text-muted-500 mt-1 font-mono break-all">{{ currentOrigin }}</p>
        </div>
        <span
          class="px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
          :class="isLocalOrigin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'"
        >
          <Icon :icon="isLocalOrigin ? 'material-symbols:home' : 'material-symbols:cloud'" />
          {{ statusLabel }}
        </span>
      </div>

      <p v-if="isLocalOrigin" class="text-sm text-emerald-700 flex items-start gap-1.5">
        <Icon icon="material-symbols:check-circle" class="text-base mt-0.5 flex-shrink-0" />
        Clips stream directly from this PC — nothing leaves your network.
      </p>
      <p v-else class="text-sm text-muted-500 flex items-start gap-1.5">
        <Icon icon="material-symbols:info" class="text-base mt-0.5 flex-shrink-0" />
        Clips travel over the internet and back to your PC, which is slower to load.
      </p>
    </div>

    <div class="p-4 bg-white rounded-lg border border-gray-200 space-y-3">
      <div class="font-medium text-gray-900">Available connections</div>

      <p v-if="infoError" class="text-sm text-red-600">
        Could not reach the server to look up local addresses.
      </p>

      <p v-else-if="!localInfo" class="text-sm text-muted-500">Looking up local addresses…</p>

      <template v-else>
        <p v-if="!localInfo.servesClient" class="text-sm text-amber-700">
          The server is not serving the app bundle, so local mode is unavailable. Run
          <code class="px-1 py-0.5 bg-gray-100 rounded">npm run build</code> in
          <code class="px-1 py-0.5 bg-gray-100 rounded">client/</code> and restart the server.
        </p>

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
              <div class="font-mono text-gray-900 break-all">{{ endpoint.url }}</div>
              <div class="text-xs text-muted-500">{{ endpoint.iface }}</div>
            </div>
            <span
              v-if="endpoint.url === currentOrigin"
              class="text-xs text-emerald-700 font-medium flex-shrink-0"
            >
              In use
            </span>
          </li>
        </ul>
      </template>

      <div class="flex gap-2 pt-1">
        <button
          v-if="canSwitchToLocal"
          class="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
          @click="switchToLocal()"
        >
          Switch to local network
        </button>
        <button
          v-if="canSwitchToRemote"
          class="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="switchToRemote"
        >
          Switch to internet ({{ remoteOrigin }})
        </button>
      </div>
    </div>

    <SettingToggle
      v-model="config.public.value.preferLocalNetwork"
      label="Prefer local network automatically"
      description="When opened over the internet, jump to the local address on load. If your PC is not reachable, press Back once and this turns itself off for the session."
    />
  </section>
</template>
