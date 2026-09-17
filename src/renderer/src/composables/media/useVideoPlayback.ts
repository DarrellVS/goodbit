import { onMounted, onBeforeUnmount, type Ref, unref } from 'vue';

export function useVideoPlayback(selectedIndex: Ref<number>) {
  function togglePlayback(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;

    const activeInput = document.activeElement;
    if (activeInput?.tagName === 'INPUT' || activeInput?.tagName === 'TEXTAREA') {
      return;
    }

    event.preventDefault();

    const allVideos = document.querySelectorAll('.embla__slide video') as NodeListOf<HTMLVideoElement>;
    const currentIndex = unref(selectedIndex);
    const activeVideo = allVideos[currentIndex];

    if (!activeVideo) return;

    if (activeVideo.paused) {
      activeVideo.play().catch(() => {});
    } else {
      activeVideo.pause();
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', togglePlayback);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', togglePlayback);
  });

  return {
    togglePlayback,
  };
}
