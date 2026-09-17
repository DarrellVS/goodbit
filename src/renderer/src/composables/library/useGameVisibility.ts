import { useGamesStore } from '@renderer/stores/games';
import { useClipsStore } from '@renderer/stores/clips';
import { useToastStore } from '@renderer/stores/toast';
import { setGameHidden } from '@renderer/services/games';

/**
 * Hiding a game keeps its folder and files exactly where they are, it only
 * drops the game out of the library, the sidebar, stats and the editor's clip
 * picker. Undo it from Settings -> Games.
 */
export function useGameVisibility() {
  const gamesStore = useGamesStore();
  const clipsStore = useClipsStore();
  const toastStore = useToastStore();

  async function setHidden(gameName: string, hidden: boolean, label?: string): Promise<void> {
    const name = label || gameName;
    try {
      await setGameHidden(gameName, hidden);

      // The library is still filtered on a game that just disappeared from the
      // list, so fall back to All before refetching.
      if (hidden && clipsStore.selectedGame === gameName) {
        clipsStore.selectedGame = '';
      }

      clipsStore.resetPagination();
      await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips(false)]);

      toastStore.success(hidden ? `Hidden "${name}"` : `Unhidden "${name}"`);
    } catch (error) {
      console.error('Failed to change game visibility:', error);
      toastStore.error(hidden ? `Failed to hide "${name}"` : `Failed to unhide "${name}"`);
      throw error;
    }
  }

  return { setHidden };
}
