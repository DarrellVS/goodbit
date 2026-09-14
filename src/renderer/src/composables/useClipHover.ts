import { ref, watch } from 'vue';
import { useConfiguration } from './useConfiguration';

/**
 * When the pointer last actually moved.
 *
 * `mouseenter` fires whenever an element arrives under the pointer, which
 * includes the list re-drawing beneath a hand that has not moved at all. A clip
 * would then start playing, with sound if the setting allowed it, because a
 * search result had re-rendered. One tester had a clip start talking at one in
 * the morning while they were typing.
 *
 * A real hover is preceded by real movement, so that is what this records. One
 * listener for the whole app, registered once.
 */
let lastPointerMoveAt = 0;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    () => {
      lastPointerMoveAt = performance.now();
    },
    { passive: true, capture: true },
  );
}

/** Long enough to cover the gap between moving and the tile noticing. */
const DELIBERATE_HOVER_MS = 500;

export function useClipHover() {
  const hoveredClipId = ref<number | null>(null);
  const config = useConfiguration();

  watch(hoveredClipId, (currentId) => {
    if (!config.public.value.autoPlayOnHover) return;

    const targetVideo = document.getElementById(`preview-video-${currentId}`) as HTMLVideoElement;
    const otherVideos = document.querySelectorAll(`video:not(#preview-video-${currentId})`) as NodeListOf<HTMLVideoElement>;

    otherVideos.forEach(video => {
      video.pause();
      video.currentTime = 0;
    });

    targetVideo?.play().catch(() => {});
  });

  function handleClipHover(clipId: number, isHovered: boolean): void {
    // Leaving always counts: a tile that scrolls away should stop.
    if (!isHovered) {
      hoveredClipId.value = null;
      return;
    }

    if (performance.now() - lastPointerMoveAt > DELIBERATE_HOVER_MS) return;
    hoveredClipId.value = clipId;
  }

  return {
    hoveredClipId,
    handleClipHover,
  };
}

