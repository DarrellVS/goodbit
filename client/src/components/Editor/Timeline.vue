<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { formatTimeSimple } from '../../utils/timeFormat';
import { EDITOR_CONSTANTS, getRulerInterval } from '../../constants/editor';
import type { TimelineClip, RulerMark } from '../../types/editor';
import TimelineTrack from './TimelineTrack.vue';

interface Props {
  clips: readonly TimelineClip[];
  currentTime: number;
  duration: number;
  zoom: number;
}

interface Emits {
  (e: 'seek', time: number): void;
  (e: 'select-clip', clipId: string): void;
  (e: 'remove-clip', clipId: string): void;
  (e: 'trim-clip', clipId: string, trimStart: number, trimEnd: number): void;
  (e: 'move-clip', clipId: string, newStartTime: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedClipId = shallowRef<string | null>(null);
const rulerRef = shallowRef<HTMLElement | null>(null);
const contentRef = shallowRef<HTMLElement | null>(null);
const isDraggingRuler = shallowRef(false);

const pixelsPerSecond = computed(() => EDITOR_CONSTANTS.PIXELS_PER_SECOND_BASE * props.zoom);
const timelineWidth = computed(() => Math.max(props.duration * pixelsPerSecond.value, 1000));
const playheadPosition = computed(() => EDITOR_CONSTANTS.TIMELINE_OFFSET_PX + (props.currentTime * pixelsPerSecond.value));

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
      position: offset + (i * pps),
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

function handleClipSelect(clipId: string): void {
  selectedClipId.value = clipId;
  emit('select-clip', clipId);
}
</script>

<template>
  <div class="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden select-none">
    <div 
      ref="rulerRef"
      class="flex-shrink-0 h-7 bg-orange-50/50 border-b border-gray-300 relative overflow-x-auto overflow-y-hidden cursor-pointer scrollbar-hide"
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
          <div class="h-2 w-px bg-gray-300" />
          <span class="text-[9px] font-mono text-gray-500 mt-0.5">{{ mark.label }}</span>
        </div>
      </div>
    </div>

    <div 
      ref="contentRef"
      class="flex-1 relative overflow-x-auto overflow-y-hidden"
      @scroll="syncScroll"
    >
      <div class="relative h-full py-3" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
        <div class="relative h-16 bg-orange-50/30 rounded-lg mx-3 border border-gray-300">
          <TimelineTrack
            v-for="clip in clips"
            :key="clip.id"
            :clip="clip"
            :pixels-per-second="pixelsPerSecond"
            :selected="selectedClipId === clip.id"
            @select="handleClipSelect"
            @remove="emit('remove-clip', $event)"
            @trim="(id, start, end) => emit('trim-clip', id, start, end)"
            @move="(id, time) => emit('move-clip', id, time)"
          />
        </div>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-orange-500 pointer-events-none z-20 shadow-lg shadow-orange-500/50"
          :style="{ left: `${playheadPosition}px` }"
        >
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 border-2 border-white" />
        </div>
      </div>
    </div>
  </div>
</template>
