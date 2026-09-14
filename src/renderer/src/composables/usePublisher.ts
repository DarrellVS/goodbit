import { computed, ref } from 'vue';

/**
 * Whether publishing exists at all.
 *
 * The publisher is an optional module someone runs on a server of their own.
 * With none configured the feature has to be absent rather than present and
 * failing, so the menu entries that use it are hidden.
 *
 * Module-level, loaded once: this is read on every clip menu open.
 */
const configured = ref(false);
/**
 * Whether publishing also offers a compressed copy. Tied to the compress-trims
 * setting: someone who wants their trims small wants the same of what they
 * send out, and someone who turned it off asked for the recorded bytes.
 */
const offersCompressed = ref(true);
let started = false;

function apply(settings: { publisherBaseUrl: string; compressTrims?: boolean } | undefined): void {
  configured.value = !!settings?.publisherBaseUrl;
  offersCompressed.value = settings?.compressTrims !== false;
}

export function usePublisher() {
  if (!started) {
    started = true;
    void window.goodbit?.getSettings().then(apply);
  }

  /** Re-read after the setting changes, so the menus update without a restart. */
  async function refresh(): Promise<void> {
    apply(await window.goodbit?.getSettings());
  }

  return {
    isConfigured: computed(() => configured.value),
    offersCompressed: computed(() => offersCompressed.value),
    refresh,
  };
}
