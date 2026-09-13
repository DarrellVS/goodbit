import { computed, readonly, shallowRef } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { EDITOR_CONSTANTS } from '../constants/editor';
import type { TimelineAudio } from '../types/editor';
import type { AudioTrack } from '../types/audio';

const DEFAULT_MUSIC_VOLUME = 0.35;

/**
 * The editor's music lane.
 *
 * Deliberately simpler than the video timeline: placements are free-floating,
 * so nothing ripples and nothing reflows. Two tracks may overlap — the export
 * mixes them.
 */
export function useTimelineAudio() {
  const audio = shallowRef<TimelineAudio[]>([]);
  const audioMap = new Map<string, TimelineAudio>();

  const audioDuration = computed(() =>
    audio.value.reduce((max, item) => Math.max(max, item.startTime + item.duration), 0)
  );

  function replace(item: TimelineAudio): void {
    const index = audio.value.findIndex((a) => a.id === item.id);
    if (index === -1) return;

    const next = [...audio.value];
    next[index] = item;
    audio.value = next;
    audioMap.set(item.id, item);
  }

  function addAudio(track: AudioTrack, url: string, startTime = 0): TimelineAudio {
    const duration = track.durationSec || EDITOR_CONSTANTS.DEFAULT_VIDEO_DURATION;

    const item: TimelineAudio = {
      id: uuidv4(),
      trackId: track.id,
      name: track.displayName,
      url,
      startTime: Math.max(0, startTime),
      duration,
      trimStart: 0,
      trimEnd: duration,
      originalDuration: duration,
      // Music sits under the clip audio, so it starts well below unity.
      volume: DEFAULT_MUSIC_VOLUME,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };

    audio.value = [...audio.value, item];
    audioMap.set(item.id, item);
    return item;
  }

  /** Replace the whole lane at once, for restoring a draft. */
  function loadAudio(entries: Array<Omit<TimelineAudio, 'id'>>): void {
    const next = entries.map((entry) => ({ ...entry, id: uuidv4() }));

    audio.value = next;
    audioMap.clear();
    for (const item of next) audioMap.set(item.id, item);
  }

  function removeAudio(id: string): void {
    if (!audioMap.has(id)) return;
    audio.value = audio.value.filter((item) => item.id !== id);
    audioMap.delete(id);
  }

  function updateAudioProperties(
    id: string,
    updates: Partial<Pick<TimelineAudio, 'volume' | 'muted' | 'fadeIn' | 'fadeOut'>>
  ): void {
    const item = audioMap.get(id);
    if (!item) return;

    const updated = { ...item };
    if (updates.volume !== undefined) updated.volume = Math.max(0, Math.min(1, updates.volume));
    if (updates.muted !== undefined) updated.muted = updates.muted;

    // Fades cannot together outlast the segment, or they would overlap and the
    // track would never reach full level.
    if (updates.fadeIn !== undefined) {
      updated.fadeIn = Math.max(0, Math.min(updates.fadeIn, updated.duration - updated.fadeOut));
    }
    if (updates.fadeOut !== undefined) {
      updated.fadeOut = Math.max(0, Math.min(updates.fadeOut, updated.duration - updated.fadeIn));
    }

    replace(updated);
  }

  function moveAudio(id: string, newStartTime: number): void {
    const item = audioMap.get(id);
    if (!item) return;
    replace({ ...item, startTime: Math.max(0, newStartTime) });
  }

  function trimAudio(id: string, trimStart: number, trimEnd: number): void {
    const item = audioMap.get(id);
    if (!item) return;

    const clampedStart = Math.max(0, Math.min(trimStart, item.originalDuration));
    const clampedEnd = Math.max(
      clampedStart + EDITOR_CONSTANTS.MIN_CLIP_DURATION,
      Math.min(trimEnd, item.originalDuration)
    );
    const duration = clampedEnd - clampedStart;

    // Trimming the head pins the right edge, so the handle tracks the cursor
    // instead of sliding the whole placement — same rule as the video lane.
    const headDelta = clampedStart - item.trimStart;
    const startTime = headDelta !== 0 ? Math.max(0, item.startTime + headDelta) : item.startTime;

    replace({
      ...item,
      trimStart: clampedStart,
      trimEnd: clampedEnd,
      duration,
      startTime,
      fadeIn: Math.min(item.fadeIn, duration),
      fadeOut: Math.min(item.fadeOut, duration - Math.min(item.fadeIn, duration)),
    });
  }

  /** A copy of the lane for undo, ids intact so a selection survives the restore. */
  function snapshotAudio(): TimelineAudio[] {
    return audio.value.map((item) => ({ ...item }));
  }

  function restoreAudio(snapshot: TimelineAudio[]): void {
    const next = snapshot.map((item) => ({ ...item }));
    audio.value = next;
    audioMap.clear();
    for (const item of next) audioMap.set(item.id, item);
  }

  function resetAudio(): void {
    audio.value = [];
    audioMap.clear();
  }

  return {
    audio: readonly(audio),
    audioDuration,
    addAudio,
    loadAudio,
    removeAudio,
    updateAudioProperties,
    moveAudio,
    trimAudio,
    snapshotAudio,
    restoreAudio,
    resetAudio,
  };
}
