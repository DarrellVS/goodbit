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
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedClipId = ref<string | null>(null);
const timelineRef = ref<HTMLElement | null>(null);

const pixelsPerSecond = computed(() => 50 * props.zoom);
const timelineWidth = computed(() => Math.max(props.duration * pixelsPerSecond.value, 1000));
const playheadPosition = computed(() => props.currentTime * pixelsPerSecond.value);

function handleTimelineClick(event: MouseEvent): void {
  if (!timelineRef.value) return;
  
  const rect = timelineRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left + timelineRef.value.scrollLeft;
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
      position: i * pixelsPerSecond.value,
      label: `${mins}:${secs.toString().padStart(2, '0')}`,
    });
  }
  
  return marks;
}

const rulerMarks = computed(generateRulerMarks);
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl border border-white/10 overflow-hidden">
    <div class="flex-shrink-0 h-8 bg-black/30 border-b border-white/10 relative overflow-hidden">
      <div class="relative h-full" :style="{ width: `${timelineWidth}px` }">
        <div
          v-for="mark in rulerMarks"
          :key="mark.position"
          class="absolute top-0 bottom-0 flex flex-col items-center"
          :style="{ left: `${mark.position}px` }"
        >
          <div class="h-2 w-px bg-white/20" />
          <span class="text-[9px] font-mono text-white/60 mt-0.5">{{ mark.label }}</span>
        </div>
      </div>
    </div>

    <div
      ref="timelineRef"
      class="flex-1 relative overflow-x-auto overflow-y-hidden cursor-pointer"
      @click="handleTimelineClick"
    >
      <div class="relative h-full py-4" :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
        <div class="relative h-20 bg-white/5 rounded-lg mx-4">
          <TimelineTrack
            v-for="clip in clips"
            :key="clip.id"
            :clip="clip"
            :zoom="zoom"
            :pixels-per-second="pixelsPerSecond"
            :selected="selectedClipId === clip.id"
            @select="selectClip"
            @remove="emit('remove-clip', $event)"
          />
        </div>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-orange-500 pointer-events-none z-10"
          :style="{ left: `${playheadPosition}px` }"
        >
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50" />
        </div>
      </div>
    </div>
  </div>
</template>

