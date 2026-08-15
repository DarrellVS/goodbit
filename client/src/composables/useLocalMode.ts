import { computed, ref } from 'vue';
import axios from '../axios';
import { useConfiguration } from './useConfiguration';

/**
 * Local network streaming.
 *
 * Served over the internet, every thumbnail and video byte travels
 * browser -> ISP -> Cloudflare -> NAS -> LAN -> PC and all the way back, even
 * when the browser is on the same switch as the server. The same server is
 * reachable directly on the LAN, so media URLs are pointed at that address
 * instead whenever it answers.
 *
 * This works from an HTTPS page: browsers permit requests to private-network
 * and loopback addresses, verified here with fetch, <img> and <video> from
 * https://filmpje.darrellvs.nl to http://192.168.178.28:4000. A browser that
 * does block it simply fails the probe below and falls back to the internet
 * path, so the feature degrades quietly rather than breaking playback.
 */

export interface LanEndpoint {
  address: string;
  iface: string;
  url: string;
}

export interface LocalInfo {
  port: number;
  servesClient: boolean;
  endpoints: LanEndpoint[];
}

/** How long a LAN address gets to answer before we give up on it. */
const PROBE_TIMEOUT_MS = 1500;

const localInfo = ref<LocalInfo | null>(null);
const infoError = ref(false);
/**
 * Origin to load media from. Empty string means "same origin as the page".
 *
 * Deliberately not persisted: a remembered LAN address would be wrong the
 * moment the same browser opens the app from somewhere else, and would point
 * media at an unreachable host. Probing costs a few milliseconds on the LAN,
 * and the result is reused for the lifetime of the tab.
 */
const mediaBase = ref<string>('');
const detecting = ref(false);
let detectPromise: Promise<void> | null = null;

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** True when the address answers quickly. Any failure counts as unreachable. */
async function isReachable(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export function useLocalMode() {
  const config = useConfiguration();

  /** The page itself is already being served from the LAN. */
  const isLocalOrigin = computed(() => isPrivateHost(window.location.hostname));

  const localStreaming = computed(() => isLocalOrigin.value || mediaBase.value !== '');

  const activeMediaOrigin = computed(() =>
    mediaBase.value !== '' ? mediaBase.value : window.location.origin
  );

  /**
   * Find a LAN address for media, if there is one. Safe to call repeatedly;
   * the work happens once per tab.
   */
  async function detectLocalMedia(): Promise<void> {
    if (detectPromise) return detectPromise;

    detectPromise = (async () => {
      // Already served from the LAN, so relative URLs are local already.
      if (isLocalOrigin.value) {
        mediaBase.value = '';
        return;
      }

      if (!config.public.value.preferLocalNetwork) {
        mediaBase.value = '';
        return;
      }

      detecting.value = true;
      try {
        const { data } = await axios.get<LocalInfo>('/api/local-info');
        localInfo.value = data;

        for (const endpoint of data.endpoints) {
          if (await isReachable(endpoint.url)) {
            mediaBase.value = endpoint.url;
            return;
          }
        }

        // Away from home, or the LAN address is not reachable from here.
        mediaBase.value = '';
      } catch {
        infoError.value = true;
        mediaBase.value = '';
      } finally {
        detecting.value = false;
      }
    })();

    return detectPromise;
  }

  /** Re-run detection, e.g. after the setting is toggled. */
  async function redetect(): Promise<void> {
    detectPromise = null;
    mediaBase.value = '';
    await detectLocalMedia();
  }

  return {
    localInfo,
    infoError,
    detecting,
    mediaBase,
    isLocalOrigin,
    localStreaming,
    activeMediaOrigin,
    detectLocalMedia,
    redetect,
  };
}

/** Media origin for URL builders, outside of a component context. */
export function currentMediaBase(): string {
  return mediaBase.value;
}
