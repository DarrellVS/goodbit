<template>
  <!--
    A band, not a card.

    This was a bordered panel with a shadow, inside a modal that is already a
    bordered panel with a shadow, headed `Timeline` beside a tinted disc. The
    heading named the only timeline on a screen called Trim, and the sentence
    under it explained a control that two handles and two timecode bubbles
    already explain by existing.
  -->
  <section class="space-y-5">
    <div
      ref="strip"
      class="relative h-32 rounded-md overflow-visible border border-border"
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
        class="absolute inset-0 rounded-md bg-muted-50 animate-pulse"
        aria-hidden="true"
      ></div>

      <img
        :src="frameStripSource"
        alt="Video frames"
        class="w-full h-full object-cover pointer-events-none select-none rounded-md transition-opacity duration-300"
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
        class="absolute inset-0 z-40 cursor-pointer rounded-md"
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

      <div class="absolute inset-0 pointer-events-none rounded-md overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 bg-linear-to-r from-video-bed/60 to-video-bed/40 backdrop-blur-xs"
          :style="{ width: startPercentage + '%' }"
        />
        <div
          class="absolute inset-y-0 right-0 bg-linear-to-l from-video-bed/60 to-video-bed/40 backdrop-blur-xs"
          :style="{ width: (100 - endPercentage) + '%' }"
        />

        <!--
          Where the preview is. Above the shading so it stays visible over the
          trimmed-away parts, and inert so it never fights the range handles.
        -->
        <div
          class="absolute inset-y-0 w-0.5 -ml-px bg-on-video shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          :style="{ left: playheadPercentage + '%' }"
        >
          <div class="absolute -top-px left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-on-video " />
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
        :suggested="suggestedBands"
        @select="(goodBit) => emit('select-goodbit', goodBit)"
        @keep-suggested="(band) => emit('keep-suggested', band)"
      />
    </div>

    <!-- The preview has no controls of its own, so the transport lives here. -->
    <div class="flex items-center gap-3">
      <button
        class="inline-flex items-center justify-center size-9 shrink-0 rounded-full bg-accent text-accent-fg hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors shrink-0"
        :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="$emit('toggle-playback')"
      >
        <Icon :icon="isPlaying ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-2xl" />
      </button>

      <!--
        Where the playhead is. The length is at the other end of this row now,
        so this no longer prints it as a denominator: the same number twice on
        one line is a number nobody reads.

        The arrow keys move this, which was the half of the keyboard hint that
        no other tooltip covered, so it is this readout's own tooltip: hovering
        the number says what moves it.
      -->
      <span
        class="font-mono text-sm tabular-nums text-foreground"
        :title="`The playhead. Space plays the trimmed range on loop, ${arrowHint}.`"
      >
        {{ playhead }}
      </span>

      <!--
        How long the recording is, and at what rate, moved down from a header
        of its own above the strip.

        It had a line to itself for one short readout, which put a rule and a
        band of empty space between the picture and the strip it belongs to.
        Down here it is reading matter about the clip in the row that already
        holds reading matter about the clip.

        The keyboard hint that used to sit here is gone on request. The
        bindings are not: Space is in the play button's own tooltip and the
        arrows are in the nudge buttons' beside the numbers they move.
      -->
      <div class="ml-auto flex items-center gap-2 text-sm">
        <span class="text-muted-500">Duration</span>
        <!-- `duration` is already formatted, frames and all. -->
        <span class="font-mono font-medium text-foreground tabular-nums">{{ duration }}</span>
        <!--
          The frame rate, beside a timecode, because it is the legend for the
          last field of every one of them.

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
    </div>

    <!--
      The numbers, and the one act that replaces the recording.

      Nothing else on this screen is filled with the accent. Marking a GoodBit
      is in the column beside the picture now, in the details screen's own
      styling, so the bottom of the trimmer reads as one decision rather than
      as two of similar weight a hand's width apart.
    -->
    <footer class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4 border-t border-border">
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
        type="button"
        class="relative overflow-hidden inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-accent text-accent-fg hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
        :disabled="!isValid || isSaving"
        title="Cut the recording down to this range. This replaces the file, and cannot be undone."
        @click="$emit('save')"
      >
        <span
          v-if="isSaving"
          class="absolute inset-y-0 left-0 bg-on-video/25 transition-[width] duration-200 ease-linear"
          :style="{ width: `${Math.max(2, saveProgress)}%` }"
          aria-hidden="true"
        ></span>
        <BaseSpinner v-if="isSaving" class="relative size-4 shrink-0 block" />
        <Icon v-else icon="material-symbols:save" class="relative size-4 shrink-0 block" />
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
import BaseRangeSlider from '@renderer/components/Base/BaseRangeSlider.vue';
import TimeIndicator from './TimeIndicator.vue';
import GoodBitBands, { type SuggestedBand } from './GoodBitBands.vue';
import type { TimeRange } from '@renderer/composables/trim/useTrimRange';
import type { GoodBit } from '@renderer/types/goodbit';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

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
   * Ranges the game's HUD found and nobody has kept, drawn as outlines.
   *
   * Only passed when there are several: see `GoodBitBands`, where one offered
   * range is the range the handles are already on.
   */
  suggestedBands?: readonly SuggestedBand[];
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
  suggestedBands: () => [],
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
  /** An offered band was pressed: keep it as a GoodBit. */
  (e: 'keep-suggested', band: SuggestedBand): void;
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
 * The arrows, said in the words this clip's frame rate allows.
 *
 * It was a standing line on the transport row and is the playhead readout's
 * tooltip now: a sentence that is read once and then sits there for ever was
 * the widest thing on that row, and the row's job is the two numbers.
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

