import { ref, type Ref } from 'vue';

// How often a tab that stays open looks for a new build. The app is installable
// as a PWA, so a tab can easily outlive several deploys.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

/** True once a new build is fetched and waiting to take over. */
export const updateAvailable: Ref<boolean> = ref(false);

let waitingWorker: ServiceWorker | null = null;

/**
 * Registers the service worker and watches for a new build.
 *
 * The worker no longer claims the page the instant a deploy lands. It used to,
 * which meant a new build reloaded the page out from under whatever was being
 * done — losing a drag in progress, or a dialog half filled in. Instead the new
 * worker parks in `waiting`, this reports it, and the page offers a reload the
 * user can take when it suits them.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // A first install also fires `controllerchange` (nothing was controlling the
  // page before). Nothing is stale in that case, so don't reload.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      const check = (worker: ServiceWorker | null): void => {
        // `installed` with a controller already present means this is an update
        // rather than a first install.
        if (!worker || worker.state !== 'installed') return;
        if (!navigator.serviceWorker.controller) return;
        waitingWorker = worker;
        updateAvailable.value = true;
      };

      check(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => check(installing));
      });

      void registration.update();

      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    })
    .catch((error) => {
      console.error('Service worker registration failed:', error);
    });
}

/**
 * Take the waiting build.
 *
 * The worker answers SKIP_WAITING by activating and claiming, which fires
 * `controllerchange` above and reloads the page — so there is nothing to do
 * here but ask.
 */
export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  updateAvailable.value = false;
}

/** Leave the new build waiting; it will still be there on the next visit. */
export function dismissUpdate(): void {
  updateAvailable.value = false;
}
