<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTime } from '../../utils/timeFormat';
import type { TimelineClip } from '../../types/editor';

interface Props {
  clip: TimelineClip;
  pixelsPerSecond: number;
  selected: boolean;
}

interface Emits {
  (e: 'select', clipId: string): void;
  (e: 'remove', clipId: string): void;
  (e: 'trim', clipId: string, trimStart: number, trimEnd: number): void;
  (e: 'move', clipId: string, newStartTime: number): void;
  (e: 'drag-end'): void;
}

const enum DragMode {
  None,
  Move,
  TrimLeft,
  TrimRight,
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dragMode = ref(DragMode.None);
const dragStartX = ref(0);
const dragInitialValue = ref(0);

const style = computed(() => ({
  left: `${props.clip.startTime * props.pixelsPerSecond}px`,
  width: `${props.clip.duration * props.pixelsPerSecond}px`,
}));

const cursorClass = computed(() =>
  dragMode.value === DragMode.Move ? 'cursor-grabbing' : 'cursor-grab'
);

const isDragging = computed(() => dragMode.value !== DragMode.None);

function startDrag(mode: DragMode, initialValue: number, event: MouseEvent): void {
  event.stopPropagation();
  
  dragMode.value = mode;
  dragStartX.value = event.clientX;
  dragInitialValue.value = initialValue;

  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', endDrag);
}

function handleDrag(event: MouseEvent): void {
  if (dragMode.value === DragMode.None) return;

  const deltaTime = (event.clientX - dragStartX.value) / props.pixelsPerSecond;
  const mode = dragMode.value;

  if (mode === DragMode.TrimLeft) {
    const newStart = Math.max(0, Math.min(dragInitialValue.value + deltaTime, props.clip.trimEnd - 0.1));
    emit('trim', props.clip.id, newStart, props.clip.trimEnd);
  } else if (mode === DragMode.TrimRight) {
    const newEnd = Math.max(props.clip.trimStart + 0.1, Math.min(dragInitialValue.value + deltaTime, props.clip.originalDuration));
    emit('trim', props.clip.id, props.clip.trimStart, newEnd);
  } else if (mode === DragMode.Move) {
    const newStart = Math.max(0, dragInitialValue.value + deltaTime);
    emit('move', props.clip.id, newStart);
  }
}

function stopDrag(): void {
  dragMode.value = DragMode.None;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', endDrag);
}

function endDrag(): void {
  const wasDragging = dragMode.value !== DragMode.None;
  stopDrag();

  // Lets the timeline close any gap the drag opened, once the gesture is over.
  if (wasDragging) emit('drag-end');
}

function handleMouseDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).classList.contains('trim-handle')) return;
  startDrag(DragMode.Move, props.clip.startTime, event);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <div
    class="absolute top-0 h-16 rounded-lg overflow-hidden group select-none"
    :class="[
      selected ? 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/30' : 'hover:ring-2 hover:ring-orange-400/50',
      cursorClass,
      // Follow the cursor 1:1 while dragging; glide when the timeline reflows on release.
      isDragging ? '' : 'transition-[left,width] duration-150 ease-out'
    ]"
    :style="style"
    @mousedown="handleMouseDown"
    @click.stop="emit('select', clip.id)"
  >
    <div class="relative w-full h-full bg-gradient-to-br from-white to-orange-50/50 border border-gray-300 backdrop-blur-sm">
      <img
        :src="clip.thumbnailUrl"
        :alt="`Clip ${clip.clipId}`"
        class="w-full h-full object-cover opacity-30"
      />
      
      <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
      
      <div class="absolute top-1.5 left-2 right-2 flex items-start justify-between">
        <div class="text-[10px] font-semibold text-gray-900 flex items-center gap-1 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
          <Icon icon="material-symbols:video-library" class="text-xs" />
          Clip #{{ clip.clipId }}
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
        
        <div v-if="clip.muted" class="bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
          <Icon icon="material-symbols:volume-off" class="text-red-500 text-xs" />
        </div>
      </div>

      <div 
        class="trim-handle absolute left-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown="startDrag(DragMode.TrimLeft, clip.trimStart, $event)"
      />
      <div 
        class="trim-handle absolute right-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown="startDrag(DragMode.TrimRight, clip.trimEnd, $event)"
      />
    </div>
  </div>
</template>
