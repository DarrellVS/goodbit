<template>
  <section class="bg-card/5 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-xl space-y-6">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-orange-500/10">
          <Icon icon="material-symbols:timeline" class="text-orange-500 text-xl" />
        </div>
        <div>
          <h2 class="font-semibold text-lg">Timeline</h2>
          <!--
            The handles do two things now, so the line says both. Trimming
            replaces the recording and marking a GoodBit does not, which is the
            one distinction somebody has to hold in their head on this screen.
          -->
          <p class="text-xs text-muted-400">
            Drag the handles to pick a range, then mark it or trim to it
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5">
        <Icon icon="material-symbols:timer" class="text-orange-500" />
        <span class="text-muted-400">Duration:</span>
        <!-- `duration` is already formatted, frames and all. -->
        <span class="font-mono font-semibold text-orange-500 tabular-nums">{{ duration }}</span>
        <!--
          The frame rate, beside the first timecode on the screen, because it is
          the legend for the last field of every one of them.

          `0:12:20` and `0:12.20` are one character apart and mean different
          things, frames against hundredths, so which one is being read has to
          be visible rather than inferred. When nothing has reported a rate the
          readouts fall back to hundredths and this says so, rather than the
          page assuming 30 or 60 and drawing a control that looks exact.
        -->
        <span class="text-xs text-muted-400 border-l border-line-strong pl-2 ml-0.5">
          {{ frameRateText ?? 'frame rate unknown' }}
        </span>
      </div>
    </header>

    <div
      ref="strip"
      class="relative h-32 rounded-xl overflow-visible border border-border"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
    >
      <!--
        A band while the frames are being made, and a fade when they arrive.
        The strip is not a file on disk: the first request for one decodes ten
        frames out of the recording and tone maps them, so there is a real wait
        behind it, and it used to end by cutting from nothing to a picture on
        one frame. The placeholder keeps the shape the handles are already drawn
        over, so only the contents change.
      -->
      <div
        v-if="!stripReady"
        class="absolute inset-0 rounded-xl bg-muted-50 animate-pulse"
        aria-hidden="true"
      ></div>

      <img
        :src="frameStripSource"
        alt="Video frames"
        class="w-full h-full object-cover pointer-events-none select-none rounded-xl transition-opacity duration-300"
        :class="stripReady ? 'opacity-100' : 'opacity-0'"
        draggable="false"
        @load="stripReady = true"
        @error="stripReady = true"
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

      <!--
        The step is one frame, not a tenth.

        A drag snaps to whatever `step` says, so this is what makes the handles
        capable of the accuracy the cut already has. `min-steps-between-thumbs`
        stays at one step, which now means one frame rather than a tenth of a
        second: strictly closer together than before, so nothing that used to be
        reachable stopped being.

        Worth knowing if a drag ever seems to refuse the last frame between the
        handles: reka-ui checks the gap with `(n + 1) * step - n * step >= step`
        in floating point, which comes out false for most `n` at any step that
        is not exactly representable. Measured at 0.1, the step this had before:
        refused 2,614 times in 5,000. It is pre-existing, it only affects a drag
        that is closing the handles onto each other, and the arrow keys do not
        go through it.
      -->
      <BaseRangeSlider
        v-model="model"
        :max="maxDuration"
        :step="sliderStep"
        :min-steps-between-thumbs="1"
        :format="handleFormat"
      />
      
      <div class="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 bg-linear-to-r from-black/60 to-black/40 backdrop-blur-xs"
          :style="{ width: startPercentage + '%' }"
        />
        <div
          class="absolute inset-y-0 right-0 bg-linear-to-l from-black/60 to-black/40 backdrop-blur-xs"
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
          <div class="absolute -top-px left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-sm" />
        </div>
      </div>

      <!--
        The GoodBits already marked on this clip.

        Last in the strip, so it paints over the shading rather than under it:
        the reason to see the other GoodBits while trimming is to see the other
        GoodBits, and half of them are outside the handles by definition, which
        is exactly where the shading is. It costs the playhead its bottom six
        pixels, which is five percent of a line that runs the full height.
      -->
      <GoodBitBands
        :good-bits="goodBits"
        :duration-sec="maxDuration"
        :selected-id="selectedGoodBitId"
        @select="(goodBit) => emit('select-goodbit', goodBit)"
      />
    </div>

    <!-- The preview has no controls of its own, so the transport lives here. -->
    <div class="flex items-center gap-3">
      <button
        class="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 transition-colors shrink-0"
        :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="$emit('toggle-playback')"
      >
        <Icon :icon="isPlaying ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-2xl" />
      </button>

      <span class="font-mono text-sm text-muted-400 tabular-nums">
        <span class="text-foreground">{{ playhead }}</span>
        <span class="mx-1">/</span>
        <span>{{ duration }}</span>
      </span>

      <!--
        Both keys, said where the transport is, because a binding nobody is told
        about is a binding nobody has.
      -->
      <span class="text-xs text-muted-400 ml-auto text-right">
        Space plays the trimmed range on loop · {{ arrowHint }}
      </span>
    </div>

    <footer class="flex items-center justify-between pt-4 border-t border-border">
      <div class="flex items-center gap-6 text-sm">
        <TimeIndicator
          label="Start"
          :time="startTime"
          steppable
          :step-name="stepLabel"
          @step="(delta) => emit('step-handle', 'start', delta)"
        />
        <TimeIndicator
          label="End"
          :time="endTime"
          steppable
          :step-name="stepLabel"
          @step="(delta) => emit('step-handle', 'end', delta)"
        />
        <!--
          The length is the one number here that is a count and not a position,
          so it gets the count of frames beside it and no nudge buttons: there
          is nothing to move, only two handles that decide it.
        -->
        <TimeIndicator label="Length" :time="length" :sub="lengthSub" variant="primary" />
      </div>
      
      <!--
        The button fills as the cut runs.

        An exact trim re-encodes, which on a 3440 wide recording is tens of
        seconds, and a spinner with no number gives no idea whether to wait or
        walk away. The fill is the progress; the percentage is there for anyone
        who wants the number.
      -->
      <button
        class="relative overflow-hidden inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium bg-linear-to-r from-orange-500 to-orange-600 text-card shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:scale-[1.02] enabled:active:scale-[0.98]"
        :disabled="!isValid || isSaving"
        @click="$emit('save')"
      >
        <span
          v-if="isSaving"
          class="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-linear"
          :style="{ width: `${Math.max(2, saveProgress)}%` }"
          aria-hidden="true"
        ></span>
        <AppLoading v-if="isSaving" class="relative text-lg" />
        <Icon v-else icon="material-symbols:save" class="relative text-lg" />
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
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BaseRangeSlider from '../Base/BaseRangeSlider.vue';
import TimeIndicator from './TimeIndicator.vue';
import GoodBitBands from './GoodBitBands.vue';
import type { TimeRange } from '../../composables/useTrimRange';
import type { GoodBit } from '../../types/goodbit';
import AppLoading from '../App/AppLoading.vue';

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
  /**
   * Every range already marked on this clip, drawn along the strip.
   *
   * This timeline showed one range with two handles, which is all a trim ever
   * needs: a trim replaces the file, so there is only ever one answer. A clip
   * can hold several GoodBits, and the strip is the only place they can be seen
   * against the footage they point at.
   */
  goodBits?: readonly GoodBit[];
  /** Which of them the handles are sitting on, so the band can say so. */
  selectedGoodBitId?: number | null;
  /**
   * How far one drag increment moves, in seconds: one frame, or a tenth when
   * nothing has reported a frame rate.
   */
  sliderStep?: number;
  /** `60 fps`, or null, which reads as "frame rate unknown" beside the duration. */
  frameRateText?: string | null;
  /** What one press moves, in words, for the hint and the tooltips. */
  stepLabel?: string;
  /** The count of frames in the range, beside its length. Null without a rate. */
  lengthSub?: string | null;
  /** How a handle writes its own value, so it agrees with the readouts below. */
  handleFormat?: (value: number) => string;
}

const props = withDefaults(defineProps<Props>(), {
  saveProgress: 0,
  goodBits: () => [],
  selectedGoodBitId: null,
  sliderStep: 0.1,
  frameRateText: null,
  stepLabel: 'one frame',
  lengthSub: null,
  handleFormat: (value: number) => `${value.toFixed(1)}s`,
});

interface Emits {
  (e: 'save'): void;
  (e: 'toggle-playback'): void;
  (e: 'seek', time: number): void;
  /** A band was pressed: put the handles on it. */
  (e: 'select-goodbit', goodBit: GoodBit): void;
  /** A nudge button was pressed beside one of the readouts. */
  (e: 'step-handle', which: 'start' | 'end', delta: number): void;
  /**
   * Which handle has keyboard focus, or null.
   *
   * The arrow keys move whichever handle is focused and the playhead when
   * neither is, and this is the only place that can tell which: the thumbs are
   * rendered by `BaseRangeSlider` and their order in the DOM is their order in
   * the model, so the index is a query against this strip and nothing higher up
   * could answer it.
   */
  (e: 'arm', handle: 'start' | 'end' | null): void;
}

const emit = defineEmits<Emits>();

/**
 * Space, and now the arrows, said in the words this clip's frame rate allows.
 *
 * Only the playhead is named. The other half of the rule, that the arrows move
 * a handle once one is grabbed, is on the nudge buttons' own tooltips beside
 * the handle they move, which is where somebody asking the question is looking.
 */
const arrowHint = computed(
  () => `arrows step the playhead ${props.stepLabel}, Shift for ten`,
);

const strip = ref<HTMLElement | null>(null);

/**
 * Arm the focused handle, so the arrow keys know what they are moving.
 *
 * A pointer down on a thumb focuses it (reka-ui does that itself), so dragging
 * a handle and then nudging it with the keyboard is one continuous gesture
 * rather than two features. Pressing anywhere else on the strip moves focus off
 * the thumb, which fires `focusout` and hands the arrows back to the playhead.
 */
function onFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target || target.getAttribute('role') !== 'slider') return;

  const thumbs = Array.from(strip.value?.querySelectorAll('[role="slider"]') ?? []);
  const index = thumbs.indexOf(target);
  if (index === -1) return;

  emit('arm', index === 0 ? 'start' : 'end');
}

function onFocusOut(): void {
  emit('arm', null);
}

/*
 * Whether the frames are on screen yet.
 *
 * `error` counts as ready on purpose: a strip that cannot be made should leave
 * an empty band rather than pulse for ever, and the timeline still works
 * without it.
 */
const stripReady = ref(false);

// A different clip, or the same one re-cut, means waiting again.
watch(
  () => props.frameStripSource,
  () => {
    stripReady.value = false;
  },
);

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

