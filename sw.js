// =========================================================================
// SERVICE WORKER - EDADMIN PRO
// Menyediakan caching app-shell agar aplikasi tetap bisa dibuka saat
// koneksi lemah/offline. Data (Google Apps Script) selalu diambil
// langsung dari jaringan karena bersifat dinamis (live data guru).
// =========================================================================

const CACHE_VERSION = 'edadmin-pro-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Domain backend (Google Apps Script) & host CDN yang TIDAK boleh di-cache
// sebagai data statis / harus selalu network-first.
const NEVER_CACHE_HOSTS = ['script.google.com', 'script.googleusercontent.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // biarkan POST (simpan data) langsung ke jaringan

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) Backend Apps Script: selalu network only, jangan pernah di-cache.
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ status: 'error', message: 'Offline: tidak dapat menghubungi server.' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // 2) Dokumen HTML utama: network-first, fallback ke cache saat offline.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3) Aset lain (CDN library, font, ikon, dsb): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
