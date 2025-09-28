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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


