<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTimeSimple } from '@renderer/utils/timeFormat';
import { EDITOR_CONSTANTS, getRulerInterval } from '@renderer/constants/editor';
import type { TimelineAudio, TimelineClip, RulerMark } from '@renderer/types/editor';
import TimelineTrack from './TimelineTrack.vue';
import AudioTrackItem from './AudioTrackItem.vue';

interface Props {
  clips: readonly TimelineClip[];
  audio: readonly TimelineAudio[];
  currentTime: number;
  /** Longest of the two lanes, what the ruler spans. */
  duration: number;
  /** End of the picture. Music past this point is cut on export. */
  videoDuration: number;
  zoom: number;
  selectedClipId: string | null;
  selectedAudioId: string | null;
}

interface Emits {
  (e: 'seek', time: number): void;
  (e: 'select-clip', clipId: string): void;
  (e: 'remove-clip', clipId: string): void;
  (e: 'trim-clip', clipId: string, trimStart: number, trimEnd: number): void;
  (e: 'move-clip', clipId: string, newStartTime: number): void;
  /** Once per gesture, before anything moves: the page records an undo step here. */
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
  (e: 'select-audio', audioId: string): void;
  (e: 'remove-audio', audioId: string): void;
  (e: 'trim-audio', audioId: string, trimStart: number, trimEnd: number): void;
  (e: 'move-audio', audioId: string, newStartTime: number): void;
  /** The empty lane is the obvious place to click when you want music. */
  (e: 'open-music'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const rulerRef = shallowRef<HTMLElement | null>(null);
const contentRef = shallowRef<HTMLElement | null>(null);
const isDraggingRuler = shallowRef(false);

const pixelsPerSecond = computed(() => EDITOR_CONSTANTS.PIXELS_PER_SECOND_BASE * props.zoom);
/** Time zero, in pixels from the scroller's edge. The lanes are inset by it. */
const offsetPx = EDITOR_CONSTANTS.TIMELINE_OFFSET_PX;
/** The lane itself: exactly as wide as the clips it holds. */
const laneWidth = computed(() => Math.max(props.duration * pixelsPerSecond.value, 1000));

/**
 * The scrolling container, which also has to cover the gutter either side.
 *
 * The lanes sit inside this with a 12px margin, so a container sized to the
 * lane left the last clip hanging 24px past its track.
 */
const timelineWidth = computed(() => laneWidth.value + EDITOR_CONSTANTS.TIMELINE_OFFSET_PX * 2);
const playheadPosition = computed(
  () => EDITOR_CONSTANTS.TIMELINE_OFFSET_PX + props.currentTime * pixelsPerSecond.value
);

/** Where the picture ends, in lane pixels, music beyond it is hatched. */
const videoEndPosition = computed(() => props.videoDuration * pixelsPerSecond.value);
const showOverrunHatch = computed(
  () => props.videoDuration > 0 && props.duration > props.videoDuration + 0.05
);

/**
 * The zoom at which the whole movie fits, for the "Fit" button.
 *
 * Returned rather than applied, because `zoom` is the page's state and this
 * component only knows the one thing the page cannot: how wide the scroller
 * actually is.
 *
 * Clamped to the zoom range, so a very long timeline settles at the minimum
 * and a very short one does not zoom to absurdity.
 */
function zoomToFit(): number {
  const scroller = contentRef.value;
  if (!scroller || props.duration <= 0) return props.zoom;

  const usable = scroller.clientWidth - EDITOR_CONSTANTS.TIMELINE_OFFSET_PX * 2;
  if (usable <= 0) return props.zoom;

  const wanted = usable / props.duration / EDITOR_CONSTANTS.PIXELS_PER_SECOND_BASE;
  return Math.min(EDITOR_CONSTANTS.ZOOM.MAX, Math.max(EDITOR_CONSTANTS.ZOOM.MIN, wanted));
}

defineExpose({ zoomToFit });

/*
 * Keep the playhead in sight while it is moving.
 *
 * The timeline did not follow playback: pressing space on a montage longer
 * than the window left the ruler showing 0:00 to 0:13 while the preview played
 * clip two, with no playhead anywhere on screen. Nothing told you where you
 * were.
 *
 * Only when it has actually left the visible strip, and only by enough to put
 * it a third of the way in, so it is not scrolling on every frame and there is
 * some of what comes next already on screen.
 */
watch(
  () => props.currentTime,
  () => {
    const scroller = contentRef.value;
    if (!scroller) return;

    const at = playheadPosition.value;
    const left = scroller.scrollLeft;
    const right = left + scroller.clientWidth;

    if (at >= left && at <= right) return;

    scroller.scrollLeft = Math.max(0, at - scroller.clientWidth / 3);
    if (rulerRef.value) rulerRef.value.scrollLeft = scroller.scrollLeft;
  },
);

function syncScroll(event: Event): void {
  const source = event.target as HTMLElement;
  const target = source === rulerRef.value ? contentRef.value : rulerRef.value;
  if (target && target.scrollLeft !== source.scrollLeft) {
    target.scrollLeft = source.scrollLeft;
  }
}

function seekFromMousePosition(event: MouseEvent): void {
  const ruler = rulerRef.value;
  if (!ruler) return;

  const rect = ruler.getBoundingClientRect();
  const x = event.clientX - rect.left + ruler.scrollLeft - EDITOR_CONSTANTS.TIMELINE_OFFSET_PX;
  const time = x / pixelsPerSecond.value;

  emit('seek', Math.max(0, Math.min(time, props.duration)));
}

const rulerMarks = computed((): RulerMark[] => {
  const marks: RulerMark[] = [];
  const interval = getRulerInterval(props.zoom);
  const pps = pixelsPerSecond.value;
  const offset = EDITOR_CONSTANTS.TIMELINE_OFFSET_PX;

  for (let i = 0; i <= Math.ceil(props.duration); i += interval) {
    marks.push({
      position: offset + i * pps,
      label: formatTimeSimple(i),
    });
  }

  return marks;
});

function handleRulerMouseDown(event: MouseEvent): void {
  isDraggingRuler.value = true;
  seekFromMousePosition(event);

  document.addEventListener('mousemove', handleRulerDrag);
  document.addEventListener('mouseup', handleRulerMouseUp);
}

function handleRulerDrag(event: MouseEvent): void {
  if (!isDraggingRuler.value) return;
  seekFromMousePosition(event);
}

function handleRulerMouseUp(): void {
  isDraggingRuler.value = false;
  document.removeEventListener('mousemove', handleRulerDrag);
  document.removeEventListener('mouseup', handleRulerMouseUp);
}
</script>

<template>
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden select-none">
    <div
      ref="rulerRef"
      class="shrink-0 h-7 bg-orange-500/4 border-b border-border relative overflow-x-auto overflow-y-hidden cursor-pointer scrollbar-hide"
      @mousedown="handleRulerMouseDown"
      @scroll="syncScroll"
    >
      <div class="relative h-full" :style="{ width: `${timelineWidth}px` }">
        <!--
          The tick sits on its own timestamp, and the label hangs off it.

          This was a `flex flex-col items-center` box positioned at
          `mark.position` with no width set, so it shrank to fit its label and
          centred both children in it. The label is about 35px wide, which put
          every tick line 17px to the right of the second it marks: the ruler
          kept perfect 50px spacing while pointing at the wrong place, so it
          looked like a rounding error rather than an origin error.

          `w-0` is what fixes it. The tick is the first child of a zero width
          box, so it lands exactly on `mark.position`, which is the same
          coordinate the playhead and the lanes below now use.

          The label is absolute and left aligned just past the tick rather than
          centred under it, because centred is what forces the choice between
          being wrong and being cut off: half of `0:00` sits at a negative x at
          the start of the timeline and the scroller clips it. Reading left to
          right from the mark is also what every timeline in every editor does.
          `whitespace-nowrap` because its parent is zero pixels wide and would
          otherwise wrap it away to nothing.
        -->
        <div
          v-for="mark in rulerMarks"
          :key="mark.position"
          class="absolute top-0 bottom-0 w-0"
          :style="{ left: `${mark.position}px` }"
        >
          <div class="h-2 w-px bg-muted-300" />
          <span
            class="absolute top-2.5 left-1 text-[9px] font-mono text-muted-500 whitespace-nowrap"
          >{{ mark.label }}</span>
        </div>
      </div>
    </div>

    <div
      ref="contentRef"
      class="flex-1 relative overflow-x-auto overflow-y-hidden"
      @scroll="syncScroll"
    >
      <div
        class="relative h-full py-3 space-y-2"
        :style="{
          width: `${timelineWidth}px`,
          minWidth: '100%',
          paddingInline: `${offsetPx}px`,
        }"
      >
        <!--
          The lane starts at `TIMELINE_OFFSET_PX`, because so does time zero.

          Nothing here starts at the container's left edge. `rulerMarks` puts
          its first tick at `offset + 0`, `playheadPosition` puts `currentTime`
          of zero at `offset`, `seekFromMousePosition` subtracts `offset` back
          off, and `timelineWidth` is the lane plus one `offset` of gutter at
          each end. The gutter is what stops the playhead handle, which is 12px
          wide and centred on a 2px bar, from being cut in half by the
          scroller's own edge at the start of the timeline.

          This lane briefly had no horizontal inset at all, on the reasoning
          that the ruler and the playhead both start at zero. They do not, they
          start at `offset`, so removing it left every clip sitting twelve
          pixels to the left of the tick for the time it is at.

          Padding on the scrolling container rather than a margin here, and
          that distinction is the whole fix. An absolutely positioned element
          resolves `left` against its containing block's *padding box*, so the
          padding moves these two lanes, which are in normal flow, and leaves
          the playhead's own coordinates alone. A margin would have moved the
          lanes and not the playhead, which is the same bug wearing a different
          hat. `border-box` keeps the container `timelineWidth` wide overall,
          so it still scrolls in step with the ruler beside it.

          The padding is written from `TIMELINE_OFFSET_PX` rather than as a
          `px-6` class on purpose. A class would be a second copy of a number
          the ruler and the playhead already read from the constant, and this
          has now drifted apart twice. Changing the gutter should be changing
          one number.
        -->
        <div class="relative h-16 bg-orange-500/4 rounded-lg border border-border">
          <TimelineTrack
            v-for="clip in clips"
            :key="clip.id"
            :clip="clip"
            :pixels-per-second="pixelsPerSecond"
            :selected="selectedClipId === clip.id"
            @select="emit('select-clip', $event)"
            @remove="emit('remove-clip', $event)"
            @trim="(id, start, end) => emit('trim-clip', id, start, end)"
            @move="(id, time) => emit('move-clip', id, time)"
            @drag-start="emit('drag-start')"
            @drag-end="emit('drag-end')"
          />
        </div>

        <!--
          The same ground as the clip lane above it.

          This was `bg-amber-500/4` against the clips' `bg-orange-500/4`: two
          different hues at the same 4%, which is a difference nobody chose and
          which only became visible when Tailwind 4 started rendering off-scale
          opacities that Tailwind 3 dropped on the floor. A lane is a lane.
        -->
        <div class="relative h-12 bg-orange-500/4 rounded-lg border border-border">
          <!--
            Everything past the last frame of video is dropped on export, so the
            lane says so rather than letting a long track look like it survives.
          -->
          <div
            v-if="showOverrunHatch"
            class="absolute top-0 bottom-0 right-0 rounded-r-lg pointer-events-none overrun-hatch"
            :style="{ left: `${videoEndPosition}px` }"
          />

          <AudioTrackItem
            v-for="item in audio"
            :key="item.id"
            :item="item"
            :pixels-per-second="pixelsPerSecond"
            :selected="selectedAudioId === item.id"
            @select="emit('select-audio', $event)"
            @remove="emit('remove-audio', $event)"
            @trim="(id, start, end) => emit('trim-audio', id, start, end)"
            @move="(id, time) => emit('move-audio', id, time)"
            @drag-start="emit('drag-start')"
          />

          <button
            v-if="audio.length === 0"
            type="button"
            class="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-400 hover:text-orange-500 transition-colors"
            @click="emit('open-music')"
          >
            <Icon icon="material-symbols:music-note" class="text-sm" />
            Music lane. Click to add a track
          </button>
        </div>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-orange-500 pointer-events-none z-20 shadow-lg shadow-orange-500/50"
          :style="{ left: `${playheadPosition}px` }"
        >
          <!--
            `top-0`, not `-top-1`, and what it fixes was being held up by an
            accident.

            The scroller has `overflow-y-hidden`, so anything above its top
            edge is cut off. This handle asked to sit 4px above that edge and
            was drawn in full anyway: Tailwind 3 implemented `space-y-2` as a
            margin-top on every child after the first, and the playhead bar
            this sits in is one of those children. An absolutely positioned
            element still takes a margin, so the bar, and the handle with it,
            was pushed 8px down into view by a rule meant for the lanes beside
            it. That also hid the bar's own top end behind the handle.

            Tailwind 4 puts the margin on the bottom of every child except the
            last. This is the last child, so it gets nothing: the -4px became
            real and the top half of the handle vanished under the ruler.

            At `top-0` the handle starts exactly where the bar does, so
            nothing is clipped and the bar has no stub poking out above it,
            without either of those depending on a spacing rule reaching an
            element it was never aimed at.
          -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 border-2 border-card" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overrun-hatch {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(148, 163, 184, 0.25) 0px,
    rgba(148, 163, 184, 0.25) 4px,
    transparent 4px,
    transparent 8px
  );
}
</style>
