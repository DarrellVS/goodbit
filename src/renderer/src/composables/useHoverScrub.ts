import { ref, type Ref } from 'vue';

// Fraction of the video's height, measured from the bottom, that acts as the
// scrub strip. Above it the pointer does nothing.
const SCRUB_ZONE = 1 / 3;

/**
 * The native controls sit along the bottom of the video, and a pointer there
 * is heading for play, volume or fullscreen — not scrubbing. The strip stops
 * this far above the bottom edge so it never covers them, and keeps at least
 * `SCRUB_MIN_BAND_PX` of height on a card too short for a third to leave room.
 */
export const SCRUB_CONTROLS_PX = 56;
export const SCRUB_MIN_BAND_PX = 36;

/** Where the strip sits above the video's bottom edge, given its height. */
export function scrubBand(heightPx: number): { bottomPx: number; heightPx: number } {
  return {
    bottomPx: SCRUB_CONTROLS_PX,
    heightPx: Math.max(heightPx * SCRUB_ZONE - SCRUB_CONTROLS_PX, SCRUB_MIN_BAND_PX),
  };
}

// Don't re-seek for sub-frame movements — Chrome stutters when currentTime is
// hammered on every mousemove.
const SEEK_EPSILON = 0.03;

export function useHoverScrub(videoEl: Ref<HTMLVideoElement | null>, enabled: Ref<boolean>) {
  const isScrubbing = ref(false);
  const scrubProgress = ref(0);
  const scrubTime = ref(0);

  let rafId: number | null = null;
  let pendingFraction: number | null = null;
  let wasPlaying = false;
  let metadataListener: (() => void) | null = null;

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // preload="none" means there is no duration yet. Bump the hint and load once,
  // then replay the pending seek when the metadata lands.
  function ensureMetadata(video: HTMLVideoElement): boolean {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) return true;

    if (video.preload === 'none') video.preload = 'metadata';
    if (video.readyState === 0 && !metadataListener) {
      metadataListener = () => {
        metadataListener = null;
        scheduleSeek();
      };
      video.addEventListener('loadedmetadata', metadataListener, { once: true });
      video.load();
    }
    return false;
  }

  function applySeek(): void {
    rafId = null;
    const video = videoEl.value;
    if (!video || pendingFraction === null) return;
    if (!ensureMetadata(video)) return;

    const target = pendingFraction * video.duration;
    scrubTime.value = target;
    if (Math.abs(video.currentTime - target) > SEEK_EPSILON) {
      video.currentTime = target;
    }
  }

  function scheduleSeek(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(applySeek);
  }

  function stopScrubbing(resume: boolean): void {
    if (!isScrubbing.value) return;
    isScrubbing.value = false;
    pendingFraction = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (resume && wasPlaying) {
      videoEl.value?.play().catch(() => {});
    }
    wasPlaying = false;
  }

  /** Attach to the element that wraps the <video>; it defines the scrub geometry. */
  function handleMouseMove(event: MouseEvent): void {
    if (!enabled.value) return;
    // A fullscreen video still bubbles its mouse moves to the card it lives in,
    // whose rectangle is now meaningless — every move became a seek to
    // somewhere. Fullscreen is for watching; the strip is off there.
    if (document.fullscreenElement) {
      stopScrubbing(false);
      return;
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.height === 0 || bounds.width === 0) return;

    const fromBottom = bounds.bottom - event.clientY;
    const band = scrubBand(bounds.height);
    if (fromBottom < band.bottomPx || fromBottom > band.bottomPx + band.heightPx) {
      stopScrubbing(true);
      return;
    }

    const video = videoEl.value;
    if (!video) return;

    if (!isScrubbing.value) {
      isScrubbing.value = true;
      // Freeze playback so the frame under the cursor is the frame you see.
      wasPlaying = !video.paused && !video.ended;
      if (wasPlaying) video.pause();
    }

    const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    pendingFraction = fraction;
    scrubProgress.value = fraction;
    scheduleSeek();
  }

  function handleMouseLeave(): void {
    stopScrubbing(true);
  }

  return {
    isScrubbing,
    scrubProgress,
    scrubTime,
    formatTime,
    handleMouseMove,
    handleMouseLeave,
  };
}
