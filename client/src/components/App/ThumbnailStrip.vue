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
  <div class="embla-thumbs__container">
    <button
      v-for="(clip, index) in clips"
      :key="`thumb-${clip.id}`"
      class="embla-thumbs__slide group"
      :class="{ 'is-selected': selectedIndex === index }"
      :aria-current="selectedIndex === index"
      :aria-label="`View clip ${index + 1}: ${clip.displayName || clip.filename}`"
      @click="emit('select', index)"
    >
      <div class="thumb rounded-xl overflow-hidden transition-all">
        <img 
          :src="getThumbUrl(clip)" 
          :alt="clip.displayName || clip.filename"
          class="w-full h-24 object-cover"
        />
      </div>
      <div class="text-sm mt-2 text-muted-300 text-center line-clamp-1">
        {{ clip.game }}
      </div>
    </button>
  </div>
</template>

<style scoped>
.embla-thumbs__container {
  display: flex;
  gap: 16px;
}

.embla-thumbs__slide {
  flex: 0 0 auto;
  width: 160px;
  cursor: pointer;
  background: transparent;
  border: 0;
  padding: 0;
}

.embla-thumbs__slide.is-selected .thumb {
  box-shadow: 0 8px 8px rgba(0, 0, 0, 0.2);
  transform: scale(1.05);
}

.thumb {
  transition: all 300ms ease;
}
</style>

