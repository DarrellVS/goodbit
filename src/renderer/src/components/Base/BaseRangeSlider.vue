<template>
  <!--
    A wrapper that is only there to be measured.

    The labels are centred on their handles and a handle can sit at either end
    of the track, so the label has to know how much room it has before it can
    decide to stop centring. `SliderRoot` is a component rather than an element
    and the thumbs are positioned against it, so this is the one box whose
    width is both known here and the width the labels are clamped to.
  -->
  <div ref="trackEl" class="absolute inset-0 z-50 pointer-events-none">
    <!--
      The root takes no pointer events and the thumbs take all of them.
      Radix's slider normally treats a click anywhere on its track as "move the
      nearest thumb here", which over a frame strip means every attempt to put the
      playhead somewhere silently retrimmed the clip instead. Only the handles
      move the trim now; whatever sits behind this gets the rest of the strip.
    -->
    <SliderRoot
      v-model="model"
      :max="max"
      :step="step"
      :min-steps-between-thumbs="minStepsBetweenThumbs"
      class="absolute inset-0 flex items-center touch-none select-none pointer-events-none"
    >
      <SliderTrack class="relative w-full h-full">
        <SliderRange class="absolute h-full bg-primary/20" />
      </SliderTrack>
      <!--
        The thumb itself has no width on purpose.
        Radix positions a thumb by percentage and then pulls it back inside the
        track by a share of its own width, so a wide thumb lands visibly short of
        0% and past 100%. The handle sat several pixels away from the edge of the
        strip it was supposed to mark. A zero-width thumb is positioned exactly,
        and the parts you can see and grab hang off it.
      -->
      <SliderThumb
        v-for="(value, i) in model"
        :key="i"
        :aria-label="i === 0 ? 'Start time' : 'End time'"
        :title="i === 0 ? 'Drag to move the start' : 'Drag to move the end'"
        class="group relative block h-full w-0 outline-hidden pointer-events-auto touch-none"
      >
        <!--
          A hairline you can see, and a target you can hit.

          The target was 16px across, under the 24px minimum, which is why the
          frame strip behind it kept getting dragged instead of the handle. It is
          24px now, centred on the hairline.

          The hairline used to animate from 3px to 5px on hover and focus, which
          is the no-layout-shift rule broken in the one place the app-wide test
          cannot see it: that test walks buttons, cards and rows, and this is an
          absolutely positioned div inside a slider thumb. It changes colour
          instead, which is what says "you have hold of this" regardless.
        -->
        <div class="absolute inset-y-0 -left-3 -right-3 cursor-ew-resize" />
        <div
          class="absolute inset-y-0 left-0 -translate-x-1/2 w-[3px] rounded-xs pointer-events-none bg-accent transition-colors duration-150 group-hover:bg-accent-hover group-focus-visible:bg-accent-hover"
        />

        <!--
          The timecode, centred on the handle until centring would take it off
          the end of the strip. See `labelShift`: the last frame of a clip is
          exactly where somebody trims to, and a label that cannot be read
          there is a label missing when it is wanted most.
        -->
        <div
          :ref="(element) => setLabel(i, element as HTMLElement | null)"
          :class="[
            // The thumb has no width, so the label centres on its left edge.
            'absolute left-0 px-2 py-0.5 bg-accent text-accent-fg text-xs font-mono whitespace-nowrap shadow-pop pointer-events-none',
            i === 0 ? '-top-1 rounded-t' : '-bottom-1 rounded-b',
          ]"
          :style="{ transform: `translateX(calc(-50% + ${labelShift(i)}px))` }"
        >
          {{ format(value) }}
        </div>
      </SliderThumb>
    </SliderRoot>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';

const props = withDefaults(
  defineProps<{
    max: number;
    step?: number;
    minStepsBetweenThumbs?: number;
    /**
     * How a thumb writes its own value.
     *
     * Seconds to one place was right while the only caller picked in tenths.
     * The trim timeline now picks in frames and prints a timecode underneath,
     * and a handle saying `12.3s` while the readout below it says `0:12:20` is
     * two answers to one question, on one screen.
     */
    format?: (value: number) => string;
  }>(),
  {
    step: 0.1,
    minStepsBetweenThumbs: 0,
    format: (value: number) => `${value.toFixed(1)}s`,
  },
);

const model = defineModel<number[]>({ required: true });

/**
 * How far a label may sit from the end of the strip, in pixels.
 *
 * The handles reach 0 and the full duration, the labels are centred on them,
 * and a centred label at either end hangs half its own width past the track.
 * On the end handle that was half a timecode outside the panel: the page grew
 * a horizontal scrollbar, and the part of the number that said which frame you
 * were on was the part that went missing.
 *
 * So the label centres on its handle until doing so would cross this line, and
 * then it stops, which reads as the label sliding the last few pixels rather
 * than following the handle off the end.
 */
const LABEL_GUTTER = 6;

const trackEl = ref<HTMLElement | null>(null);
const trackWidth = ref(0);
const labelWidths = ref<number[]>([]);

/**
 * The label elements, in a plain array rather than a ref.
 *
 * Vue calls a function ref on every render, so anything it writes that the
 * template then reads is an update loop: this measured the labels from inside
 * the ref, the measurement fed `labelShift`, `labelShift` is in the template,
 * and the renderer span at a hundred percent with the window blank. Measuring
 * is a job for after a render, never during one.
 */
const labelEls: Array<HTMLElement | null> = [];

function setLabel(index: number, element: HTMLElement | null): void {
  labelEls[index] = element;
}

function measureLabels(): void {
  labelWidths.value = labelEls.map((element) => element?.offsetWidth ?? 0);
}

/**
 * How far to push this label back from where centring would put it.
 *
 * Zero in the middle of the strip, which is nearly always, so the common case
 * is exactly the centred label it has always been.
 */
function labelShift(index: number): number {
  const width = labelWidths.value[index] ?? 0;
  const track = trackWidth.value;
  if (!width || !track) return 0;

  const half = width / 2;
  // Wider than the room it has: centred is as good as anything else, and
  // pinning it to one side would only pick which end gets cut off.
  if (half * 2 + LABEL_GUTTER * 2 > track) return 0;

  const at = ((model.value[index] ?? 0) / (props.max || 1)) * track;
  const clamped = Math.min(Math.max(at, LABEL_GUTTER + half), track - LABEL_GUTTER - half);
  return clamped - at;
}

let observer: ResizeObserver | null = null;

onMounted(async () => {
  const element = trackEl.value;
  if (!element) return;
  trackWidth.value = element.clientWidth;
  observer = new ResizeObserver(() => {
    trackWidth.value = element.clientWidth;
    measureLabels();
  });
  observer.observe(element);
  // After the labels have their text, which is a tick later than this.
  await nextTick();
  measureLabels();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

// A timecode can change width, 0:09:59 to 0:10:00, and the clamp is in pixels.
watch(model, () => measureLabels(), { deep: true, flush: 'post' });
</script>
