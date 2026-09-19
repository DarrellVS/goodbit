import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import { correctPlayhead, playFrom } from './playheadRules';

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
  const isLocked = (): boolean => locked?.value === true;

  const currentTime = ref(0);
  const isPlaying = ref(false);

  /*
   * The loop, and the one place the playhead is moved on the player's own
   * events.
   *
   * `playheadRules.ts` holds the decision, because the decision is where this
   * went wrong: a seek lands on the frame *containing* the time asked for, so
   * seeking to the start of the range leaves `currentTime` a frame short of
   * it, a bare `currentTime < startTime` says "before the range", and the
   * correction seeks to the same place and lands short again. Every
   * `timeupdate` re-seeked, playback never crossed the start, and pressing
   * Space read as a player that had stopped working.
   */
  const handleTimeUpdate = () => {
    const video = videoElement.value;
    if (!video) return;

    const correction = correctPlayhead({
      time: video.currentTime,
      range: range.value,
      paused: video.paused,
      seeking: video.seeking,
      locked: isLocked(),
    });

    if (correction) {
      video.currentTime = correction.seekTo;
      if (correction.play) video.play().catch(() => {});
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

  /*
   * Where the playhead is, read once per animation frame while something is
   * playing.
   *
   * `timeupdate` fires about four times a second at irregular intervals, so a
   * playhead driven by it steps across the strip rather than moving, and a CSS
   * transition over the top only smears the steps into each other. The loop
   * runs only while the preview is actually playing, and there is one preview.
   *
   * The event is still where the *correction* happens: reading the clock and
   * deciding whether the clock is somewhere allowed are separate jobs, and
   * seeking from inside a frame callback would fight every seek in flight.
   */
  let frame: number | null = null;

  function readPlayhead(): void {
    const video = videoElement.value;
    if (video) currentTime.value = video.currentTime;
  }

  function follow(): void {
    readPlayhead();
    frame = requestAnimationFrame(follow);
  }

  function stopFollowing(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    // One last read, so a pause lands on the frame it paused at rather than
    // wherever the previous tick left it.
    readPlayhead();
  }

  const handlePlay = () => {
    isPlaying.value = true;
    if (frame === null) frame = requestAnimationFrame(follow);
  };
  const handlePause = () => {
    isPlaying.value = false;
    stopFollowing();
  };

  /** Play from the start of the range if the playhead sits outside it. */
  function togglePlayback(): void {
    const video = videoElement.value;
    if (!video || isLocked()) return;

    if (video.paused) {
      // Same slop as the loop: with the head resting a frame short of the
      // start, Space means play, not seek to a place it will land short of
      // again.
      const from = playFrom(video.currentTime, range.value);
      if (from !== null) video.currentTime = from;
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
      video.addEventListener('ended', handlePause);

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
    video.removeEventListener('ended', handlePause);
  }

  onBeforeUnmount(() => {
    stopFollowing();
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
