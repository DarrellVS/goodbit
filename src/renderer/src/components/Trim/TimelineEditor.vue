<template>
  <section class="bg-card/5 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-xl space-y-6">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-orange-500/10">
          <Icon icon="material-symbols:timeline" class="text-orange-500 text-xl" />
        </div>
        <div>
          <h2 class="font-semibold text-lg">Timeline</h2>
          <p class="text-xs text-muted-400">Drag the handles to trim your clip</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5">
        <Icon icon="material-symbols:timer" class="text-orange-500" />
        <span class="text-muted-400">Duration:</span>
        <!-- `duration` is already formatted, seconds and all. -->
        <span class="font-mono font-semibold text-orange-500">{{ duration }}</span>
      </div>
    </header>
    
    <div ref="strip" class="relative h-32 rounded-xl overflow-visible border border-border">
      <img
        :src="frameStripSource"
        alt="Video frames"
        class="w-full h-full object-cover pointer-events-none select-none rounded-xl"
        draggable="false"
      />

      <!--
        Anywhere that is not a handle moves the playhead. This sits under the
        slider, so grabbing a handle still trims and everything else scrubs.
      -->
      <div
        class="absolute inset-0 z-40 cursor-pointer rounded-xl"
        title="Click or drag to move the playhead"
        @pointerdown="startScrub"
      />

      <BaseRangeSlider
        v-model="model"
        :max="maxDuration"
        :step="0.1"
        :min-steps-between-thumbs="1"
      />
      
      <div class="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 bg-gradient-to-r from-black/60 to-black/40 backdrop-blur-[2px]"
          :style="{ width: startPercentage + '%' }"
        />
        <div
          class="absolute inset-y-0 right-0 bg-gradient-to-l from-black/60 to-black/40 backdrop-blur-[2px]"
          :style="{ width: (100 - endPercentage) + '%' }"
        />

        <!--
          Where the preview is. Above the shading so it stays visible over the
          trimmed-away parts, and inert so it never fights the range handles.
        -->
        <div
          class="absolute inset-y-0 w-0.5 -ml-px bg-white shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          :style="{ left: playheadPercentage + '%' }"
        >
          <div class="absolute -top-px left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow" />
        </div>
      </div>
    </div>

    <!-- The preview has no controls of its own, so the transport lives here. -->
    <div class="flex items-center gap-3">
      <button
        class="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 transition-colors flex-shrink-0"
        :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="$emit('toggle-playback')"
      >
        <Icon :icon="isPlaying ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-2xl" />
      </button>

      <span class="font-mono text-sm text-muted-400">
        <span class="text-foreground">{{ playhead }}</span>
        <span class="mx-1">/</span>
        <span>{{ duration }}</span>
      </span>

      <span class="text-xs text-muted-400 ml-auto">Space plays the trimmed range on loop</span>
    </div>

    <footer class="flex items-center justify-between pt-4 border-t border-border">
      <div class="flex items-center gap-6 text-sm">
        <TimeIndicator label="Start" :time="startTime" />
        <TimeIndicator label="End" :time="endTime" />
        <TimeIndicator label="Length" :time="length" variant="primary" />
      </div>
      
      <!--
        The button fills as the cut runs.

        An exact trim re-encodes, which on a 3440 wide recording is tens of
        seconds, and a spinner with no number gives no idea whether to wait or
        walk away. The fill is the progress; the percentage is there for anyone
        who wants the number.
      -->
      <button
        class="relative overflow-hidden inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-card shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:scale-[1.02] enabled:active:scale-[0.98]"
        :disabled="!isValid || isSaving"
        @click="$emit('save')"
      >
        <span
          v-if="isSaving"
          class="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-linear"
          :style="{ width: `${Math.max(2, saveProgress)}%` }"
          aria-hidden="true"
        ></span>
        <Icon
          :icon="isSaving ? 'material-symbols:progress-activity' : 'material-symbols:save'"
          class="relative text-lg"
          :class="{ 'animate-spin': isSaving }"
        />
        <!--
          Tabular figures, or the button shrinks and grows as the count goes
          from 9 to 10 to 100 and the whole label jitters under the pointer.
        -->
        <span class="relative tabular-nums">
          {{ isSaving ? `Trimming ${saveProgress}%` : 'Save Trimmed Clip' }}
        </span>
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import BaseRangeSlider from '../Base/BaseRangeSlider.vue';
import TimeIndicator from './TimeIndicator.vue';
import type { TimeRange } from '../../composables/useTrimRange';

interface Props {
  maxDuration: number;
  duration: string;
  startTime: string;
  endTime: string;
  length: string;
  startPercentage: number;
  endPercentage: number;
  frameStripSource: string;
  isValid: boolean;
  isSaving: boolean;
  /** 0-100 through the cut, reported by the action doing it. */
  saveProgress?: number;
  /** Where the preview is, as a percentage of the whole clip. */
  playheadPercentage: number;
  /** The same position, formatted. */
  playhead: string;
  isPlaying: boolean;
}

const props = withDefaults(defineProps<Props>(), { saveProgress: 0 });

interface Emits {
  (e: 'save'): void;
  (e: 'toggle-playback'): void;
  (e: 'seek', time: number): void;
}

const emit = defineEmits<Emits>();

const strip = ref<HTMLElement | null>(null);

/** Where along the strip a pointer is, in seconds. */
function timeAt(event: PointerEvent): number {
  const box = strip.value?.getBoundingClientRect();
  if (!box || box.width === 0) return 0;

  const fraction = (event.clientX - box.left) / box.width;
  return Math.max(0, Math.min(1, fraction)) * props.maxDuration;
}

/**
 * Click to place the playhead, drag to scrub.
 *
 * The pointer is captured, so a drag that wanders off the strip, or off the
 * window, keeps scrubbing and still ends cleanly.
 */
function startScrub(event: PointerEvent): void {
  if (event.button !== 0) return;

  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture?.(event.pointerId);
  emit('seek', timeAt(event));

  const move = (moved: PointerEvent): void => emit('seek', timeAt(moved));
  const stop = (): void => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', stop);
    target.removeEventListener('pointercancel', stop);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop);
}

const model = defineModel<TimeRange>({ required: true });
</script>

