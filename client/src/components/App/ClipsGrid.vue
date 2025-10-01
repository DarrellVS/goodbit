<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Clip } from '../../types/clip';
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
const hoveredClipId = ref<number | null>(null);

watch(hoveredClipId, (currentId) => {
  const targetVideo = document.getElementById(`preview-video-${currentId}`) as HTMLVideoElement;
  const otherVideos = document.querySelectorAll(`video:not(#preview-video-${currentId})`) as NodeListOf<HTMLVideoElement>;
  
  otherVideos.forEach(video => {
    video.pause();
    video.currentTime = 0;
  });
  
  targetVideo?.play().catch(() => {});
});
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
      @is-hovered="isHovered => hoveredClipId = isHovered ? clip.id : null"
      @updated="emit('clip-updated', $event)"
      @deleted="emit('clip-deleted')"
    />
  </section>
</template>
