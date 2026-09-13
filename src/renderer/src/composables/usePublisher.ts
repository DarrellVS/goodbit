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
let started = false;

export function usePublisher() {
  if (!started) {
    started = true;
    void window.goodbit?.getSettings().then((settings) => {
      configured.value = !!settings.publisherBaseUrl;
    });
  }

  /** Re-read after the setting changes, so the menus update without a restart. */
  async function refresh(): Promise<void> {
    const settings = await window.goodbit?.getSettings();
    configured.value = !!settings?.publisherBaseUrl;
  }

  return { isConfigured: computed(() => configured.value), refresh };
}
