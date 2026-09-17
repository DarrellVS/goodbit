<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { getEncoderInfo, type EncoderInfo } from '@renderer/services/clips';

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
  <div data-setting="Health" :class="['setting-card', settingRing('Health')]">
    <h3>Health</h3>
    <p>Four facts about this machine, and the first four lines of any bug report.</p>

    <!--
      A description list, which is what this is: a label and the fact it names.
      Each cell carries the hairline rather than the row, so the rules run the
      full width instead of stopping at a row's own padding. The same shape as
      the Info column on Stats, deliberately.
    -->
    <dl class="grid grid-cols-[auto_1fr] mt-3.5">
      <dt class="py-2.5 pr-4 border-t border-border text-sm text-muted-500">Version</dt>
      <dd class="py-2.5 border-t border-border text-sm text-foreground text-right font-mono tabular-nums">
        {{ appVersion || 'unknown' }}
      </dd>

      <dt class="py-2.5 pr-4 border-t border-border text-sm text-muted-500">Video encoder</dt>
      <dd class="py-2.5 border-t border-border text-sm text-foreground text-right font-mono truncate">
        {{ encodersLoading ? 'checking' : encoderLabel }}
      </dd>

      <dt class="py-2.5 pr-4 border-t border-border text-sm text-muted-500">Decoding</dt>
      <dd class="py-2.5 border-t border-border text-sm text-foreground text-right font-mono">
        {{ encodersLoading ? '\u2026' : (encoders?.hwaccel ?? 'software') }}
      </dd>

      <dt class="py-2.5 pr-4 border-t border-border text-sm text-muted-500">ffmpeg</dt>
      <dd class="py-2.5 border-t border-border text-sm text-foreground text-right font-mono truncate">
        {{ encoders?.ffmpegVersion ?? 'unknown' }}
      </dd>
    </dl>

    <p v-if="!encodersLoading && encoders && !encoders.hardware" class="!text-warning !mt-3">
      No graphics-card encoder was found, so exports run on the processor and will be slower.
    </p>
  </div>
</template>
