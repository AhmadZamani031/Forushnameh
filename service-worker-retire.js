"use strict";
/*
 * Emergency retirement worker for the legacy offline cache.
 * It intentionally has no fetch handler: all page and asset requests go to the network.
 */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
