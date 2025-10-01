<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { TimelineClip } from '../../types/editor';

interface Props {
  clip: TimelineClip | null;
}

interface Emits {
  (e: 'update', updates: Partial<TimelineClip>): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
    <div class="flex-shrink-0 px-4 py-3 bg-orange-50/50 border-b border-gray-300">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-gray-900">
        <Icon icon="material-symbols:tune" class="text-orange-500" />
        Clip Properties
      </h3>
    </div>

    <div v-if="!clip" class="flex-1 flex items-center justify-center text-gray-500 text-sm">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center">
          <Icon icon="material-symbols:info" class="text-2xl text-orange-400" />
        </div>
        <p class="font-medium text-gray-700">No clip selected</p>
        <p class="text-xs mt-1 text-gray-500">Click a clip to edit</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="space-y-2">
        <label class="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center justify-between">
          <span class="flex items-center gap-1">
            <Icon icon="material-symbols:volume-up" class="text-orange-500" />
            Volume
          </span>
          <span class="text-gray-900 font-mono text-sm">{{ Math.round(clip.volume * 100) }}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          :value="clip.volume * 100"
          class="w-full h-2 bg-orange-100 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="emit('update', { volume: ($event.target as HTMLInputElement).valueAsNumber / 100 })"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:volume-off" class="text-orange-500" />
          Audio
        </label>
        <button
          class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border"
          :class="clip.muted 
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-600 border-red-500/40' 
            : 'bg-white/80 hover:bg-white text-gray-700 border-gray-300'"
          @click="emit('update', { muted: !clip.muted })"
        >
          <Icon :icon="clip.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'" class="text-lg" />
          {{ clip.muted ? 'Unmute Clip' : 'Mute Clip' }}
        </button>
      </div>

      <div class="pt-4 border-t border-gray-300 space-y-2">
        <div class="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:info" class="text-orange-500" />
          Clip Info
        </div>
        <div class="space-y-1.5 text-xs bg-white/80 rounded-lg p-3 border border-gray-300">
          <div class="flex justify-between">
            <span class="text-gray-600">Original:</span>
            <span class="font-mono text-gray-900">{{ clip.originalDuration.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Current:</span>
            <span class="font-mono text-gray-900">{{ clip.duration.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Trim Start:</span>
            <span class="font-mono text-gray-900">{{ clip.trimStart.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Trim End:</span>
            <span class="font-mono text-gray-900">{{ clip.trimEnd.toFixed(2) }}s</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider-thumb::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
  border: 2px solid white;
}

.slider-thumb::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
}
</style>
