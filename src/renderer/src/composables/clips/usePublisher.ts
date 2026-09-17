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
 * Whether a plain publish sends a share-sized copy.
 *
 * The menu needs this to say what its two entries do: one repeats the setting,
 * the other does the opposite of it, and neither should make you guess which
 * is which.
 */
const compressesPublished = ref(true);
let started = false;

function apply(settings: { publisherBaseUrl: string; compressPublished?: boolean } | undefined): void {
  configured.value = !!settings?.publisherBaseUrl;
  compressesPublished.value = settings?.compressPublished !== false;
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
    compressesPublished: computed(() => compressesPublished.value),
    refresh,
  };
}
