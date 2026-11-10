"use strict";
/*
 * Deliberately inactive: the previous worker could return a false offline page
 * despite an available connection. The app now runs online without a service worker.
 * Existing registrations are removed by the recovery code in index.html/offline.html.
 */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
 await self.registration.unregister();
 await self.clients.claim();
})()));
