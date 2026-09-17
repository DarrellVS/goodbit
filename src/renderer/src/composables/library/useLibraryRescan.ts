import { ref, type Ref } from 'vue';
import { rescanGames } from '@renderer/services/games';
import { useClipsStore } from '@renderer/stores/clips';
import { useGamesStore } from '@renderer/stores/games';
import { useToastStore } from '@renderer/stores/toast';

/**
 * Re-read the videos folder, and say what came of it.
 *
 * This was the loudest button in the app: solid orange, in the library header,
 * beside the search field. It is the backstop rather than the main event.
 * `startup.ts` runs a chokidar watcher, `incoming.ts` indexes a clip the
 * instant it is filed, and a reconciliation sweep runs every six hours anyway,
 * so the list is already up to date and a button offering to make it correct
 * implies that it might not be.
 *
 * It does not go away. A watcher misses events, filesystem notifications are a
 * hint rather than a guarantee, and a library on a drive that was unplugged
 * needs a way back. It lives in Settings, next to the folder it scans, and in
 * the library's own empty state, which is the one screen where a scan is the
 * obvious next move.
 */
export function useLibraryRescan(): { rescanning: Ref<boolean>; rescan: () => Promise<void> } {
  const clipsStore = useClipsStore();
  const gamesStore = useGamesStore();
  const toastStore = useToastStore();
  const rescanning = ref(false);

  /**
   * It used to spin an icon and stop. A scan that found nothing looked exactly
   * like a scan that never ran, and because there was no `catch`, so did one
   * that threw. On a screen full of recordings somebody cannot replace, this
   * has to report back.
   */
  async function rescan(): Promise<void> {
    if (rescanning.value) return;
    rescanning.value = true;
    try {
      const result = await rescanGames();
      clipsStore.resetPagination();
      await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips(false)]);

      const clips = (n: number): string => `${n} clip${n === 1 ? '' : 's'}`;

      // The guard fired, which means the folder looked wrong rather than empty.
      // Nothing was deleted, and that is the part worth saying out loud.
      if (result.pruneSkipped) {
        toastStore.warning(
          `Nothing was removed, because ${result.pruneSkipped.reason}. Your library is untouched.`,
          'Scanned, but something looks off',
        );
        return;
      }

      const changes: string[] = [];
      if (result.added) changes.push(`${clips(result.added)} added`);
      if (result.updated) changes.push(`${clips(result.updated)} updated`);
      if (result.removed) changes.push(`${clips(result.removed)} no longer on disk`);

      /*
       * The number the screen is showing, not the number in the table.
       *
       * The scan counted every row and the library header counts what is on
       * screen, so a library with hidden games had the two disagreeing by
       * exactly the hidden count, with nothing saying why. The visible figure
       * leads, and the hidden ones are named rather than folded in.
       */
      const visible = result.total - (result.hidden ?? 0);
      const tally = result.hidden
        ? `${clips(visible)}, and ${clips(result.hidden)} in hidden games.`
        : `${clips(result.total)} in all.`;

      toastStore.success(
        changes.length ? `${changes.join(', ')}. ${tally}` : `Nothing new. ${tally}`,
        'Scanned',
      );
    } catch (error) {
      toastStore.error(
        (error as Error).message || 'The videos folder could not be read.',
        'Could not scan',
      );
    } finally {
      rescanning.value = false;
    }
  }

  return { rescanning, rescan };
}
