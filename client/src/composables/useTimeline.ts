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
    const oldDuration = clip.duration;
    const durationChange = newDuration - oldDuration;
    const headDelta = clampedStart - clip.trimStart;

    if (durationChange === 0 && headDelta === 0) return;

    const index = clips.value.indexOf(clip);
    const newClips = [...clips.value];

    // Trimming the head slides the clip's left edge and pins its right edge, so
    // the handle tracks the cursor. Pinning the left edge instead (the obvious
    // reading of a gapless timeline) makes the *opposite* edge move, which
    // reads as dragging the wrong thing. The gap this opens before the clip is
    // closed by reflowClips() when the drag ends.
    const startTime = headDelta !== 0 ? Math.max(0, clip.startTime + headDelta) : clip.startTime;

    newClips[index] = {
      ...clip,
      trimStart: clampedStart,
      trimEnd: clampedEnd,
      duration: newDuration,
      startTime,
    };

    // A head trim leaves the right edge where it was, so nothing downstream
    // needs to move. Only tail changes ripple.
    if (headDelta !== 0 || index + 1 >= newClips.length) {
      clips.value = newClips;
      clipMap.set(clipId, newClips[index]);
      return;
    }

    const nextClip = newClips[index + 1];
    const oldClipEnd = clip.startTime + oldDuration;
    const currentGap = nextClip.startTime - oldClipEnd;
    
    if (durationChange > 0) {
      if (currentGap < durationChange) {
        const pushAmount = durationChange - currentGap;
        for (let i = index + 1; i < newClips.length; i++) {
          newClips[i] = { ...newClips[i], startTime: newClips[i].startTime + pushAmount };
        }
      }
    } else {
      if (currentGap === 0) {
        const pullAmount = Math.abs(durationChange);
        for (let i = index + 1; i < newClips.length; i++) {
          newClips[i] = { ...newClips[i], startTime: newClips[i].startTime - pullAmount };
        }
      }
    }
    
    clips.value = newClips;
    clipMap.set(clipId, newClips[index]);
  }

  /**
   * Lay every clip end to end from zero.
   *
   * Export concatenates clips in array order using only trimStart/trimEnd and
   * ignores startTime, so a gap on the timeline never reaches the output — it
   * is purely a lie about the result. Dragging is allowed to open gaps for the
   * sake of feedback; this is called when the drag ends to put the timeline
   * back to what will actually be rendered.
   */
  function reflowClips(): void {
    let cursor = 0;
    let changed = false;

    const newClips = clips.value.map((clip) => {
      const next = clip.startTime === cursor ? clip : { ...clip, startTime: cursor };
      if (next !== clip) changed = true;
      cursor += clip.duration;
      return next;
    });

    if (!changed) return;

    clips.value = newClips;
    for (const clip of newClips) clipMap.set(clip.id, clip);
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
    reflowClips,
    seekTo,
    setZoom,
    play,
    pause,
    reset,
  };
}
