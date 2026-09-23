import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * How far through a tile's preview is, from 0 to 1, and the style that draws it.
 *
 * Lifted out of `Library/ClipCard.vue` so that every tile which previews a clip
 * shows where it is the same way. Storage Saver's tiles played and scrubbed
 * without it, which left a video moving under the pointer with nothing saying
 * how far in it was, on the one screen where that is what decides a delete.
 *
 * Read once per animation frame while something is playing, not from
 * `timeupdate`. That event fires about four times a second at irregular
 * intervals, so a bar driven by it steps rather than moves, and a CSS
 * transition laid over the top only smears the steps into each other. The
 * loop only runs while this tile's preview is actually playing, and only one
 * preview plays at a time, so this is one frame callback for the window.
 *
 * Scrubbing drives it too: while the pointer is on the scrub band the bar
 * follows the pointer rather than the video.
 */
export function usePreviewPlayhead(
  videoEl: Ref<HTMLVideoElement | null>,
  scrub: { isScrubbing: Ref<boolean>; scrubProgress: Ref<number> },
) {
  const played = ref(0);
  let frame: number | null = null;

  function readPlayhead(): void {
    const video = videoEl.value;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      played.value = Math.min(1, video.currentTime / video.duration);
    }
  }

  function follow(): void {
    readPlayhead();
    frame = requestAnimationFrame(follow);
  }

  function startFollowing(): void {
    if (frame === null) frame = requestAnimationFrame(follow);
  }

  function stopFollowing(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    // One last read, so a pause lands on the frame it paused at rather than
    // wherever the previous tick left the bar.
    readPlayhead();
  }

  /**
   * Scaled rather than resized.
   *
   * `width` is a layout property: changing it every frame makes the browser
   * reflow the tile sixty times a second. A transform is handed to the
   * compositor and costs nothing.
   */
  const fillStyle = computed(() => ({ transform: `scaleX(${played.value})` }));

  watch(scrub.isScrubbing, (scrubbing) => {
    if (scrubbing) {
      stopFollowing();
      played.value = scrub.scrubProgress.value;
    }
  });

  watch(scrub.scrubProgress, (fraction) => {
    if (scrub.isScrubbing.value) played.value = fraction;
  });

  const events: Array<[string, () => void]> = [
    ['play', startFollowing],
    ['playing', startFollowing],
    ['pause', stopFollowing],
    ['ended', stopFollowing],
    ['seeked', readPlayhead],
  ];

  watch(videoEl, (element, previous) => {
    for (const [name, handler] of events) previous?.removeEventListener(name, handler);
    if (element) {
      for (const [name, handler] of events) element.addEventListener(name, handler);
      if (!element.paused) startFollowing();
    }
  });

  onBeforeUnmount(() => {
    stopFollowing();
    for (const [name, handler] of events) videoEl.value?.removeEventListener(name, handler);
  });

  return { played, fillStyle };
}
