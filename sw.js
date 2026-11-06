// Service Worker transparente: no guarda en caché y deja pasar siempre el código nuevo
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('fetch', (e) => {
  // Pide siempre todo fresco a la red
  e.respondWith(fetch(e.request));
});