import { onBeforeUnmount, onMounted, watch } from 'vue';
import { syncPublisherStats } from '@renderer/services/clips';
import { useClipsStore } from '@renderer/stores/clips';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';

/**
 * How stale the counts on a card may get while somebody is looking at them.
 *
 * Main owns the clock (`statsAreStale`), so boot, the Publisher screen and
 * this all share one window and a burst of navigation is one request.
 */
export const LIBRARY_VIEW_COUNT_MAX_AGE_MS = 10 * 60_000;

/**
 * Keep the view counts on the library's cards following the publisher.
 *
 * The counts are already on every row (`SyncPublisherStatsAction` mirrors
 * them), so nothing is fetched per page or per tile. What was missing is
 * freshness: the sync ran at boot and on the Publisher screen, and the app
 * sits in the tray for days. So the library asks when it opens and when the
 * window comes back into focus, and main answers from the last sync when it
 * is recent.
 *
 * **Quiet on failure.** A publisher that is off leaves yesterday's numbers on
 * the cards. The Publisher screen is where "could not reach" is explained; an
 * optional feature does not get an error banner over the library.
 */
export function useLibraryViewCounts(): void {
  const clipsStore = useClipsStore();
  const { settings } = useAppSettings();

  async function refresh(): Promise<void> {
    if (!settings.value.publisherBaseUrl) return;
    try {
      const answer = await syncPublisherStats(LIBRARY_VIEW_COUNT_MAX_AGE_MS);
      if (answer.skipped || answer.problem) return;
      /*
       * After the list lands, not over it. The page's own first fetch runs
       * beside this one, and a patch applied before its rows arrive is
       * replaced by rows that may have been read before the sync wrote.
       */
      await untilListIdle();
      clipsStore.applyPublisherViews(answer.clips ?? []);
    } catch (error) {
      console.warn('[library] could not refresh view counts:', error);
    }
  }

  function untilListIdle(): Promise<void> {
    if (!clipsStore.loading) return Promise.resolve();
    return new Promise((resolve) => {
      const stop = watch(
        () => clipsStore.loading,
        (loading) => {
          if (loading) return;
          stop();
          resolve();
        },
      );
    });
  }

  const onFocus = (): void => void refresh();

  onMounted(() => {
    void refresh();
    window.addEventListener('focus', onFocus);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('focus', onFocus);
  });
}
