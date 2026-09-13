import { watch, onMounted, onBeforeUnmount, type Ref } from 'vue';

interface VideoPlayerOptions {
  videoElement: Ref<HTMLVideoElement | null>;
  range: Ref<[number, number]>;
  onMetadataLoaded?: () => void;
}

export function useVideoPlayer({ videoElement, range, onMetadataLoaded }: VideoPlayerOptions) {
  const LOOP_THRESHOLD = 0.02;
  
  const handleTimeUpdate = () => {
    const video = videoElement.value;
    if (!video) return;
    
    const [startTime, endTime] = range.value;
    
    if (video.currentTime < startTime) {
      video.currentTime = startTime;
    }
    
    if (video.currentTime >= endTime - LOOP_THRESHOLD) {
      video.currentTime = startTime;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  };
  
  const handleLoadedMetadata = () => {
    const video = videoElement.value;
    if (!video) return;
    
    video.currentTime = range.value[0];
    onMetadataLoaded?.();
  };
  
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    
    const video = videoElement.value;
    if (!video) return;
    
    event.preventDefault();
    
    const [startTime, endTime] = range.value;
    
    if (video.paused) {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };
  
  watch(range, () => {
    const video = videoElement.value;
    if (video) {
      video.currentTime = range.value[0];
    }
  });
  
  onMounted(() => {
    const video = videoElement.value;
    if (!video) return;
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    window.addEventListener('keydown', handleKeydown, { capture: true });
  });
  
  onBeforeUnmount(() => {
    const video = videoElement.value;
    if (!video) return;
    
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    window.removeEventListener('keydown', handleKeydown, { capture: true } as any);
  });
  
  return {
    handleTimeUpdate,
    handleLoadedMetadata,
    handleKeydown,
  };
}

