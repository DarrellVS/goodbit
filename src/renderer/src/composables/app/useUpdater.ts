import { onBeforeUnmount, onMounted, ref } from 'vue';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

/**
 * Whether a new build is waiting, and applying it when asked.
 *
 * Downloading happens on its own; restarting does not. The service worker this
 * replaces reloaded the page the moment a deploy landed, which could take a
 * drag or a half-filled dialog with it.
 */
export function useUpdater() {
  const state = ref<UpdateState>({ status: 'idle' });
  let detach: (() => void) | null = null;

  onMounted(async () => {
    const bridge = window.goodbit;
    if (!bridge?.updater) return;

    state.value = await bridge.updater.state();
    detach = bridge.updater.onState((next) => {
      state.value = next as UpdateState;
    });
  });

  onBeforeUnmount(() => detach?.());

  async function install(): Promise<void> {
    await window.goodbit?.updater?.install();
  }

  async function check(): Promise<void> {
    await window.goodbit?.updater?.check();
  }

  return { state, install, check };
}
