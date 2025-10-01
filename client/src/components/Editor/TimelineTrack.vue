<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import type { TimelineClip } from '../../types/editor';

interface Props {
  clip: TimelineClip;
  zoom: number;
  pixelsPerSecond: number;
  selected: boolean;
}

interface Emits {
  (e: 'select', clipId: string): void;
  (e: 'remove', clipId: string): void;
  (e: 'trim', clipId: string, trimStart: number, trimEnd: number): void;
  (e: 'move', clipId: string, newStartTime: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isDraggingLeft = ref(false);
const isDraggingRight = ref(false);
const isDraggingClip = ref(false);
const dragStartX = ref(0);
const initialTrimStart = ref(0);
const initialTrimEnd = ref(0);
const initialStartTime = ref(0);

const leftPosition = computed(() => props.clip.startTime * props.pixelsPerSecond);
const width = computed(() => props.clip.duration * props.pixelsPerSecond);

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function startDragLeft(event: MouseEvent): void {
  event.stopPropagation();
  isDraggingLeft.value = true;
  dragStartX.value = event.clientX;
  initialTrimStart.value = props.clip.trimStart;
  
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', stopDrag);
}

function startDragRight(event: MouseEvent): void {
  event.stopPropagation();
  isDraggingRight.value = true;
  dragStartX.value = event.clientX;
  initialTrimEnd.value = props.clip.trimEnd;
  
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', stopDrag);
}

function onDragMove(event: MouseEvent): void {
  const deltaX = event.clientX - dragStartX.value;
  const deltaTime = deltaX / props.pixelsPerSecond;
  
  if (isDraggingLeft.value) {
    const newTrimStart = Math.max(0, Math.min(initialTrimStart.value + deltaTime, props.clip.trimEnd - 0.1));
    emit('trim', props.clip.id, newTrimStart, props.clip.trimEnd);
  } else if (isDraggingRight.value) {
    const newTrimEnd = Math.max(props.clip.trimStart + 0.1, Math.min(initialTrimEnd.value + deltaTime, props.clip.originalDuration));
    emit('trim', props.clip.id, props.clip.trimStart, newTrimEnd);
  } else if (isDraggingClip.value) {
    const newStartTime = Math.max(0, initialStartTime.value + deltaTime);
    emit('move', props.clip.id, newStartTime);
  }
}

function startDragClip(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('.trim-handle')) return;
  
  isDraggingClip.value = true;
  dragStartX.value = event.clientX;
  initialStartTime.value = props.clip.startTime;
  
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', stopDrag);
}

function stopDrag(): void {
  isDraggingLeft.value = false;
  isDraggingRight.value = false;
  isDraggingClip.value = false;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', stopDrag);
}
</script>

<template>
  <div
    class="absolute top-0 h-16 rounded-lg overflow-hidden group"
    :class="[
      selected ? 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/30' : 'hover:ring-2 hover:ring-orange-400/50',
      isDraggingClip ? 'cursor-grabbing' : 'cursor-grab'
    ]"
    :style="{ left: `${leftPosition}px`, width: `${width}px` }"
    @mousedown="startDragClip"
    @click.stop="emit('select', clip.id)"
  >
    <div class="relative w-full h-full bg-gradient-to-br from-white to-orange-50/50 border border-gray-300 backdrop-blur-sm">
      <img
        :src="clip.thumbnailUrl"
        class="w-full h-full object-cover opacity-30"
        alt="Clip thumbnail"
      />
      
      <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
      
      <div class="absolute top-1.5 left-2 right-2 flex items-start justify-between">
        <div class="flex flex-col gap-0.5">
          <div class="text-[10px] font-semibold text-gray-900 flex items-center gap-1 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
            <Icon icon="material-symbols:video-library" class="text-xs" />
            Clip #{{ clip.clipId }}
          </div>
        </div>
        
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 rounded p-0.5"
          @click.stop="emit('remove', clip.id)"
        >
          <Icon icon="material-symbols:close" class="text-white text-xs" />
        </button>
      </div>
      
      <div class="absolute bottom-1.5 left-2 right-2 flex items-end justify-between">
        <div class="text-[10px] font-mono font-medium text-gray-900 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
          {{ formatTime(clip.duration) }}
        </div>
        
        <div v-if="clip.muted" class="flex items-center gap-1 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
          <Icon icon="material-symbols:volume-off" class="text-red-500 text-xs" />
        </div>
      </div>

      <div 
        class="trim-handle absolute left-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown.stop="startDragLeft"
      />
      <div 
        class="trim-handle absolute right-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown.stop="startDragRight"
      />
    </div>
  </div>
</template>
