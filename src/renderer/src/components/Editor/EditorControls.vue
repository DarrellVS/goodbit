<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { formatTime } from '@renderer/utils/timeFormat';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting?: boolean;
  exportProgress?: number;
  /** True while every clip on the timeline is being listened to. */
  trimmingHighlights?: boolean;
  clipCount?: number;
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
  (e: 'trim-to-highlights'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex items-center justify-between px-6 py-3 bg-card/60 backdrop-blur-sm border-t border-border">
    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <Icon icon="material-symbols:undo" class="text-lg text-muted-700" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <Icon icon="material-symbols:redo" class="text-lg text-muted-700" />
      </button>
      
      <div class="w-px h-6 bg-muted-300 mx-2" />
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
        @click="emit('skip-backward')"
      >
        <Icon icon="material-symbols:fast-rewind" class="text-lg text-muted-700" />
      </button>
      
      <!-- Nothing plays while a render is reading the same files. -->
      <button
        class="p-2.5 rounded-lg bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="props.exporting"
        :title="props.exporting ? 'Playback is paused while the export runs' : undefined"
        @click="playing ? emit('pause') : emit('play')"
      >
        <Icon :icon="playing ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-xl text-card" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
        @click="emit('skip-forward')"
      >
        <Icon icon="material-symbols:fast-forward" class="text-lg text-muted-700" />
      </button>
    </div>

    <div class="flex items-center gap-4">
      <div class="text-sm font-mono text-muted-700">
        {{ formatTime(currentTime) }} <span class="text-muted-400">/</span> {{ formatTime(duration) }}
      </div>
      
      <div class="w-px h-6 bg-muted-300" />
      
      <div class="flex items-center gap-2">
        <button
          class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40"
          title="Zoom out"
          :disabled="zoom <= 0.25"
          @click="emit('zoom-out')"
        >
          <Icon icon="material-symbols:zoom-out" class="text-lg text-muted-700" />
        </button>
        
        <span class="text-xs font-medium text-muted-600 w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
        
        <button
          class="p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40"
          title="Zoom in"
          :disabled="zoom >= 3"
          @click="emit('zoom-in')"
        >
          <Icon icon="material-symbols:zoom-in" class="text-lg text-muted-700" />
        </button>
      </div>
      
      <div class="w-px h-6 bg-muted-300" />

      <!--
        A whole day dropped on the timeline is mostly dead air. This is the one
        button that turns it into a montage.
      -->
      <button
        class="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors flex items-center gap-1.5 text-sm font-medium text-muted-700 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Trim every clip to the moment its sound spikes"
        :disabled="props.trimmingHighlights || !props.clipCount"
        @click="emit('trim-to-highlights')"
      >
        <BaseSpinner v-if="trimmingHighlights" class="text-lg" />
        <Icon v-else icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="hidden xl:inline">
          {{ props.trimmingHighlights ? 'Listening…' : 'Trim to highlights' }}
        </span>
      </button>

      <div class="w-px h-6 bg-muted-300" />

      <button
        class="px-4 py-2 rounded-lg bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all font-medium shadow-lg shadow-orange-500/20 flex items-center gap-2 text-sm text-card disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
        :disabled="props.exporting"
        @click="emit('export')"
      >
        <div
          v-if="props.exporting && props.exportProgress !== undefined"
          class="absolute inset-0 bg-orange-700/30 transition-all duration-300"
          :style="{ width: `${props.exportProgress}%` }"
        />
        <Icon 
          :icon="props.exporting ? 'material-symbols:hourglass-top' : 'material-symbols:download'" 
          class="text-lg relative z-10"
          :class="{ 'animate-spin': props.exporting }"
        />
        <span class="relative z-10">
          {{ props.exporting ? `Exporting ${props.exportProgress || 0}%` : 'Export' }}
        </span>
      </button>
    </div>
  </div>
</template>
