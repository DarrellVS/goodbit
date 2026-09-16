<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useSettingsSearch } from '../../composables/useSettingsSearch';
import { getEncoderInfo, type EncoderInfo } from '../../services/clips';

/**
 * What this machine can actually do.
 *
 * It exists because everything it reports fails silently otherwise: with no GPU
 * encoder an export is quietly slow and nothing says why. It is under Advanced
 * now rather than under App, because it is the one thing on these screens that
 * is genuinely for looking under the lid: four read-only values, none of which
 * can be changed here, and the first thing worth quoting in a bug report.
 */
const { settingRing } = useSettingsSearch();

const encoders = ref<EncoderInfo | null>(null);
const encodersLoading = ref(true);
const appVersion = ref('');

onMounted(async () => {
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
  return `${info.h264}, ${kind}`;
});
</script>

<template>
  <div
    data-setting="Health"
    :class="['p-4 bg-card rounded-lg border border-border space-y-2', settingRing('Health')]"
  >
    <h3 class="font-medium text-foreground flex items-center gap-2">
      <Icon icon="material-symbols:favorite-outline" class="text-orange-500" />
      Health
    </h3>
    <dl class="text-sm space-y-1">
      <div class="flex justify-between gap-4">
        <dt class="text-muted-500">Version</dt>
        <dd class="text-foreground font-mono">{{ appVersion || 'unknown' }}</dd>
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
          {{ encoders?.ffmpegVersion ?? 'unknown' }}
        </dd>
      </div>
    </dl>
    <p v-if="!encodersLoading && encoders && !encoders.hardware" class="text-xs text-amber-600">
      No graphics-card encoder was found, so exports run on the processor and will be slower.
    </p>
  </div>
</template>
