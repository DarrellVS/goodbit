import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';

/**
 * Keep the window in step with the background service.
 *
 * The watcher indexes clips whether or not anything is on screen, so a window
 * that only loaded once shows whatever was there when it opened, the app's
 * whole point is that it notices a clip while you are recording, and without
 * this you had to press Rescan to see it.
 *
 * Refreshes are coalesced: a burst of files landing at once (an import, or a
 * session's worth of clips arriving after a rescan) would otherwise fire a
 * request per file.
 */
const REFRESH_DEBOUNCE_MS = 600;

export type ServiceEvent =
  | { type: 'scan-started' }
  | { type: 'scan-finished'; added: number; updated: number; removed: number; total: number }
  | { type: 'clip-added'; filePath: string; game: string }
  | { type: 'clip-removed'; filePath: string }
  | {
      type: 'publish-progress';
      clipId: number;
      name: string;
      stage: 'compressing' | 'uploading' | 'done' | 'failed';
      percent: number;
      message?: string;
    };

export function useServiceEvents() {
  const clipsStore = useClipsStore();
  const gamesStore = useGamesStore();

  /** True while the service is scanning, so the UI can say so. */
  const scanning = ref(false);
  /** The clip most recently noticed, for a subtle "new clip" hint. */
  const lastAdded = ref<{ game: string; at: number } | null>(null);

  let detach: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function refreshSoon(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void clipsStore.fetchClips(false);
      void gamesStore.fetchGames();
    }, REFRESH_DEBOUNCE_MS);
  }

  function handle(raw: unknown): void {
    const event = raw as ServiceEvent;

    switch (event.type) {
      case 'scan-started':
        scanning.value = true;
        break;

      case 'scan-finished':
        scanning.value = false;
        // Only reload when something actually moved; a sweep that finds
        // nothing should not flash the list.
        if (event.added || event.updated || event.removed) refreshSoon();
        break;

      case 'clip-added':
        lastAdded.value = { game: event.game, at: Date.now() };
        refreshSoon();
        break;

      case 'clip-removed':
        refreshSoon();
        break;

      case 'publish-progress':
        // Owned by `usePublishProgress`; listed here so the switch stays
        // exhaustive and a new event cannot be forgotten in both places.
        break;
    }
  }

  onMounted(() => {
    detach = window.goodbit?.onServiceEvent(handle) ?? null;
  });

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    detach?.();
  });

  return { scanning, lastAdded };
}
