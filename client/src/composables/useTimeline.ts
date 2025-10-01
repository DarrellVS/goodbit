import { ref, computed, readonly, shallowRef } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { EDITOR_CONSTANTS } from '../constants/editor';
import type { TimelineClip } from '../types/editor';

export function useTimeline() {
  const clips = shallowRef<TimelineClip[]>([]);
  const clipMap = new Map<string, TimelineClip>();
  const currentTime = ref(0);
  const zoom = ref(1);
  const playing = ref(false);

  const duration = computed(() =>
    clips.value.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0)
  );

  function addClip(
    clipId: number,
    videoUrl: string,
    thumbnailUrl: string,
    originalDuration: number
  ): void {
    const clip: TimelineClip = {
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
    
    clips.value = [...clips.value, clip];
    clipMap.set(clip.id, clip);
  }

  function removeClip(clipId: string): void {
    const clip = clipMap.get(clipId);
    if (!clip) return;
    
    const index = clips.value.indexOf(clip);
    const newClips = [...clips.value];
    newClips.splice(index, 1);
    
    for (let i = index; i < newClips.length; i++) {
      newClips[i] = { ...newClips[i], startTime: newClips[i].startTime - clip.duration };
    }
    
    clips.value = newClips;
    clipMap.delete(clipId);
  }

  function updateClipProperties(
    clipId: string,
    updates: Partial<Pick<TimelineClip, 'volume' | 'muted'>>
  ): void {
    const clip = clipMap.get(clipId);
    if (!clip) return;
    
    const updated = { ...clip };
    if (updates.volume !== undefined) updated.volume = Math.max(0, Math.min(1, updates.volume));
    if (updates.muted !== undefined) updated.muted = updates.muted;
    
    const index = clips.value.indexOf(clip);
    const newClips = [...clips.value];
    newClips[index] = updated;
    clips.value = newClips;
    clipMap.set(clipId, updated);
  }

  function moveClip(clipId: string, newStartTime: number): void {
    const clip = clipMap.get(clipId);
    if (!clip) return;
    
    const clampedStart = Math.max(0, newStartTime);
    const updated = { ...clip, startTime: clampedStart };
    
    const newClips = clips.value.filter(c => c.id !== clipId);
    const insertIndex = newClips.findIndex(c => c.startTime > clampedStart);
    
    if (insertIndex === -1) {
      newClips.push(updated);
    } else {
      newClips.splice(insertIndex, 0, updated);
    }
    
    for (let i = 1; i < newClips.length; i++) {
      const prevEnd = newClips[i - 1].startTime + newClips[i - 1].duration;
      if (newClips[i].startTime < prevEnd) {
        newClips[i] = { ...newClips[i], startTime: prevEnd };
      }
    }
    
    clips.value = newClips;
    clipMap.set(clipId, updated);
  }

  function trimClip(clipId: string, trimStart: number, trimEnd: number): void {
    const clip = clipMap.get(clipId);
    if (!clip) return;
    
    const clampedStart = Math.max(0, Math.min(trimStart, clip.originalDuration));
    const clampedEnd = Math.max(clampedStart + EDITOR_CONSTANTS.MIN_CLIP_DURATION, Math.min(trimEnd, clip.originalDuration));
    const newDuration = clampedEnd - clampedStart;
    const deltaTime = newDuration - clip.duration;
    
    const index = clips.value.indexOf(clip);
    const newClips = clips.value.map((c, i) => {
      if (i === index) {
        return { ...c, trimStart: clampedStart, trimEnd: clampedEnd, duration: newDuration };
      }
      if (i > index) {
        return { ...c, startTime: c.startTime + deltaTime };
      }
      return c;
    });
    
    clips.value = newClips;
    clipMap.set(clipId, newClips[index]);
  }

  function seekTo(time: number): void {
    currentTime.value = Math.max(0, Math.min(time, duration.value));
  }

  function setZoom(value: number): void {
    zoom.value = Math.max(EDITOR_CONSTANTS.ZOOM.MIN, Math.min(EDITOR_CONSTANTS.ZOOM.MAX, value));
  }

  function play(): void {
    if (currentTime.value >= duration.value) {
      currentTime.value = 0;
    }
    playing.value = true;
  }

  function pause(): void {
    playing.value = false;
  }

  function reset(): void {
    clips.value = [];
    clipMap.clear();
    currentTime.value = 0;
    playing.value = false;
    zoom.value = 1;
  }

  return {
    clips: readonly(clips),
    currentTime,
    duration,
    zoom,
    playing,
    addClip,
    removeClip,
    updateClipProperties,
    moveClip,
    trimClip,
    seekTo,
    setZoom,
    play,
    pause,
    reset,
  };
}
