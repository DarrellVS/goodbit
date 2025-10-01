<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface Emits {
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'skip-backward'): void;
  (e: 'skip-forward'): void;
  (e: 'zoom-in'): void;
  (e: 'zoom-out'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'export'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
</script>

<template>
  <div class="flex items-center justify-between px-6 py-3 bg-white/60 backdrop-blur-sm border-t border-gray-300">
    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <Icon icon="material-symbols:undo" class="text-lg text-gray-700" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <Icon icon="material-symbols:redo" class="text-lg text-gray-700" />
      </button>
      
      <div class="w-px h-6 bg-gray-300 mx-2" />
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
        @click="emit('skip-backward')"
      >
        <Icon icon="material-symbols:fast-rewind" class="text-lg text-gray-700" />
      </button>
      
      <button
        class="p-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20"
        @click="playing ? emit('pause') : emit('play')"
      >
        <Icon :icon="playing ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-xl text-white" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
        @click="emit('skip-forward')"
      >
        <Icon icon="material-symbols:fast-forward" class="text-lg text-gray-700" />
      </button>
    </div>

    <div class="flex items-center gap-4">
      <div class="text-sm font-mono text-gray-700">
        {{ formatTime(currentTime) }} <span class="text-gray-400">/</span> {{ formatTime(duration) }}
      </div>
      
      <div class="w-px h-6 bg-gray-300" />
      
      <div class="flex items-center gap-2">
        <button
          class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40"
          :disabled="zoom >= 3"
          @click="emit('zoom-out')"
        >
          <Icon icon="material-symbols:zoom-out" class="text-lg text-gray-700" />
        </button>
        
        <span class="text-xs font-medium text-gray-600 w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
        
        <button
          class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40"
          :disabled="zoom <= 0.25"
          @click="emit('zoom-in')"
        >
          <Icon icon="material-symbols:zoom-in" class="text-lg text-gray-700" />
        </button>
      </div>
      
      <div class="w-px h-6 bg-gray-300" />
      
      <button
        class="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all font-medium shadow-lg shadow-orange-500/20 flex items-center gap-2 text-sm text-white"
        @click="emit('export')"
      >
        <Icon icon="material-symbols:download" class="text-lg" />
        Export
      </button>
    </div>
  </div>
</template>
