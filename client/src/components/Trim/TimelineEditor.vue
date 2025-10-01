<template>
  <section class="bg-white/5 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-xl space-y-6">
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
      
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
        <Icon icon="material-symbols:timer" class="text-orange-500" />
        <span class="text-muted-400">Duration:</span>
        <span class="font-mono font-semibold text-orange-500">{{ duration }}s</span>
      </div>
    </header>
    
    <div class="relative h-32 rounded-xl overflow-visible border border-border/50">
      <img 
        :src="frameStripSource" 
        alt="Video frames" 
        class="w-full h-full object-cover pointer-events-none select-none rounded-xl" 
        draggable="false"
      />
      
      <RangeTrimSlider 
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
      </div>
    </div>
    
    <footer class="flex items-center justify-between pt-4 border-t border-border/30">
      <div class="flex items-center gap-6 text-sm">
        <TimeIndicator label="Start" :time="startTime" />
        <TimeIndicator label="End" :time="endTime" />
        <TimeIndicator label="Length" :time="length" variant="primary" />
      </div>
      
      <button 
        class="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
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
import RangeTrimSlider from '../RangeTrimSlider.vue';
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
}

defineProps<Props>();

interface Emits {
  (e: 'save'): void;
}

defineEmits<Emits>();

const model = defineModel<TimeRange>({ required: true });
</script>

