<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TimelineClip } from '../../types/editor';
import TimelineTrack from './TimelineTrack.vue';

interface Props {
  clips: TimelineClip[];
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

const selectedClipId = ref<string | null>(null);
const timelineRef = ref<HTMLElement | null>(null);
const rulerRef = ref<HTMLElement | null>(null);

const TIMELINE_OFFSET = 12;

const pixelsPerSecond = computed(() => 50 * props.zoom);
const timelineWidth = computed(() => Math.max(props.duration * pixelsPerSecond.value, 1000));
const playheadPosition = computed(() => TIMELINE_OFFSET + (props.currentTime * pixelsPerSecond.value));

function handleRulerClick(event: MouseEvent): void {
  if (!rulerRef.value) return;
  
  const rect = rulerRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left + rulerRef.value.scrollLeft - TIMELINE_OFFSET;
  const time = x / pixelsPerSecond.value;
  
  emit('seek', Math.max(0, Math.min(time, props.duration)));
}

function selectClip(clipId: string): void {
  selectedClipId.value = clipId;
  emit('select-clip', clipId);
}

function generateRulerMarks(): Array<{ position: number; label: string }> {
  const marks: Array<{ position: number; label: string }> = [];
  const interval = props.zoom < 0.5 ? 10 : props.zoom < 1 ? 5 : 1;
  
  for (let i = 0; i <= Math.ceil(props.duration); i += interval) {
    const mins = Math.floor(i / 60);
    const secs = i % 60;
    marks.push({
      position: TIMELINE_OFFSET + (i * pixelsPerSecond.value),
      label: `${mins}:${secs.toString().padStart(2, '0')}`,
    });
  }
  
  return marks;
}

const rulerMarks = computed(generateRulerMarks);
</script>

<template>
  <div class="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
    <div 
      ref="rulerRef"
      class="flex-shrink-0 h-7 bg-orange-50/50 border-b border-gray-300 relative overflow-x-auto overflow-y-hidden cursor-pointer"
      @click="handleRulerClick"
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
      ref="timelineRef"
      class="flex-1 relative overflow-x-auto overflow-y-hidden"
    >
      <div class="relative h-full py-3" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
        <div class="relative h-16 bg-orange-50/30 rounded-lg mx-3 border border-gray-300">
          <TimelineTrack
            v-for="clip in clips"
            :key="clip.id"
            :clip="clip"
            :zoom="zoom"
            :pixels-per-second="pixelsPerSecond"
            :selected="selectedClipId === clip.id"
            @select="selectClip"
            @remove="emit('remove-clip', $event)"
            @trim="(clipId, trimStart, trimEnd) => emit('trim-clip', clipId, trimStart, trimEnd)"
            @move="(clipId, newStartTime) => emit('move-clip', clipId, newStartTime)"
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
