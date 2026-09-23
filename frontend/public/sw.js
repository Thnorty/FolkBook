// FolkBook service worker. It makes the app installable and shows offline.html when
// the server can't be reached. It deliberately caches nothing else: people's data only
// ever lives on the server, never in a cache on the device.

const CACHE = 'folkbook-offline-v1'
const OFFLINE_FILES = ['/offline.html', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Drop caches from older versions of this file.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
  } else if (OFFLINE_FILES.includes(new URL(request.url).pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
  }
  // Everything else (the app, the API) goes straight to the network.
})
