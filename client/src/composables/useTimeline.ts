import { ref, computed, watch } from 'vue';
import type { TimelineClip, TimelineState, AudioSegment } from '../types/editor';
import { v4 as uuidv4 } from 'uuid';

export function useTimeline() {
  const clips = ref<TimelineClip[]>([]);
  const audioSegments = ref<AudioSegment[]>([]);
  const currentTime = ref(0);
  const zoom = ref(1);
  const playing = ref(false);

  const duration = computed(() => {
    if (!clips.value.length) return 0;
    return clips.value.reduce((max, clip) => {
      const clipEnd = clip.startTime + clip.duration;
      return Math.max(max, clipEnd);
    }, 0);
  });

  function addClip(
    clipId: number,
    videoUrl: string,
    thumbnailUrl: string,
    originalDuration: number
  ): void {
    const newClip: TimelineClip = {
      id: uuidv4(),
      clipId,
      startTime: duration.value,
      duration: originalDuration,
      trimStart: 0,
      trimEnd: originalDuration,
      volume: 1,
      muted: false,
      videoUrl,
      thumbnailUrl,
      originalDuration,
    };
    clips.value.push(newClip);
  }

  function removeClip(clipId: string): void {
    const index = clips.value.findIndex(c => c.id === clipId);
    if (index === -1) return;
    
    clips.value.splice(index, 1);
    reorderClips();
  }

  function updateClip(clipId: string, updates: Partial<TimelineClip>): void {
    const clip = clips.value.find(c => c.id === clipId);
    if (!clip) return;
    
    Object.assign(clip, updates);
  }

  function moveClip(clipId: string, newStartTime: number): void {
    const clip = clips.value.find(c => c.id === clipId);
    if (!clip) return;
    
    clip.startTime = Math.max(0, newStartTime);
    reorderClips();
  }

  function reorderClips(): void {
    clips.value.sort((a, b) => a.startTime - b.startTime);
    
    for (let i = 1; i < clips.value.length; i++) {
      const prevClip = clips.value[i - 1];
      const currentClip = clips.value[i];
      const prevEnd = prevClip.startTime + prevClip.duration;
      
      if (currentClip.startTime < prevEnd) {
        currentClip.startTime = prevEnd;
      }
    }
  }

  function trimClip(clipId: string, trimStart: number, trimEnd: number): void {
    const clip = clips.value.find(c => c.id === clipId);
    if (!clip) return;
    
    clip.trimStart = Math.max(0, trimStart);
    clip.trimEnd = Math.min(clip.originalDuration, trimEnd);
    clip.duration = clip.trimEnd - clip.trimStart;
  }

  function muteSegment(startTime: number, endTime: number): void {
    audioSegments.value.push({
      id: uuidv4(),
      startTime,
      endTime,
      muted: true,
    });
  }

  function removeAudioSegment(segmentId: string): void {
    const index = audioSegments.value.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      audioSegments.value.splice(index, 1);
    }
  }

  function seekTo(time: number): void {
    currentTime.value = Math.max(0, Math.min(time, duration.value));
  }

  function play(): void {
    playing.value = true;
  }

  function pause(): void {
    playing.value = false;
  }

  function reset(): void {
    clips.value = [];
    audioSegments.value = [];
    currentTime.value = 0;
    playing.value = false;
  }

  return {
    clips,
    audioSegments,
    currentTime,
    duration,
    zoom,
    playing,
    addClip,
    removeClip,
    updateClip,
    moveClip,
    trimClip,
    muteSegment,
    removeAudioSegment,
    seekTo,
    play,
    pause,
    reset,
  };
}


