import { computed, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import axios from '../axios';
import { useConfiguration } from './useConfiguration';

/**
 * Local network mode.
 *
 * When the app is reached over the internet, every thumbnail and video byte
 * travels browser -> ISP -> Cloudflare -> NAS -> LAN -> PC and all the way back.
 * The PC server also serves this bundle, so loading the app straight from its
 * LAN address keeps the whole lot on the local network instead.
 *
 * It has to be an origin switch rather than just pointing media URLs at the LAN
 * IP: browsers block plain-HTTP subresources on an HTTPS page (mixed content),
 * so an HTTPS page can neither fetch nor even probe http://192.168.x.x. A
 * top-level navigation is not subresource loading, so it is allowed — which is
 * why switching means moving the whole page to the local origin.
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

/** Query param carrying the remote origin across the origin switch. */
export const HANDOFF_PARAM = 'filmpjeFrom';
/** Query param asking the remote origin not to bounce straight back to local. */
export const STAY_PARAM = 'filmpjeStay';
/** Params consumed on arrival; the router strips them from the visible URL. */
export const LOCAL_MODE_PARAMS = [HANDOFF_PARAM, STAY_PARAM] as const;
/** Marks that we just tried to reach the LAN, so a Back press can self-heal. */
const ATTEMPT_KEY = 'filmpje-local-attempt';
/** Suppresses auto-switch for this tab after an explicit "use the internet". */
const STAY_KEY = 'filmpje-stay-remote';
/**
 * A failed switch is followed by a Back press within seconds. A marker older
 * than this is left over from a switch that actually worked, so it must not be
 * read as a failure.
 */
const ATTEMPT_TTL_MS = 60_000;

const localInfo = ref<LocalInfo | null>(null);
const infoError = ref(false);
let infoPromise: Promise<void> | null = null;

/** Remote (internet) origin, remembered so local mode can offer a way back. */
const remoteOrigin = useLocalStorage<string>('filmpje-remote-origin', '');
/** Endpoint URL the user dismissed the suggestion for. */
const dismissedEndpoint = useLocalStorage<string>('filmpje-local-dismissed', '');
/** An auto-switch attempt did not reach the LAN; worth telling the user about. */
const switchFailed = ref(false);
/** Do not auto-switch again this tab, whether from a failure or a deliberate choice. */
const autoSwitchSuppressed = ref(false);

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

/**
 * Runs before the router so the handoff param never reaches route state.
 * Records where we came from, and detects a failed auto-switch (the user
 * pressed Back after the LAN address did not resolve).
 */
export function initLocalMode(): void {
  const params = new URL(window.location.href).searchParams;

  const from = params.get(HANDOFF_PARAM);
  if (from) {
    try {
      remoteOrigin.value = new URL(from).origin;
    } catch {
      // Malformed handoff, ignore.
    }
  }

  // Arrived here because the user deliberately chose the internet connection.
  if (params.get(STAY_PARAM)) {
    window.sessionStorage.setItem(STAY_KEY, '1');
  }

  // These params are consumed here, but removing them from the URL is the
  // router's job: it captures window.location when its module is evaluated,
  // which import hoisting puts *before* this function runs, so a replaceState
  // here would just be overwritten by the router's first navigation.

  // We are back on the origin that launched an auto-switch. If that was moments
  // ago the LAN address did not resolve; an older marker is from a switch that
  // succeeded and the user simply came back later.
  const attempt = window.sessionStorage.getItem(ATTEMPT_KEY);
  if (attempt) {
    window.sessionStorage.removeItem(ATTEMPT_KEY);
    if (Date.now() - Number(attempt) < ATTEMPT_TTL_MS) {
      switchFailed.value = true;
      autoSwitchSuppressed.value = true;
    }
  }

  if (window.sessionStorage.getItem(STAY_KEY)) {
    autoSwitchSuppressed.value = true;
  }
}

export function useLocalMode() {
  const config = useConfiguration();

  const isLocalOrigin = computed(() => isPrivateHost(window.location.hostname));

  async function loadInfo(): Promise<void> {
    if (infoPromise) return infoPromise;
    infoPromise = axios
      .get<LocalInfo>('/api/local-info')
      .then(({ data }) => {
        localInfo.value = data;
      })
      .catch(() => {
        infoError.value = true;
      });
    return infoPromise;
  }

  /** Best LAN address to offer, or null when none is usable. */
  const localUrl = computed<string | null>(() => {
    const info = localInfo.value;
    if (!info || !info.servesClient) return null;
    return info.endpoints[0]?.url ?? null;
  });

  const canSwitchToLocal = computed(() => !isLocalOrigin.value && localUrl.value !== null);

  const canSwitchToRemote = computed(() => isLocalOrigin.value && remoteOrigin.value !== '');

  const showSuggestion = computed(
    () => canSwitchToLocal.value && dismissedEndpoint.value !== localUrl.value
  );

  function buildTarget(base: string, includeHandoff: boolean): string {
    const target = new URL(
      window.location.pathname + window.location.search + window.location.hash,
      base
    );
    if (includeHandoff) target.searchParams.set(HANDOFF_PARAM, window.location.origin);
    return target.toString();
  }

  function switchToLocal(auto = false): void {
    const base = localUrl.value;
    if (!base) return;
    // Breadcrumb so a Back press after an unreachable LAN address turns
    // auto-switching off instead of looping.
    if (auto) window.sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()));
    window.location.assign(buildTarget(base, true));
  }

  function switchToRemote(): void {
    if (!remoteOrigin.value) return;
    // Tell the remote origin this was deliberate, so it does not immediately
    // bounce back here when "prefer local" is on.
    const target = new URL(buildTarget(remoteOrigin.value, false));
    target.searchParams.set(STAY_PARAM, '1');
    window.location.assign(target.toString());
  }

  function dismissSuggestion(): void {
    dismissedEndpoint.value = localUrl.value ?? '';
  }

  /**
   * Called once the app shell is up. Fetches LAN info and, if the user opted
   * in, moves to the local origin automatically.
   */
  async function activate(): Promise<void> {
    await loadInfo();

    if (
      config.public.value.preferLocalNetwork &&
      canSwitchToLocal.value &&
      !autoSwitchSuppressed.value
    ) {
      switchToLocal(true);
    }
  }

  return {
    localInfo,
    infoError,
    isLocalOrigin,
    localUrl,
    remoteOrigin,
    switchFailed,
    autoSwitchSuppressed,
    canSwitchToLocal,
    canSwitchToRemote,
    showSuggestion,
    loadInfo,
    activate,
    switchToLocal,
    switchToRemote,
    dismissSuggestion,
  };
}
