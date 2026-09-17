<script setup lang="ts">
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { formatTime } from '@renderer/utils/timeFormat';
import { outputSizeFor, targetKbpsFor } from '@shared/index';
// Straight at the source rather than through the package root: `shared/dist` is
// compiled to CommonJS, and Rollup cannot pick named runtime values out of a
// CJS re-export. Types alone resolved fine through the root, which is why every
// other import here still does.
import {
  EXPORT_FORMATS,
  PLATFORM_PRESETS,
  type ExportFormat,
} from '@shared/constants/exportFormats';
import type { ExportOptions } from '@renderer/services/clips';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  open: boolean;
  defaultName: string;
  clipCount: number;
  trackCount: number;
  duration: number;
  /** The shape of the first clip, so the dialog can say what comes out. */
  sourceWidth?: number;
  sourceHeight?: number;
  exporting?: boolean;
  progress?: number;
  message?: string;
  etaSeconds?: number | null;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', name: string, options: ExportOptions): void;
  (e: 'cancel-export'): void;
}

const props = withDefaults(defineProps<Props>(), {
  exporting: false,
  progress: 0,
  message: '',
  etaSeconds: null,
});
const emit = defineEmits<Emits>();

const name = ref('');
const input = ref<HTMLInputElement | null>(null);

const format = ref<ExportFormat>('original');
const framePos = ref(0.5);
const normalizeLoudness = ref(false);

/** The name becomes a filename, so the characters Windows rejects go first. */
const cleanName = computed(() => name.value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim());
const isValid = computed(() => cleanName.value.length > 0);
const wasCleaned = computed(() => cleanName.value !== name.value.trim());

/**
 * Which preset is lit, which is a choice rather than a deduction.
 *
 * It used to be worked out purely from the format and the loudness, which was
 * exact while every preset produced a different pair. *General* and *Discord*
 * deliberately produce the same one, so a search would always return whichever
 * came first and the other could never be picked at all.
 *
 * So the press is remembered, and only until it stops being true: change the
 * shape or the sound by hand and the remembered one no longer matches, at
 * which point this falls back to naming whichever preset those settings
 * describe. A highlight that outlived the settings it stands for would be
 * worse than none.
 */
const chosenPresetId = ref<string | null>(null);

const matchingPreset = computed(
  () =>
    PLATFORM_PRESETS.find(
      (p) => p.format === format.value && p.normalizeLoudness === normalizeLoudness.value,
    ) ?? null,
);

const activePreset = computed(() => {
  const chosen = PLATFORM_PRESETS.find((p) => p.id === chosenPresetId.value);
  if (
    chosen &&
    chosen.format === format.value &&
    chosen.normalizeLoudness === normalizeLoudness.value
  ) {
    return chosen;
  }
  return matchingPreset.value;
});

/** A crop that keeps the whole frame has nothing to position. */
const canPosition = computed(() => format.value !== 'original');

/**
 * The file this is about to make.
 *
 * The dialog listed how many clips and how long, and nothing at all about the
 * output, which is the thing the options on this screen actually change.
 * Picking Discord is about a size limit, and the size was the only number
 * missing.
 */
const outputLabel = computed(() => {
  if (!props.sourceWidth || !props.sourceHeight) return '';
  const out = outputSizeFor(format.value, props.sourceWidth, props.sourceHeight);
  return `${out.width} x ${out.height}`;
});

/** Roughly, from the bitrate the encoder is aiming at. Rounded hard, because a
 *  precise wrong number is worse than an obviously approximate one. */
const sizeLabel = computed(() => {
  if (!props.sourceWidth || !props.sourceHeight || props.duration <= 0) return '';
  const kbps = targetKbpsFor(format.value, props.sourceWidth, props.sourceHeight, null);
  const out = outputSizeFor(format.value, props.sourceWidth, props.sourceHeight);
  // No source bitrate to scale from, so fall back to the share budget: about
  // 4 Mbit per megapixel, which is what the encoder targets.
  const megapixels = (out.width * out.height) / 1e6;
  const bitrate = kbps ?? Math.round(megapixels * 4000);
  const megabytes = (bitrate * props.duration) / 8 / 1000;
  if (!Number.isFinite(megabytes) || megabytes <= 0) return '';
  return megabytes >= 100 ? `about ${Math.round(megabytes / 10) * 10} MB` : `about ${Math.round(megabytes)} MB`;
});

function applyPreset(id: string): void {
  const preset = PLATFORM_PRESETS.find((p) => p.id === id);
  if (!preset) return;
  // Nothing a preset does is hidden. It sets the same controls shown below.
  format.value = preset.format;
  normalizeLoudness.value = preset.normalizeLoudness;
  chosenPresetId.value = preset.id;
}

const etaLabel = computed(() => {
  const eta = props.etaSeconds;
  if (eta === null || eta === undefined) return '';
  if (eta < 60) return `about ${eta}s left`;
  return `about ${Math.round(eta / 60)} min left`;
});

/** Escape and backdrop clicks must not walk away from a render in flight. */
function handleOpenChange(value: boolean): void {
  if (!value && props.exporting) return;
  emit('update:open', value);
}

function submit(): void {
  if (!isValid.value || props.exporting) return;
  emit('confirm', cleanName.value, {
    format: format.value,
    framePos: framePos.value,
    normalizeLoudness: normalizeLoudness.value,
  });
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    name.value = props.defaultName;
    // A preset is a choice about this export, not a setting, so it does not
    // follow the dialog into the next one.
    chosenPresetId.value = null;
    await nextTick();
    input.value?.select();
  }
);
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[90vh] flex flex-col outline-hidden modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">Export timeline</DialogTitle>
          <DialogDescription class="text-sm text-muted-600">
            The render lands in the Exports folder beside your games, under this name
          </DialogDescription>
        </div>

        <div class="p-6 space-y-5 overflow-y-auto">
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Clip name
            </label>
            <div class="relative">
              <input
                ref="input"
                v-model="name"
                type="text"
                placeholder="Name your clip"
                class="w-full px-4 py-2.5 pr-14 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:bg-muted-50 disabled:text-muted-500"
                :disabled="exporting"
                @keydown.enter="submit"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-400">
                .mp4
              </span>
            </div>
            <p v-if="wasCleaned" class="text-xs text-warning">
              Saved as “{{ cleanName }}”. Characters a filename cannot hold were dropped.
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Made for
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in PLATFORM_PRESETS"
                :key="preset.id"
                type="button"
                class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50"
                :class="activePreset?.id === preset.id
                  ? 'border-accent bg-accent/8 text-accent-ink'
                  : 'border-border text-muted-700 hover:bg-muted-50'"
                :title="preset.hint"
                :disabled="exporting"
                @click="applyPreset(preset.id)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Shape
            </label>
            <div class="grid grid-cols-5 gap-2">
              <button
                v-for="spec in EXPORT_FORMATS"
                :key="spec.id"
                type="button"
                class="flex flex-col items-center gap-1.5 px-1 py-2 rounded-lg border transition-colors disabled:opacity-50"
                :class="format === spec.id
                  ? 'border-accent bg-accent/8'
                  : 'border-border hover:bg-muted-50'"
                :title="spec.hint"
                :disabled="exporting"
                @click="format = spec.id"
              >
                <span
                  class="block border-2 rounded-[2px]"
                  :class="format === spec.id ? 'border-accent' : 'border-line-strong'"
                  :style="{
                    width: spec.ratio === null ? '22px' : (spec.ratio >= 1 ? '22px' : `${22 * spec.ratio}px`),
                    height: spec.ratio === null ? '12px' : (spec.ratio >= 1 ? `${22 / spec.ratio}px` : '22px'),
                  }"
                />
                <span class="text-[10px] font-medium text-muted-700 text-center leading-tight">
                  {{ spec.label }}
                </span>
              </button>
            </div>

            <!--
              Only a cropping format has anywhere to move. The slider says which
              slice of the picture survives, since an ultrawide loses most of it.
            -->
            <div v-if="canPosition" class="pt-1 space-y-1">
              <div class="flex items-center justify-between text-xs text-muted-600">
                <span>Crop position</span>
                <span class="font-mono">{{ Math.round(framePos * 100) }}%</span>
              </div>
              <input
                v-model.number="framePos"
                type="range"
                min="0"
                max="1"
                step="0.01"
                class="w-full accent-accent"
                :disabled="exporting"
              />
              <div class="flex justify-between text-[10px] text-muted-400">
                <span>Left</span><span>Centre</span><span>Right</span>
              </div>
            </div>
          </div>

          <div class="flex items-start gap-2.5">
            <BaseToggle
              v-model="normalizeLoudness"
              class="mt-0.5"
              label="Even out the sound"
              :disabled="exporting"
            />
            <span class="text-sm text-muted-700">
              Even out the sound
              <span class="block text-xs text-muted-500">
                Puts the whole movie at −14 LUFS, the level the platforms turn everything down to anyway
              </span>
            </span>
          </div>

          <div v-if="exporting" class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-medium text-muted-700">
              <span>{{ message || 'Rendering…' }}</span>
              <span class="font-mono">{{ Math.round(progress) }}%</span>
            </div>
            <div class="h-2 rounded-full bg-accent/16 overflow-hidden">
              <div
                class="h-full bg-accent transition-[width] duration-300"
                :style="{ width: `${Math.max(2, progress)}%` }"
              />
            </div>
            <p class="text-xs text-muted-500">
              {{ etaLabel || 'This runs on the server. It keeps going even if the render outlasts the page.' }}
            </p>
          </div>

          <div class="rounded-lg bg-muted-50 border border-border p-3 space-y-1.5 text-sm text-muted-700">
            <div class="flex items-center gap-2">
              <Icon icon="material-symbols:movie" class="text-lg text-muted-500" />
              {{ clipCount }} clip{{ clipCount === 1 ? '' : 's' }}
              <span class="text-muted-400">·</span>
              <span class="font-mono">{{ formatTime(duration) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Icon icon="material-symbols:music-note" class="text-lg text-muted-500" />
              {{ trackCount === 0 ? 'No music' : `${trackCount} music track${trackCount === 1 ? '' : 's'}` }}
            </div>
            <!--
              What you are about to get. The dialog said how long and how many
              clips, and nothing about the file, which is the one thing you are
              choosing between: picking Discord is about a size limit, and the
              size was the only number missing.
            -->
            <div v-if="outputLabel" class="flex items-center gap-2">
              <Icon icon="material-symbols:aspect-ratio" class="text-lg text-muted-500" />
              <span class="font-mono">{{ outputLabel }}</span>
              <span v-if="sizeLabel" class="text-muted-400">·</span>
              <span v-if="sizeLabel" class="font-mono">{{ sizeLabel }}</span>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-border flex items-center justify-end gap-3">
          <!-- A render in flight can be stopped; ffmpeg is killed server-side. -->
          <button
            v-if="exporting"
            class="px-4 py-2 rounded-lg border border-danger text-danger-ink font-medium hover:bg-danger/8 transition-colors"
            @click="emit('cancel-export')"
          >
            Stop
          </button>

          <DialogClose v-else as-child>
            <button
              class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-muted-50 transition-colors"
            >
              Cancel
            </button>
          </DialogClose>

          <button
            class="px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            :disabled="!isValid || exporting"
            @click="submit"
          >
            <BaseSpinner v-if="exporting" class="text-lg" />
            <Icon v-else icon="material-symbols:download" class="text-lg" />
            <!-- Tabular figures, or the button jitters as the count climbs. -->
            <span class="tabular-nums">
              {{ exporting ? `Exporting ${Math.round(progress)}%` : 'Export' }}
            </span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
