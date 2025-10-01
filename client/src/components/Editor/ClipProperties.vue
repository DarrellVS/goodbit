<script setup lang="ts">
import { computed } from 'vue';
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

const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl border border-white/10 overflow-hidden">
    <div class="flex-shrink-0 px-4 py-3 bg-black/30 border-b border-white/10">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <Icon icon="material-symbols:tune" class="text-orange-500" />
        Clip Properties
      </h3>
    </div>

    <div v-if="!clip" class="flex-1 flex items-center justify-center text-muted-400 text-sm">
      <div class="text-center">
        <Icon icon="material-symbols:info" class="text-3xl mb-2 opacity-50" />
        <p>Select a clip to edit</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="space-y-2">
        <label class="text-xs font-semibold text-white/70 uppercase tracking-wide">Speed</label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="speed in speedOptions"
            :key="speed"
            class="px-3 py-2 rounded-lg text-sm font-medium transition-all"
            :class="clip.speed === speed 
              ? 'bg-orange-500 text-white shadow-lg' 
              : 'bg-white/5 hover:bg-white/10 text-white/80'"
            @click="emit('update', { speed })"
          >
            {{ speed }}x
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-white/70 uppercase tracking-wide flex items-center justify-between">
          Volume
          <span class="text-white/90 font-mono">{{ Math.round(clip.volume * 100) }}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          :value="clip.volume * 100"
          class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="emit('update', { volume: ($event.target as HTMLInputElement).valueAsNumber / 100 })"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-white/70 uppercase tracking-wide">Audio</label>
        <button
          class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          :class="clip.muted 
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
            : 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10'"
          @click="emit('update', { muted: !clip.muted })"
        >
          <Icon :icon="clip.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'" class="text-lg" />
          {{ clip.muted ? 'Unmute' : 'Mute' }}
        </button>
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-white/70 uppercase tracking-wide flex items-center justify-between">
          Fade In
          <span class="text-white/90 font-mono">{{ clip.fadeIn.toFixed(1) }}s</span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          :value="clip.fadeIn"
          class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="emit('update', { fadeIn: ($event.target as HTMLInputElement).valueAsNumber })"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-white/70 uppercase tracking-wide flex items-center justify-between">
          Fade Out
          <span class="text-white/90 font-mono">{{ clip.fadeOut.toFixed(1) }}s</span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          :value="clip.fadeOut"
          class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="emit('update', { fadeOut: ($event.target as HTMLInputElement).valueAsNumber })"
        />
      </div>

      <div class="pt-4 border-t border-white/10 space-y-2">
        <div class="text-xs font-semibold text-white/70 uppercase tracking-wide">Info</div>
        <div class="space-y-1 text-xs text-white/60">
          <div class="flex justify-between">
            <span>Original Duration:</span>
            <span class="font-mono text-white/80">{{ clip.originalDuration.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span>Current Duration:</span>
            <span class="font-mono text-white/80">{{ clip.duration.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span>Trim Start:</span>
            <span class="font-mono text-white/80">{{ clip.trimStart.toFixed(2) }}s</span>
          </div>
          <div class="flex justify-between">
            <span>Trim End:</span>
            <span class="font-mono text-white/80">{{ clip.trimEnd.toFixed(2) }}s</span>
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
  background: #f97316;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
}

.slider-thumb::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f97316;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
}
</style>

