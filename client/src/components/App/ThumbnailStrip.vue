<script setup lang="ts">
import type { Clip } from '../../types/clip';

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
      class="flex-shrink-0 w-[180px] cursor-pointer bg-transparent border-0 p-0 transition-all duration-300"
      :aria-current="selectedIndex === index"
      :aria-label="`View clip ${index + 1}: ${clip.displayName || clip.filename}`"
      @click="emit('select', index)"
    >
      <div 
        class="relative p-[3px] rounded-xl transition-all duration-300"
        :class="selectedIndex === index 
          ? 'bg-gradient-to-br from-orange-500 to-orange-600' 
          : 'bg-transparent hover:bg-gradient-to-br hover:from-orange-500/30 hover:to-orange-600/30'"
      >
        <div class="relative rounded-[10px] overflow-hidden aspect-[21/9] bg-card shadow-md transition-all duration-300 group">
          <img 
            :src="getThumbUrl(clip)" 
            :alt="clip.displayName || clip.filename"
            class="w-full h-full object-cover transition-transform duration-300"
            :class="{ 'group-hover:scale-105': true }"
          />
          <div 
            class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 pointer-events-none"
            :class="{ 'group-hover:opacity-100': true, 'opacity-100': selectedIndex === index }"
          />
        </div>
      </div>
      
      <div class="mt-2 text-center transition-all duration-300">
        <div 
          class="text-[11px] font-semibold uppercase tracking-wider mb-0.5 transition-colors duration-300 line-clamp-1"
          :class="selectedIndex === index ? 'text-orange-500' : 'text-muted-foreground group-hover:text-foreground'"
        >
          {{ clip.game }}
        </div>
        <div 
          class="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.6em] transition-colors duration-300"
          :class="selectedIndex === index ? 'text-orange-500 font-semibold' : 'text-foreground'"
        >
          {{ clip.displayName }}
        </div>
      </div>
    </button>
  </div>
</template>

<style scoped>
button:hover .group {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

button[aria-current="true"] .group {
  box-shadow: 0 12px 32px rgba(249, 115, 22, 0.4);
  transform: translateY(-4px) scale(1.02);
}
</style>
