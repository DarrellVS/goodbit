<script setup lang="ts">
import { watch } from 'vue';
import type { Clip } from '../../types/clip';
import AppClipCard from './AppClipCard.vue';

interface Props {
  clips: Clip[];
  hoveredClipId: number | null;
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
}

interface Emits {
  (e: 'update:hovered-clip-id', id: number | null): void;
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function handleCardHovered(isHovered: boolean, clipId: number): void {
  emit('update:hovered-clip-id', isHovered ? clipId : null);
}

watch(() => props.hoveredClipId, (currentId) => {
  if (!currentId) return;
  
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
      @is-hovered="isHovered => handleCardHovered(isHovered, clip.id)"
      @updated="emit('clip-updated', $event)"
      @deleted="emit('clip-deleted')"
    />
  </section>
</template>
