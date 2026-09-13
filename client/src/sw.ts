/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

// self.__WB_MANIFEST will be injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// Cache same-origin GET requests for static assets
registerRoute(
  ({ request, sameOrigin }) => sameOrigin && request.method === 'GET' && ['style', 'script', 'image', 'font'].includes(request.destination),
  new StaleWhileRevalidate({})
);

// Do not cache API calls; they require auth
// Any further runtime routes can be added here if needed

// Take over immediately instead of parking in "waiting" until every tab is
// closed. vite-plugin-pwa only injects these for the generateSW strategy — an
// injectManifest worker like this one has to do it itself, and without them
// `registerType: 'autoUpdate'` does nothing: the old worker keeps answering
// navigations from the old precached index.html, which is why a new deploy only
// showed up on a hard reload (a hard reload bypasses the worker entirely).
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


