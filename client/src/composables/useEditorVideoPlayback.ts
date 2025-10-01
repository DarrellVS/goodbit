import { ref, watch, onBeforeUnmount, readonly, type Ref, shallowRef } from 'vue';
import { EDITOR_CONSTANTS } from '../constants/editor';
import type { TimelineClip } from '../types/editor';

export function useEditorVideoPlayback(
  clips: Ref<readonly TimelineClip[]>,
  currentTime: Ref<number>,
  playing: Ref<boolean>,
  duration: Ref<number>
) {
  const videoElement = shallowRef<HTMLVideoElement | null>(null);
  const activeClip = shallowRef<TimelineClip | null>(null);
  
  let animationFrameId: number | null = null;
  let lastFrameTime = 0;
  let sortedClips: readonly TimelineClip[] = [];

  function updateSortedClips(): void {
    sortedClips = [...clips.value].sort((a, b) => a.startTime - b.startTime);
  }

  function findClipAtTime(time: number): TimelineClip | null {
    let left = 0;
    let right = sortedClips.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const clip = sortedClips[mid];
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      
      if (time >= clipStart && time < clipEnd) {
        return clip;
      } else if (time < clipStart) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    return null;
  }

  function loadClip(clip: TimelineClip): void {
    const video = videoElement.value;
    if (!video) return;

    const needsNewSrc = video.src !== clip.videoUrl;
    
    if (needsNewSrc) {
      video.src = clip.videoUrl;
    }
    
    activeClip.value = clip;
    video.currentTime = clip.trimStart;
    video.volume = clip.muted ? 0 : clip.volume;

    if (playing.value) {
      video.play().catch(console.error);
    }
  }

  function syncVideo(clip: TimelineClip, time: number): void {
    const video = videoElement.value;
    if (!video) return;

    const relativeTime = time - clip.startTime;
    const targetTime = clip.trimStart + relativeTime;

    if (Math.abs(video.currentTime - targetTime) > EDITOR_CONSTANTS.PLAYBACK_SYNC_THRESHOLD) {
      video.currentTime = targetTime;
    }

    if (Math.abs(video.volume - (clip.muted ? 0 : clip.volume)) > 0.01) {
      video.volume = clip.muted ? 0 : clip.volume;
    }

    if (video.paused && playing.value) {
      video.play().catch(console.error);
    }
  }

  function handlePlaybackFrame(timestamp: number): void {
    if (!playing.value) return;

    const delta = lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 0;
    lastFrameTime = timestamp;

    currentTime.value = Math.min(currentTime.value + delta, duration.value);

    if (currentTime.value >= duration.value) {
      playing.value = false;
      return;
    }

    const clip = findClipAtTime(currentTime.value);
    
    if (clip) {
      if (!activeClip.value || activeClip.value.id !== clip.id) {
        loadClip(clip);
      } else {
        syncVideo(clip, currentTime.value);
      }
    } else {
      if (activeClip.value) {
        activeClip.value = null;
        videoElement.value?.pause();
      }
    }

    animationFrameId = requestAnimationFrame(handlePlaybackFrame);
  }

  function handleSeek(): void {
    if (playing.value) return;

    const clip = findClipAtTime(currentTime.value);
    
    if (clip && (!activeClip.value || activeClip.value.id !== clip.id)) {
      loadClip(clip);
    } else if (clip) {
      syncVideo(clip, currentTime.value);
    } else {
      activeClip.value = null;
    }
  }

  function togglePlayback(): void {
    playing.value = !playing.value;
  }

  function skipForward(seconds: number = EDITOR_CONSTANTS.SKIP_SECONDS): void {
    currentTime.value = Math.min(currentTime.value + seconds, duration.value);
  }

  function skipBackward(seconds: number = EDITOR_CONSTANTS.SKIP_SECONDS): void {
    currentTime.value = Math.max(currentTime.value - seconds, 0);
  }

  watch(playing, (isPlaying) => {
    if (isPlaying) {
      lastFrameTime = 0;
      animationFrameId = requestAnimationFrame(handlePlaybackFrame);
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      videoElement.value?.pause();
    }
  });

  watch(currentTime, handleSeek);

  watch(clips, () => {
    updateSortedClips();
    if (clips.value.length && !playing.value) {
      handleSeek();
    }
  }, { immediate: true });

  watch(videoElement, (video, oldVideo) => {
    if (oldVideo) {
      oldVideo.pause();
      oldVideo.src = '';
    }
    if (video) {
      if (activeClip.value) {
        loadClip(activeClip.value);
      } else if (clips.value.length && !playing.value) {
        handleSeek();
      }
    }
  });

  onBeforeUnmount(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (videoElement.value) {
      videoElement.value.pause();
      videoElement.value.src = '';
    }
  });

  return {
    videoElement,
    activeClip,
    togglePlayback,
    skipForward,
    skipBackward,
  };
}
