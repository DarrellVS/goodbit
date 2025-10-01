import { ref, watch } from 'vue';

export function useClipHover() {
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

  function handleClipHover(clipId: number, isHovered: boolean): void {
    hoveredClipId.value = isHovered ? clipId : null;
  }

  return {
    hoveredClipId,
    handleClipHover,
  };
}

