import { computed, onBeforeUnmount, ref } from 'vue';
import { useToastStore } from '@renderer/stores/toast';

/**
 * Serving one clip to the local network, from the renderer's point of view.
 *
 * Only one share exists at a time, starting another replaces it, so this is
 * state about "the share", not about a particular clip. Whoever asks gets the
 * whole picture and decides whether the running share is theirs.
 */
export function useLocalShare() {
  const toastStore = useToastStore();

  const state = ref<ShareStateWire | null>(null);
  const starting = ref(false);
  const now = ref(Date.now());

  let ticker: ReturnType<typeof setInterval> | null = null;

  /** Minutes left on the running share, or 0. */
  const minutesLeft = computed(() => {
    if (!state.value) return 0;
    return Math.max(0, Math.ceil((state.value.until - now.value) / 60_000));
  });

  function startTicking(): void {
    if (ticker) return;
    ticker = setInterval(() => {
      now.value = Date.now();
      // The main process closes the share on its timer; reflect that here.
      if (state.value && state.value.until <= now.value) stop(true);
    }, 15_000);
  }

  function stopTicking(): void {
    if (!ticker) return;
    clearInterval(ticker);
    ticker = null;
  }

  /** Pick up a share started before this component existed. */
  async function refresh(): Promise<void> {
    state.value = (await window.goodbit?.share.current()) ?? null;
    if (state.value) startTicking();
  }

  async function start(clipId: number): Promise<void> {
    if (starting.value) return;
    starting.value = true;
    try {
      state.value = (await window.goodbit?.share.start(clipId)) ?? null;
      now.value = Date.now();
      startTicking();
    } catch (error) {
      toastStore.error((error as Error).message || 'Could not start the share');
    } finally {
      starting.value = false;
    }
  }

  /** `expired` skips the network call: the main process has already closed it. */
  async function stop(expired = false): Promise<void> {
    stopTicking();
    state.value = null;
    if (!expired) await window.goodbit?.share.stop();
  }

  onBeforeUnmount(stopTicking);

  return { state, starting, minutesLeft, refresh, start, stop };
}
