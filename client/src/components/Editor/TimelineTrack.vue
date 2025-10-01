<script setup lang="ts">
import { computed } from 'vue';
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
  (e: 'trim-start', clipId: string, time: number): void;
  (e: 'trim-end', clipId: string, time: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const leftPosition = computed(() => props.clip.startTime * props.pixelsPerSecond);
const width = computed(() => props.clip.duration * props.pixelsPerSecond);

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
</script>

<template>
  <div
    class="absolute top-0 h-20 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 group"
    :class="selected ? 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/20' : 'hover:ring-2 hover:ring-orange-400/50'"
    :style="{ left: `${leftPosition}px`, width: `${width}px` }"
    @click="emit('select', clip.id)"
  >
    <div class="relative w-full h-full bg-gradient-to-r from-gray-800 to-gray-700 border border-white/10">
      <img
        :src="clip.thumbnailUrl"
        class="w-full h-full object-cover opacity-30"
        alt="Clip thumbnail"
      />
      
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      
      <div class="absolute top-1 left-2 right-2 flex items-start justify-between">
        <div class="flex flex-col gap-0.5">
          <div class="text-[10px] font-semibold text-white/90 flex items-center gap-1">
            <Icon icon="material-symbols:video-library" class="text-xs" />
            Clip #{{ clip.clipId }}
          </div>
          <div v-if="clip.speed !== 1" class="text-[9px] font-medium text-orange-400 flex items-center gap-1">
            <Icon icon="material-symbols:speed" class="text-xs" />
            {{ clip.speed }}x
          </div>
        </div>
        
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/90 hover:bg-red-600 rounded p-0.5"
          @click.stop="emit('remove', clip.id)"
        >
          <Icon icon="material-symbols:close" class="text-white text-xs" />
        </button>
      </div>
      
      <div class="absolute bottom-1 left-2 right-2 flex items-end justify-between">
        <div class="text-[10px] font-mono font-medium text-white/90 bg-black/50 px-1.5 py-0.5 rounded">
          {{ formatTime(clip.duration) }}
        </div>
        
        <div class="flex items-center gap-1">
          <Icon v-if="clip.muted" icon="material-symbols:volume-off" class="text-red-400 text-xs" />
          <Icon v-if="clip.fadeIn > 0" icon="material-symbols:fade" class="text-orange-400 text-xs" />
          <Icon v-if="clip.fadeOut > 0" icon="material-symbols:fade" class="text-orange-400 text-xs rotate-180" />
        </div>
      </div>

      <div
        class="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 cursor-ew-resize hover:w-2 transition-all"
        @mousedown.stop
      />
      <div
        class="absolute right-0 top-0 bottom-0 w-1 bg-orange-500 cursor-ew-resize hover:w-2 transition-all"
        @mousedown.stop
      />
    </div>
  </div>
</template>

