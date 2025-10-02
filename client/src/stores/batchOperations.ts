import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Clip } from '../types/clip';

export const useBatchOperationsStore = defineStore('batchOperations', () => {
  const selectedClipIds = ref<Set<number>>(new Set());
  const isSelectionMode = ref(false);
  const lastSelectedIndex = ref<number | null>(null);

  const selectedCount = computed(() => selectedClipIds.value.size);
  const hasSelection = computed(() => selectedClipIds.value.size > 0);

  function toggleClip(clipId: number, index?: number): void {
    if (selectedClipIds.value.has(clipId)) {
      selectedClipIds.value.delete(clipId);
    } else {
      selectedClipIds.value.add(clipId);
    }
    lastSelectedIndex.value = index ?? null;
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function selectClip(clipId: number, index?: number): void {
    selectedClipIds.value.add(clipId);
    lastSelectedIndex.value = index ?? null;
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function deselectClip(clipId: number): void {
    selectedClipIds.value.delete(clipId);
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function toggleRange(clips: Clip[], currentIndex: number): void {
    if (lastSelectedIndex.value === null) {
      selectClip(clips[currentIndex].id, currentIndex);
      return;
    }

    const start = Math.min(lastSelectedIndex.value, currentIndex);
    const end = Math.max(lastSelectedIndex.value, currentIndex);

    for (let i = start; i <= end; i++) {
      if (clips[i]) {
        selectedClipIds.value.add(clips[i].id);
      }
    }
    
    lastSelectedIndex.value = currentIndex;
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function selectAll(clips: Clip[]): void {
    clips.forEach(clip => selectedClipIds.value.add(clip.id));
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function deselectAll(): void {
    selectedClipIds.value.clear();
    lastSelectedIndex.value = null;
    selectedClipIds.value = new Set(selectedClipIds.value);
  }

  function isSelected(clipId: number): boolean {
    return selectedClipIds.value.has(clipId);
  }

  function enterSelectionMode(): void {
    isSelectionMode.value = true;
  }

  function exitSelectionMode(): void {
    isSelectionMode.value = false;
    deselectAll();
  }

  function getSelectedClips(allClips: Clip[]): Clip[] {
    return allClips.filter(clip => selectedClipIds.value.has(clip.id));
  }

  return {
    selectedClipIds,
    isSelectionMode,
    selectedCount,
    hasSelection,
    toggleClip,
    selectClip,
    deselectClip,
    toggleRange,
    selectAll,
    deselectAll,
    isSelected,
    enterSelectionMode,
    exitSelectionMode,
    getSelectedClips,
  };
});

