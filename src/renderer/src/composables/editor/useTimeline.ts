import { ref, computed, readonly, shallowRef } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { EDITOR_CONSTANTS } from '@renderer/constants/editor';
import type { TimelineClip } from '@renderer/types/editor';

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
    name: string,
    videoUrl: string,
    thumbnailUrl: string,
    originalDuration: number,
    goodBits?: readonly { startSec: number; endSec: number }[],
    /** Place only this part of the source, as if it had been trimmed to it. */
    range?: { startSec: number; endSec: number },
  ): void {
    const trimStart = range ? Math.max(0, Math.min(range.startSec, originalDuration)) : 0;
    const trimEnd = range ? Math.max(trimStart, Math.min(range.endSec, originalDuration)) : originalDuration;
    const clip: TimelineClip = {
      id: uuidv4(),
      clipId,
      name,
      startTime: duration.value,
      duration: trimEnd - trimStart,
      trimStart,
      trimEnd,
      volume: 1,
      muted: false,
      videoUrl,
      thumbnailUrl,
      originalDuration,
      goodBits,
    };
    
    clips.value = [...clips.value, clip];
    clipMap.set(clip.id, clip);
  }

  /**
   * Replace the whole lane at once. Restoring a draft rebuilds every clip from
   * stored trims, so the incremental ops cannot express it.
   */
  function loadClips(entries: Array<Omit<TimelineClip, 'id'>>): void {
    const next = entries.map((entry) => ({ ...entry, id: uuidv4() }));

    clips.value = next;
    clipMap.clear();
    for (const clip of next) clipMap.set(clip.id, clip);

    currentTime.value = 0;
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

  /**
   * Change what a clip sounds like, and only that.
   *
   * Named keys rather than a spread, so a caller cannot accidentally move a
   * clip's start time through the properties panel. The cost is that a key
   * missing from this list is **dropped in silence**: the panel emits it, the
   * timeline ignores it, and the control springs back to where it was with
   * nothing logged. That is what happened to `audio` when the per-track
   * section was added.
   */
  function updateClipProperties(
    clipId: string,
    updates: Partial<Pick<TimelineClip, 'volume' | 'muted' | 'audio'>>
  ): void {
    const clip = clipMap.get(clipId);
    if (!clip) return;
    
    const updated = { ...clip };
    if (updates.volume !== undefined) updated.volume = Math.max(0, Math.min(1, updates.volume));
    if (updates.muted !== undefined) updated.muted = updates.muted;
    // An empty list is a real value here: it is what *Reset* sends, and it has
    // to replace the selection rather than read as "nothing was passed".
    if (updates.audio !== undefined) updated.audio = updates.audio;
    
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

  /**
   * Swap a clip with the one before or after it.
   *
   * Reordering had no discoverable route at all: no grip, no hover state, no
   * context menu, no keyboard, and nothing on screen saying clips could be
   * dragged. Deciding the order is most of what making a montage is, so there
   * has to be a way to do it that you can find by looking.
   *
   * Expressed as a swap rather than as a time, because "put this one before
   * that one" is the intent and `moveClip`'s re-pack then lays them end to end
   * again. Swapping positions rather than durations means a long clip and a
   * short one trade places correctly.
   */
  function reorderClip(clipId: string, direction: 'earlier' | 'later'): void {
    const ordered = [...clips.value].sort((a, b) => a.startTime - b.startTime);
    const at = ordered.findIndex((c) => c.id === clipId);
    if (at === -1) return;

    const to = direction === 'earlier' ? at - 1 : at + 1;
    if (to < 0 || to >= ordered.length) return;

    const swapped = [...ordered];
    [swapped[at], swapped[to]] = [swapped[to], swapped[at]];

    // Lay the new order end to end from zero, so there are no gaps to explain.
    let cursor = 0;
    const repacked = swapped.map((clip) => {
      const placed = { ...clip, startTime: cursor };
      cursor += clip.duration;
      clipMap.set(clip.id, placed);
      return placed;
    });

    clips.value = repacked;
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
   * ignores startTime, so a gap on the timeline never reaches the output, it
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

  /**
   * A copy of the lane, for undo.
   *
   * Unlike loadClips this keeps the existing ids: a restored snapshot has to be
   * the same clips, or whatever was selected before the undo would point at
   * nothing afterwards.
   */
  function snapshotClips(): TimelineClip[] {
    return clips.value.map((clip) => ({ ...clip }));
  }

  function restoreClips(snapshot: TimelineClip[]): void {
    const next = snapshot.map((clip) => ({ ...clip }));
    clips.value = next;
    clipMap.clear();
    for (const clip of next) clipMap.set(clip.id, clip);
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
    loadClips,
    removeClip,
    updateClipProperties,
    moveClip,
    reorderClip,
    trimClip,
    reflowClips,
    snapshotClips,
    restoreClips,
    seekTo,
    setZoom,
    play,
    pause,
    reset,
  };
}
