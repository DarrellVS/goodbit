<script setup lang="ts">
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import BaseField from '@renderer/components/Base/BaseField.vue';
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
      <DialogOverlay class="fixed inset-0 bg-scrim-modal z-50 modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-lg shadow-pop border border-border w-full max-w-xl max-h-[90vh] flex flex-col outline-hidden modal-content-animate px-9 pt-8 pb-9"
      >
        <!--
          One sheet. The header had a rule under it and 24px of padding of its
          own, inside a modal that already has padding, so the title sat in a
          band of its own.
        -->
        <div class="mb-6 shrink-0">
          <DialogTitle class="font-display text-[26px] leading-tight font-medium text-foreground">
            Export timeline
          </DialogTitle>
          <DialogDescription class="mt-1.5 text-sm text-muted-500">
            The render lands in the Exports folder beside your games, under this name
          </DialogDescription>
        </div>

        <div class="space-y-6 overflow-y-auto scroll-p-1.5 min-h-0">
          <div class="space-y-2">
            <label class="block text-xs font-medium uppercase tracking-label text-muted-400">Clip name</label>
            <BaseField>
              <input
                ref="input"
                v-model="name"
                type="text"
                placeholder="Name your clip"
                :disabled="exporting"
                @keydown.enter="submit"
              />
              <template #trailing>
                <span class="font-mono text-sm text-muted-400 shrink-0">.mp4</span>
              </template>
            </BaseField>
            <p v-if="wasCleaned" class="text-xs text-warning">
              Saved as “{{ cleanName }}”. Characters a filename cannot hold were dropped.
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-medium uppercase tracking-label text-muted-400">Made for</label>
            <!--
              `.b-chip`: a 32px pill with a hairline, taking an accent edge and
              the accent's own wash when chosen. They were rectangles, which is
              the shape this design uses for a control you press rather than a
              choice you make.
            -->
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in PLATFORM_PRESETS"
                :key="preset.id"
                type="button"
                :aria-pressed="activePreset?.id === preset.id"
                class="h-8 px-2.5 inline-flex items-center rounded-full border text-sm outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50"
                :class="activePreset?.id === preset.id
                  ? 'border-accent bg-accent/12 text-foreground'
                  : 'border-border text-muted-600 hover:bg-muted-50 hover:text-foreground'"
                :title="preset.hint"
                :disabled="exporting"
                @click="applyPreset(preset.id)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-medium uppercase tracking-label text-muted-400">Shape</label>
            <!--
              Three across rather than five, so each one has room for the
              sentence that says what it is for. Squeezed into one row they were
              a glyph and a word apiece, and `As recorded` against `Classic`
              means nothing without the line under it.
            -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                v-for="spec in EXPORT_FORMATS"
                :key="spec.id"
                type="button"
                :aria-pressed="format === spec.id"
                class="flex items-start gap-2.5 p-3 rounded-md border text-left outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50"
                :class="format === spec.id
                  ? 'border-accent bg-accent/8'
                  : 'border-border hover:bg-muted-50'"
                :disabled="exporting"
                @click="format = spec.id"
              >
                <span class="shrink-0 w-6 h-6 flex items-center justify-center mt-0.5">
                  <span
                    class="block border-2 rounded-[2px]"
                    :class="format === spec.id ? 'border-accent' : 'border-line-strong'"
                    :style="{
                      width: spec.ratio === null ? '20px' : (spec.ratio >= 1 ? '20px' : `${20 * spec.ratio}px`),
                      height: spec.ratio === null ? '11px' : (spec.ratio >= 1 ? `${20 / spec.ratio}px` : '20px'),
                    }"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-foreground">{{ spec.label }}</span>
                  <span class="block text-xs text-muted-500 leading-snug">{{ spec.hint }}</span>
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

          <!--
            The switch on the right, where every setting row in the app puts
            it. It was to the left of its own label, which made this the one
            toggle in the app you read right to left.
          -->
          <div class="flex items-start justify-between gap-6">
            <span class="min-w-0">
              <span class="block text-sm font-medium text-foreground">Even out the sound</span>
              <span class="block text-sm text-muted-500 mt-1">
                Puts the whole movie at −14 LUFS, the level the platforms turn everything down to
                anyway
              </span>
            </span>
            <BaseToggle
              v-model="normalizeLoudness"
              class="shrink-0"
              label="Even out the sound"
              :disabled="exporting"
            />
          </div>

          <div v-if="exporting" class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-medium text-muted-700">
              <span>{{ message || 'Rendering…' }}</span>
              <span class="font-mono">{{ Math.round(progress) }}%</span>
            </div>
            <div class="h-1 rounded-full bg-muted-200 overflow-hidden">
              <div
                class="h-full bg-accent transition-[width] duration-300"
                :style="{ width: `${Math.max(2, progress)}%` }"
              />
            </div>
            <p class="text-xs text-muted-500">
              {{ etaLabel || 'This runs on the server. It keeps going even if the render outlasts the page.' }}
            </p>
          </div>

          <div class="rounded-md bg-muted-50 p-3 space-y-1.5 text-sm text-muted-600">
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

        <div class="mt-6 pt-4 border-t border-border flex items-center justify-end gap-3 shrink-0">
          <!-- A render in flight can be stopped; ffmpeg is killed server-side. -->
          <button
            v-if="exporting"
            type="button"
            class="h-9 px-3.5 inline-flex items-center rounded-md border border-danger text-sm font-medium text-danger-ink hover:bg-danger/10 outline-none focus-visible:focus-ring transition-colors duration-150"
            @click="emit('cancel-export')"
          >
            Stop
          </button>

          <DialogClose v-else as-child>
            <button
              type="button"
              class="h-9 px-3.5 inline-flex items-center rounded-md border border-line-strong text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            >
              Cancel
            </button>
          </DialogClose>

          <button
            type="button"
            class="h-9 px-3.5 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
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
