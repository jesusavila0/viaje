// Service Worker básico para PWA
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => {
  // Deja pasar las peticiones a la red
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});