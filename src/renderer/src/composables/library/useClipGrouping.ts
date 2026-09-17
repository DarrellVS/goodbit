import { computed, type Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
import { formatDate } from '@renderer/helpers/dateFormat';
import { useGamesStore } from '@renderer/stores/games';

interface ClipGroup {
  date: string;
  game: string;
  clips: Clip[];
  displayDate: string;
}

interface ClipWithIndex {
  clip: Clip;
  globalIndex: number;
}

interface ClipGroupWithIndices extends Omit<ClipGroup, 'clips'> {
  clips: ClipWithIndex[];
}

export function useClipGrouping(clips: Ref<Clip[]>) {
  const gamesStore = useGamesStore();

  const groupedClips = computed(() => {
    const groups = new Map<string, ClipGroupWithIndices>();
    const groupOrder: string[] = [];

    clips.value.forEach((clip, globalIndex) => {
      // The day a clip belongs to is the day it was recorded, not the day it was
      // indexed, or a library that predates the install collapses into one group.
      const date = new Date(clip.recordedAt ?? clip.fileModifiedAt ?? clip.createdAt ?? new Date());
      const dateKey = date.toISOString().split('T')[0];
      const groupKey = `${dateKey}-${clip.game}`;

      if (!groups.has(groupKey)) {
        groupOrder.push(groupKey);
        groups.set(groupKey, {
          date: dateKey,
          game: clip.game,
          clips: [],
          displayDate: formatDate(date),
        });
      }

      groups.get(groupKey)!.clips.push({ clip, globalIndex });
    });

    return groupOrder.map(key => groups.get(key)!);
  });

  function getGameDisplayName(gameFolderName: string): string {
    const game = gamesStore.items.find(g => g.game === gameFolderName);
    return game?.displayName || gameFolderName;
  }

  return {
    groupedClips,
    getGameDisplayName,
  };
}

