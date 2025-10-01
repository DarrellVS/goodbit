<script setup lang="ts">
import type { Clip } from '../../types/clip';
import { useClipHover } from '../../composables/useClipHover';
import AppClipCard from './AppClipCard.vue';

interface Props {
  clips: Clip[];
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { handleClipHover } = useClipHover();
</script>

<template>
  <section 
    class="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4"
    aria-label="Video clips grid"
  >
    <AppClipCard
      v-for="clip in clips"
      :key="clip.id"
      :clip="clip"
      :poster-url="getThumbUrl(clip)"
      :video-url="getVideoUrl(clip)"
      @is-hovered="isHovered => handleClipHover(clip.id, isHovered)"
      @updated="emit('clip-updated', $event)"
      @deleted="emit('clip-deleted')"
    />
  </section>
</template>
