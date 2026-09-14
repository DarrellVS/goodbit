<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { usePublisher } from '../../composables/usePublisher';
import { useToastStore } from '../../stores/toast';
import { getEncoderInfo, type EncoderInfo } from '../../services/clips';

/**
 * The settings the app itself runs on — folders, the publisher, autostart —
 * plus what the machine can actually do.
 *
 * The health panel exists because everything below it fails silently otherwise:
 * with no GPU encoder an export is quietly slow, and with an unreachable
 * publisher the first sign of trouble used to be a publish failing.
 */
const { settings, load, save, pickFolder } = useAppSettings();
const { refresh: refreshPublisher } = usePublisher();
const toast = useToastStore();

/** The clip menus read this through `usePublisher`, so tell them. */
async function saveCompressTrims(on: boolean): Promise<void> {
  await save({ compressTrims: on });
  await refreshPublisher();
}

const encoders = ref<EncoderInfo | null>(null);
const encodersLoading = ref(true);
const publisherUrl = ref('');
const publisherState = ref<'unknown' | 'checking' | 'ok' | 'unreachable'>('unknown');
const appVersion = ref('');

onMounted(async () => {
  await load();
  publisherUrl.value = settings.value.publisherBaseUrl;
  appVersion.value = (await window.goodbit?.app.version()) ?? '';

  try {
    encoders.value = await getEncoderInfo();
  } catch {
    encoders.value = null;
  } finally {
    encodersLoading.value = false;
  }
});

const encoderLabel = computed(() => {
  const info = encoders.value;
  if (!info) return 'could not be detected';
  const kind = info.hardware ? 'your graphics card' : 'the processor';
  return `${info.h264} — ${kind}`;
});

async function choose(key: 'videosRoot' | 'audioRoot', title: string): Promise<void> {
  const chosen = await pickFolder(key, title);
  if (chosen) toast.success('Folder updated — rescanning');
}

async function savePublisher(): Promise<void> {
  await save({ publisherBaseUrl: publisherUrl.value.trim() });
  toast.success(publisherUrl.value.trim() ? 'Publisher saved' : 'Publishing turned off');
  publisherState.value = 'unknown';
}

/** Reachability is the thing worth knowing; a saved URL that answers nothing is worse than none. */
async function testPublisher(): Promise<void> {
  const url = publisherUrl.value.trim();
  if (!url) return;

  publisherState.value = 'checking';
  try {
    await fetch(`${url.replace(/\/$/, '')}/health`, { method: 'GET' });
    publisherState.value = 'ok';
  } catch {
    publisherState.value = 'unreachable';
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">App</h2>
      <p class="text-sm text-muted-500">Where your clips live, and how GoodBit runs</p>
    </div>

    <div class="space-y-4">
      <div class="p-4 bg-card rounded-lg border border-border space-y-3">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <label class="font-medium text-foreground">Clips folder</label>
            <p class="text-sm text-muted-500 mt-1 truncate">
              {{ settings.videosRoot || 'Not set' }}
            </p>
          </div>
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm flex-shrink-0"
            @click="choose('videosRoot', 'Where does OBS save your clips?')"
          >
            Change
          </button>
        </div>

        <div class="flex items-start justify-between gap-4 pt-3 border-t border-border">
          <div class="min-w-0">
            <label class="font-medium text-foreground">Music folder</label>
            <p class="text-sm text-muted-500 mt-1 truncate">
              {{ settings.audioRoot || 'Not set' }}
            </p>
          </div>
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm flex-shrink-0"
            @click="choose('audioRoot', 'Where is your music?')"
          >
            Change
          </button>
        </div>
      </div>

      <label class="flex items-start justify-between gap-4 p-4 bg-card rounded-lg border border-border cursor-pointer">
        <span>
          <span class="block font-medium text-foreground">Start with Windows</span>
          <span class="block text-sm text-muted-500 mt-1">
            Runs in the tray and indexes clips as they are recorded
          </span>
        </span>
        <input
          type="checkbox"
          class="mt-1 accent-orange-500"
          :checked="settings.startAtLogin"
          @change="save({ startAtLogin: ($event.target as HTMLInputElement).checked })"
        />
      </label>

      <label class="flex items-start justify-between gap-4 p-4 bg-card rounded-lg border border-border cursor-pointer">
        <span>
          <span class="block font-medium text-foreground">Keep running when the window closes</span>
          <span class="block text-sm text-muted-500 mt-1">
            Off means closing the window quits, and nothing is indexed until you open it again
          </span>
        </span>
        <input
          type="checkbox"
          class="mt-1 accent-orange-500"
          :checked="settings.keepRunningInTray"
          @change="save({ keepRunningInTray: ($event.target as HTMLInputElement).checked })"
        />
      </label>

      <label class="flex items-start justify-between gap-4 p-4 bg-card rounded-lg border border-border cursor-pointer">
        <span>
          <span class="block font-medium text-foreground">Compress clips when trimming</span>
          <span class="block text-sm text-muted-500 mt-1">
            A trim re-encodes the cut to share size — roughly a fifth of the recording — and
            publishing offers a compressed copy. Off keeps the recorded bytes: a lossless cut to
            the nearest keyframe.
          </span>
        </span>
        <input
          type="checkbox"
          class="mt-1 accent-orange-500"
          aria-label="Compress clips when trimming"
          :checked="settings.compressTrims !== false"
          @change="saveCompressTrims(($event.target as HTMLInputElement).checked)"
        />
      </label>

      <div class="p-4 bg-card rounded-lg border border-border space-y-3">
        <div>
          <label class="font-medium text-foreground">Publisher</label>
          <p class="text-sm text-muted-500 mt-1">
            Optional. A server that hosts public links for the clips you publish — leave empty and
            publishing is simply off.
          </p>
        </div>

        <div class="flex gap-2">
          <input
            v-model="publisherUrl"
            type="text"
            placeholder="http://192.168.1.20:5555"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-orange-500"
            @keydown.enter="savePublisher"
          />
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm"
            :disabled="!publisherUrl.trim()"
            @click="testPublisher"
          >
            Test
          </button>
          <button
            class="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
            @click="savePublisher"
          >
            Save
          </button>
        </div>

        <p v-if="publisherState === 'checking'" class="text-xs text-muted-500">Checking…</p>
        <p v-else-if="publisherState === 'ok'" class="text-xs text-green-600">That address answers.</p>
        <p v-else-if="publisherState === 'unreachable'" class="text-xs text-red-600">
          No answer from that address.
        </p>
      </div>

      <div class="p-4 bg-card rounded-lg border border-border space-y-2">
        <h3 class="font-medium text-foreground flex items-center gap-2">
          <Icon icon="material-symbols:favorite-outline" class="text-orange-500" />
          Health
        </h3>
        <dl class="text-sm space-y-1">
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Version</dt>
            <dd class="text-foreground font-mono">{{ appVersion || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Video encoder</dt>
            <dd class="text-foreground font-mono truncate">
              {{ encodersLoading ? 'checking…' : encoderLabel }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Decoding</dt>
            <dd class="text-foreground font-mono">
              {{ encodersLoading ? '…' : (encoders?.hwaccel ?? 'software') }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">ffmpeg</dt>
            <dd class="text-foreground font-mono truncate">
              {{ encoders?.ffmpegVersion ?? '—' }}
            </dd>
          </div>
        </dl>
        <p v-if="!encodersLoading && encoders && !encoders.hardware" class="text-xs text-amber-600">
          No graphics-card encoder was found, so exports run on the processor and will be slower.
        </p>
      </div>
    </div>
  </section>
</template>
