<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTimeSimple } from '../../utils/timeFormat';
import { EDITOR_CONSTANTS, getRulerInterval } from '../../constants/editor';
import type { TimelineAudio, TimelineClip, RulerMark } from '../../types/editor';
import TimelineTrack from './TimelineTrack.vue';
import AudioTrackItem from './AudioTrackItem.vue';

interface Props {
  clips: readonly TimelineClip[];
  audio: readonly TimelineAudio[];
  currentTime: number;
  /** Longest of the two lanes — what the ruler spans. */
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

/** Where the picture ends, in lane pixels — music beyond it is hatched. */
const videoEndPosition = computed(() => props.videoDuration * pixelsPerSecond.value);
const showOverrunHatch = computed(
  () => props.videoDuration > 0 && props.duration > props.videoDuration + 0.05
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
      class="flex-shrink-0 h-7 bg-orange-500/4 border-b border-border relative overflow-x-auto overflow-y-hidden cursor-pointer scrollbar-hide"
      @mousedown="handleRulerMouseDown"
      @scroll="syncScroll"
    >
      <div class="relative h-full" :style="{ width: `${timelineWidth}px` }">
        <div
          v-for="mark in rulerMarks"
          :key="mark.position"
          class="absolute top-0 bottom-0 flex flex-col items-center"
          :style="{ left: `${mark.position}px` }"
        >
          <div class="h-2 w-px bg-muted-300" />
          <span class="text-[9px] font-mono text-muted-500 mt-0.5">{{ mark.label }}</span>
        </div>
      </div>
    </div>

    <div
      ref="contentRef"
      class="flex-1 relative overflow-x-auto overflow-y-hidden"
      @scroll="syncScroll"
    >
      <div class="relative h-full py-3 space-y-2" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
        <div class="relative h-16 bg-orange-500/4 rounded-lg mx-3 border border-border">
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

        <div class="relative h-12 bg-amber-500/4 rounded-lg mx-3 border border-border">
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
            Music lane — click to add a track
          </button>
        </div>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-orange-500 pointer-events-none z-20 shadow-lg shadow-orange-500/50"
          :style="{ left: `${playheadPosition}px` }"
        >
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 border-2 border-card" />
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
