import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import type { TimelineClip } from '../types/editor';

export function useEditorPlayback(
  clips: Ref<TimelineClip[]>,
  currentTime: Ref<number>,
  playing: Ref<boolean>,
  duration: Ref<number>
) {
  const videoElement = ref<HTMLVideoElement | null>(null);
  const activeClipId = ref<string | null>(null);
  let animationFrameId: number | null = null;
  let lastUpdateTime = 0;

  const activeClip = ref<TimelineClip | null>(null);

  function findActiveClip(time: number): TimelineClip | null {
    return clips.value.find(clip => {
      const start = clip.startTime;
      const end = clip.startTime + clip.duration;
      return time >= start && time < end;
    }) || null;
  }

  function updatePlayback(): void {
    if (!playing.value) return;

    const now = performance.now();
    const delta = (now - lastUpdateTime) / 1000;
    lastUpdateTime = now;

    currentTime.value += delta;

    if (currentTime.value >= duration.value) {
      currentTime.value = duration.value;
      playing.value = false;
      return;
    }

    const clip = findActiveClip(currentTime.value);
    
    if (clip && clip.id !== activeClipId.value) {
      activeClipId.value = clip.id;
      activeClip.value = clip;
      loadClipIntoVideo(clip);
    }

    if (clip && videoElement.value) {
      const relativeTime = currentTime.value - clip.startTime;
      const videoTime = clip.trimStart + relativeTime;
      
      if (relativeTime >= clip.duration) {
        const nextClip = findActiveClip(currentTime.value);
        if (nextClip && nextClip.id !== clip.id) {
          activeClipId.value = nextClip.id;
          activeClip.value = nextClip;
          loadClipIntoVideo(nextClip);
        } else {
          playing.value = false;
          if (videoElement.value) {
            videoElement.value.pause();
          }
          return;
        }
      }
      
      if (Math.abs(videoElement.value.currentTime - videoTime) > 0.1) {
        videoElement.value.currentTime = videoTime;
      }

      if (videoElement.value.paused) {
        videoElement.value.volume = clip.muted ? 0 : clip.volume;
        videoElement.value.play().catch(() => {});
      }
    }

    animationFrameId = requestAnimationFrame(updatePlayback);
  }

  function loadClipIntoVideo(clip: TimelineClip): void {
    if (!videoElement.value) return;

    videoElement.value.src = clip.videoUrl;
    videoElement.value.currentTime = clip.trimStart;
    videoElement.value.volume = clip.muted ? 0 : clip.volume;
    
    if (playing.value) {
      videoElement.value.play().catch(() => {});
    }
  }

  watch(() => activeClip.value, (clip) => {
    if (!clip || !videoElement.value) return;
    videoElement.value.volume = clip.muted ? 0 : clip.volume;
  }, { deep: true });

  watch(playing, (isPlaying) => {
    if (isPlaying) {
      lastUpdateTime = performance.now();
      updatePlayback();
    } else {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (videoElement.value) {
        videoElement.value.pause();
      }
    }
  });

  function updateCurrentClip(time: number): void {
    if (playing.value) return;

    const clip = findActiveClip(time);
    if (clip) {
      if (clip.id !== activeClipId.value) {
        activeClipId.value = clip.id;
        activeClip.value = clip;
        
        setTimeout(() => {
          loadClipIntoVideo(clip);
        }, 0);
      } else if (videoElement.value) {
        const relativeTime = time - clip.startTime;
        const videoTime = clip.trimStart + relativeTime;
        videoElement.value.currentTime = videoTime;
      }
    } else {
      activeClip.value = null;
      activeClipId.value = null;
    }
  }

  watch(currentTime, updateCurrentClip);

  watch(clips, () => {
    if (clips.value.length > 0 && currentTime.value === 0) {
      updateCurrentClip(0);
    } else {
      updateCurrentClip(currentTime.value);
    }
  }, { deep: true });

  watch(videoElement, (element) => {
    if (element && activeClip.value && !element.src) {
      loadClipIntoVideo(activeClip.value);
    }
  });

  function togglePlayback(): void {
    if (playing.value) {
      playing.value = false;
    } else {
      if (currentTime.value >= duration.value) {
        currentTime.value = 0;
      }
      playing.value = true;
    }
  }

  function skipForward(seconds: number = 5): void {
    currentTime.value = Math.min(currentTime.value + seconds, duration.value);
  }

  function skipBackward(seconds: number = 5): void {
    currentTime.value = Math.max(currentTime.value - seconds, 0);
  }

  onBeforeUnmount(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
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

