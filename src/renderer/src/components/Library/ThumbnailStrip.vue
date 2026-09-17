<script setup lang="ts">
import type { Clip } from '@renderer/types/clip';

interface Props {
  clips: Clip[];
  selectedIndex: number;
  getThumbUrl: (clip: Clip) => string;
}

interface Emits {
  (e: 'select', index: number): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex gap-3">
    <button
      v-for="(clip, index) in clips"
      :key="`thumb-${clip.id}`"
      class="shrink-0 w-[180px] cursor-pointer bg-transparent border-0 p-0 transition-all duration-300"
      :aria-current="selectedIndex === index"
      :aria-label="`View clip ${index + 1}: ${clip.displayName || clip.filename}`"
      @click="emit('select', index)"
    >
      <div 
        class="relative p-[3px] rounded-xl transition-all duration-300"
        :class="selectedIndex === index 
          ? 'bg-linear-to-br from-accent to-accent-hover' 
          : 'bg-transparent hover:bg-linear-to-br hover:from-accent/30 hover:to-accent-hover/30'"
      >
        <div class="relative rounded-[10px] overflow-hidden aspect-21/9 bg-card shadow-md transition-all duration-300 group">
          <img 
            :src="getThumbUrl(clip)" 
            :alt="clip.displayName || clip.filename"
            class="w-full h-full object-cover transition-transform duration-300"
            :class="{ 'group-hover:scale-105': true }"
          />
          <div 
            class="absolute inset-0 bg-linear-to-t from-video-bed/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 pointer-events-none"
            :class="{ 'group-hover:opacity-100': true, 'opacity-100': selectedIndex === index }"
          />
        </div>
      </div>
      
      <div class="mt-2 text-center transition-all duration-300">
        <div 
          class="text-[11px] font-semibold uppercase tracking-wider mb-0.5 transition-colors duration-300 line-clamp-1"
          :class="selectedIndex === index ? 'text-accent-ink' : 'text-muted-foreground group-hover:text-foreground'"
        >
          {{ clip.game }}
        </div>
        <div 
          class="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.6em] transition-colors duration-300"
          :class="selectedIndex === index ? 'text-accent-ink font-semibold' : 'text-foreground'"
        >
          {{ clip.displayName }}
        </div>
      </div>
    </button>
  </div>
</template>

<style scoped>
/*
 * Lift, do not grow.
 *
 * The current thumbnail used to scale to 1.02, which changes its measured
 * width and pushes the strip's own scroll position around by a pixel or two
 * every time the selection moves. A translate says the same thing and costs
 * no layout.
 */
button:hover .group {
  transform: translateY(-2px);
}

button[aria-current="true"] .group {
  outline: 2px solid hsl(var(--accent));
  outline-offset: 1px;
  transform: translateY(-2px);
}
</style>
