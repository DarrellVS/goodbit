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

// A new build waits here until the page says to take over.
//
// This used to call skipWaiting() on install, which claimed the page the moment
// a deploy was fetched and reloaded it out from under whatever was being done —
// mid-drag in the editor, say. The page now notices the waiting worker, offers
// a reload, and sends SKIP_WAITING when the user accepts. The handler below is
// the other half of that, and claiming on activate is still what makes the old
// precached index.html stop answering navigations.

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


