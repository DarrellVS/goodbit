<template>
  <section class="bg-card/5 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-xl space-y-6">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-orange-500/10">
          <Icon icon="material-symbols:timeline" class="text-orange-500 text-xl" />
        </div>
        <div>
          <h2 class="font-semibold text-lg">Timeline</h2>
          <p class="text-xs text-muted-400">Drag the handles to trim your clip</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5">
        <Icon icon="material-symbols:timer" class="text-orange-500" />
        <span class="text-muted-400">Duration:</span>
        <span class="font-mono font-semibold text-orange-500">{{ duration }}s</span>
      </div>
    </header>
    
    <div class="relative h-32 rounded-xl overflow-visible border border-border">
      <img 
        :src="frameStripSource" 
        alt="Video frames" 
        class="w-full h-full object-cover pointer-events-none select-none rounded-xl" 
        draggable="false"
      />
      
      <BaseRangeSlider 
        v-model="model" 
        :max="maxDuration" 
        :step="0.1" 
        :min-steps-between-thumbs="1" 
      />
      
      <div class="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 bg-gradient-to-r from-black/60 to-black/40 backdrop-blur-[2px]"
          :style="{ width: startPercentage + '%' }"
        />
        <div
          class="absolute inset-y-0 right-0 bg-gradient-to-l from-black/60 to-black/40 backdrop-blur-[2px]"
          :style="{ width: (100 - endPercentage) + '%' }"
        />

        <!--
          Where the preview is. Above the shading so it stays visible over the
          trimmed-away parts, and inert so it never fights the range handles.
        -->
        <div
          class="absolute inset-y-0 w-0.5 -ml-px bg-white shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          :style="{ left: playheadPercentage + '%' }"
        >
          <div class="absolute -top-px left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow" />
        </div>
      </div>
    </div>

    <!-- The preview has no controls of its own, so the transport lives here. -->
    <div class="flex items-center gap-3">
      <button
        class="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 transition-colors flex-shrink-0"
        :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="$emit('toggle-playback')"
      >
        <Icon :icon="isPlaying ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-2xl" />
      </button>

      <span class="font-mono text-sm text-muted-400">
        <span class="text-foreground">{{ playhead }}s</span>
        <span class="mx-1">/</span>
        <span>{{ duration }}s</span>
      </span>

      <span class="text-xs text-muted-400 ml-auto">Space plays the trimmed range on loop</span>
    </div>

    <footer class="flex items-center justify-between pt-4 border-t border-border">
      <div class="flex items-center gap-6 text-sm">
        <TimeIndicator label="Start" :time="startTime" />
        <TimeIndicator label="End" :time="endTime" />
        <TimeIndicator label="Length" :time="length" variant="primary" />
      </div>
      
      <button 
        class="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-card shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
        :disabled="!isValid || isSaving"
        @click="$emit('save')"
      >
        <Icon 
          :icon="isSaving ? 'material-symbols:progress-activity' : 'material-symbols:save'" 
          class="text-lg"
          :class="{ 'animate-spin': isSaving }"
        />
        <span>{{ isSaving ? 'Trimming...' : 'Save Trimmed Clip' }}</span>
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import BaseRangeSlider from '../Base/BaseRangeSlider.vue';
import TimeIndicator from './TimeIndicator.vue';
import type { TimeRange } from '../../composables/useTrimRange';

interface Props {
  maxDuration: number;
  duration: string;
  startTime: string;
  endTime: string;
  length: string;
  startPercentage: number;
  endPercentage: number;
  frameStripSource: string;
  isValid: boolean;
  isSaving: boolean;
  /** Where the preview is, as a percentage of the whole clip. */
  playheadPercentage: number;
  /** The same position, formatted. */
  playhead: string;
  isPlaying: boolean;
}

defineProps<Props>();

interface Emits {
  (e: 'save'): void;
  (e: 'toggle-playback'): void;
}

defineEmits<Emits>();

const model = defineModel<TimeRange>({ required: true });
</script>

