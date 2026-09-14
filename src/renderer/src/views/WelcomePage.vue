<script setup lang="ts">
import BaseToggle from '../components/Base/BaseToggle.vue';
import AppMark from '../components/App/AppMark.vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useAppSettings } from '../composables/useAppSettings';

/**
 * First run: the app needs somewhere to look for clips.
 *
 * This exists because the videos folder used to be an environment variable that
 * threw before the process could start, correct for one machine, useless for
 * an app someone installs. Nothing here is required beyond the first folder;
 * everything else has a sensible default and lives in Settings.
 */
const router = useRouter();
const { settings, load, save, pickFolder } = useAppSettings();

const working = ref(false);

const ready = computed(() => !!settings.value.videosRoot);

onMounted(load);

async function chooseVideos(): Promise<void> {
  working.value = true;
  try {
    await pickFolder('videosRoot', 'Where does OBS save your clips?');
  } finally {
    working.value = false;
  }
}

async function chooseMusic(): Promise<void> {
  working.value = true;
  try {
    await pickFolder('audioRoot', 'Where is your music?');
  } finally {
    working.value = false;
  }
}

async function finish(): Promise<void> {
  if (!ready.value) return;
  await save({ startAtLogin: settings.value.startAtLogin });
  await router.push('/');
}
</script>

<template>
  <div class="h-full overflow-auto flex items-center justify-center p-8">
    <div class="w-full max-w-lg space-y-8">
      <div class="text-center space-y-3">
        <AppMark :size="56" class="mx-auto" />
        <h1 class="text-2xl font-bold text-foreground">Welcome to GoodBit</h1>
        <p class="text-sm text-muted-500">
          Point it at the folder OBS records into. It watches from there, and finds the good bit.
        </p>
      </div>

      <div class="space-y-3">
        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors"
          :class="settings.videosRoot
            ? 'border-orange-400 bg-orange-500/5'
            : 'border-border bg-card hover:bg-muted-50'"
          :disabled="working"
          @click="chooseVideos"
        >
          <Icon
            :icon="settings.videosRoot ? 'material-symbols:check-circle' : 'material-symbols:folder-open'"
            class="text-2xl flex-shrink-0"
            :class="settings.videosRoot ? 'text-orange-500' : 'text-muted-400'"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-foreground">Your clips folder</span>
            <span class="block text-xs text-muted-500 truncate">
              {{ settings.videosRoot || 'Required: choose a folder' }}
            </span>
          </span>
        </button>

        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted-50 text-left transition-colors"
          :disabled="working"
          @click="chooseMusic"
        >
          <Icon icon="material-symbols:music-note" class="text-2xl text-muted-400 flex-shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-foreground">Music for the editor</span>
            <span class="block text-xs text-muted-500 truncate">
              {{ settings.audioRoot || 'Optional. You can set this later' }}
            </span>
          </span>
        </button>
      </div>

      <div class="flex items-start gap-3 p-4 rounded-xl bg-muted-50">
        <BaseToggle
          class="mt-0.5"
          label="Start with Windows"
          :model-value="settings.startAtLogin"
          @update:model-value="save({ startAtLogin: $event })"
        />
        <span class="text-sm">
          <span class="block font-medium text-foreground">Start with Windows</span>
          <span class="block text-xs text-muted-500">
            Runs quietly in the tray so new clips are indexed as they are recorded
          </span>
        </span>
      </div>

      <button
        class="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-orange-500 transition-colors"
        :disabled="!ready || working"
        @click="finish"
      >
        {{ ready ? 'Start using GoodBit' : 'Choose your clips folder first' }}
      </button>
    </div>
  </div>
</template>
