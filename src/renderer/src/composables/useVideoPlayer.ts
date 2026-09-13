import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

interface VideoPlayerOptions {
  videoElement: Ref<HTMLVideoElement | null>;
  range: Ref<[number, number]>;
  onMetadataLoaded?: () => void;
}

/**
 * Plays the trim range on loop, and reports where it is.
 *
 * The preview has no native controls of its own — the timeline below it is the
 * transport — so this is also where the playhead and the play/pause state that
 * page draws come from.
 */
export function useVideoPlayer({ videoElement, range, onMetadataLoaded }: VideoPlayerOptions) {
  const LOOP_THRESHOLD = 0.02;

  const currentTime = ref(0);
  const isPlaying = ref(false);

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

    currentTime.value = video.currentTime;
  };

  const handleLoadedMetadata = () => {
    const video = videoElement.value;
    if (!video) return;

    video.currentTime = range.value[0];
    currentTime.value = video.currentTime;
    onMetadataLoaded?.();
  };

  const handlePlay = () => {
    isPlaying.value = true;
  };
  const handlePause = () => {
    isPlaying.value = false;
  };

  /** Play from the start of the range if the playhead sits outside it. */
  function togglePlayback(): void {
    const video = videoElement.value;
    if (!video) return;

    const [startTime, endTime] = range.value;

    if (video.paused) {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  /** Move the playhead, clamped to the trim range — outside it there is nothing to see. */
  function seek(time: number): void {
    const video = videoElement.value;
    if (!video) return;

    const [startTime, endTime] = range.value;
    video.currentTime = Math.min(Math.max(time, startTime), endTime);
    currentTime.value = video.currentTime;
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.key !== ' ') return;

    // Space belongs to whatever the user is typing in.
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) {
      return;
    }

    event.preventDefault();
    togglePlayback();
  };

  watch(range, () => {
    const video = videoElement.value;
    if (video) {
      video.currentTime = range.value[0];
      currentTime.value = video.currentTime;
    }
  });

  // The element belongs to a child component, so it arrives a tick after this
  // composable is set up — and can be replaced if the source changes.
  watch(
    videoElement,
    (video, previous) => {
      if (previous) detach(previous);
      if (!video) return;

      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      if (video.readyState >= 1) handleLoadedMetadata();
    },
    { immediate: true },
  );

  window.addEventListener('keydown', handleKeydown, { capture: true });

  function detach(video: HTMLVideoElement): void {
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
  }

  onBeforeUnmount(() => {
    if (videoElement.value) detach(videoElement.value);
    window.removeEventListener('keydown', handleKeydown, { capture: true });
  });

  return {
    currentTime,
    isPlaying,
    togglePlayback,
    seek,
    handleTimeUpdate,
    handleLoadedMetadata,
  };
}
