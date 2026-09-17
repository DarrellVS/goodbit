import { computed, ref, shallowRef } from 'vue';
import type { TimelineAudio, TimelineClip } from '@renderer/types/editor';

/** Deep enough that a long session still has somewhere to go back to, bounded so it cannot grow forever. */
const MAX_DEPTH = 50;

interface EditorSnapshot {
  clips: TimelineClip[];
  audio: TimelineAudio[];
}

interface HistoryPorts {
  snapshotClips: () => TimelineClip[];
  restoreClips: (snapshot: TimelineClip[]) => void;
  snapshotAudio: () => TimelineAudio[];
  restoreAudio: (snapshot: TimelineAudio[]) => void;
}

/**
 * Undo and redo for the editor.
 *
 * Both lanes are captured together, because one gesture can touch both, the
 * export cuts music at the video end, so deleting the last clip shortens the
 * music too, and undoing half of that would be worse than not undoing at all.
 *
 * `record()` is called *before* a change, not after: it stores the state the
 * change is about to leave behind. Drags call it once when the gesture starts
 * rather than on every mousemove, so an undo steps back over a whole drag.
 */
export function useEditorHistory(ports: HistoryPorts) {
  const past = shallowRef<EditorSnapshot[]>([]);
  const future = shallowRef<EditorSnapshot[]>([]);
  // Restoring a snapshot must not itself be recorded as a change.
  const restoring = ref(false);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  function capture(): EditorSnapshot {
    return { clips: ports.snapshotClips(), audio: ports.snapshotAudio() };
  }

  function apply(snapshot: EditorSnapshot): void {
    restoring.value = true;
    try {
      ports.restoreClips(snapshot.clips);
      ports.restoreAudio(snapshot.audio);
    } finally {
      restoring.value = false;
    }
  }

  /** Remember the current state before changing it. A new edit drops the redo stack. */
  function record(): void {
    if (restoring.value) return;
    const next = [...past.value, capture()];
    // Oldest first out, so the cap trims the least useful end.
    past.value = next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
    if (future.value.length) future.value = [];
  }

  function undo(): void {
    const previous = past.value[past.value.length - 1];
    if (!previous) return;
    future.value = [capture(), ...future.value];
    past.value = past.value.slice(0, -1);
    apply(previous);
  }

  function redo(): void {
    const next = future.value[0];
    if (!next) return;
    past.value = [...past.value, capture()];
    future.value = future.value.slice(1);
    apply(next);
  }

  /** Start again: loading a draft or clearing the timeline is not an undoable step. */
  function clearHistory(): void {
    past.value = [];
    future.value = [];
  }

  return { canUndo, canRedo, record, undo, redo, clearHistory };
}
