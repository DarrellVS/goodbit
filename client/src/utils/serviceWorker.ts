// How often a tab that stays open looks for a new build. The app is installable
// as a PWA, so a tab can easily outlive several deploys.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * Registers the service worker and makes a deploy land on its own.
 *
 * The worker calls `skipWaiting()` + `clients.claim()`, so a new build activates
 * as soon as it is fetched. Claiming an already-controlled page means that page
 * is now running HTML and chunks from the previous build, so it gets reloaded —
 * this is what turns "a new deploy needs Shift+F5" into "it just appears".
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
