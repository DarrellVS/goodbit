import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

interface VideoPlayerOptions {
  videoElement: Ref<HTMLVideoElement | null>;
  range: Ref<[number, number]>;
  onMetadataLoaded?: () => void;
  /**
   * Set while something else is writing this file.
   *
   * A trim ends by renaming the new cut over the old one, and Windows refuses
   * to rename a file a player is holding open. Playing the clip you are in the
   * middle of replacing is asking for a resource busy error at the last step,
   * with the cut already made.
   */
  locked?: Ref<boolean>;
}

/**
 * Plays the trim range on loop, and reports where it is.
 *
 * The preview has no native controls of its own. The timeline below it is the
 * transport, so this is also where the playhead and the play/pause state that
 * page draws come from.
 */
export function useVideoPlayer({ videoElement, range, onMetadataLoaded, locked }: VideoPlayerOptions) {
  const LOOP_THRESHOLD = 0.02;

  const isLocked = (): boolean => locked?.value === true;

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
      // The loop is what makes a lock more than a pause: pausing alone lasts
      // until the range ends and this starts it again.
      if (video.paused && !isLocked()) {
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
    if (!video || isLocked()) return;

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

  // Stop the moment the file is claimed, not at the end of the range.
  if (locked) {
    watch(locked, (busy) => {
      if (busy) videoElement.value?.pause();
    });
  }

  /** Move the playhead, clamped to the trim range, outside it there is nothing to see. */
  function seek(time: number): void {
    const video = videoElement.value;
    if (!video) return;

    const [startTime, endTime] = range.value;
    video.currentTime = Math.min(Math.max(time, startTime), endTime);
    currentTime.value = video.currentTime;
  }

  /**
   * Move the playhead anywhere in the clip.
   *
   * Scrubbing the frame strip is how you decide *where* the trim should go, so
   * it cannot be confined to where the trim currently is. Playback still loops
   * the range, so pressing play after scrubbing outside it returns you to it.
   */
  function scrubTo(time: number): void {
    const video = videoElement.value;
    if (!video) return;

    const limit = Number.isFinite(video.duration) ? video.duration : time;
    video.currentTime = Math.min(Math.max(time, 0), limit);
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
  // composable is set up, and can be replaced if the source changes.
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
    scrubTo,
    handleTimeUpdate,
    handleLoadedMetadata,
  };
}
