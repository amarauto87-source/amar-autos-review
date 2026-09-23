// Offline + instant-open cache for the Amar Autos dashboard.
//
// The important idea: the dashboard HTML is only a SHELL. Every number in it comes from the
// Apps Script API at run time, so serving a shell that is a few hours old costs nothing — the
// data is fetched fresh either way. That means the shell can come straight from the phone's
// cache (instant) while a fresh copy downloads quietly in the background for next time.
//
// The previous version did the opposite — network first — so every single open waited for the
// full ~300 KB download before showing anything, and the cache only ever helped when offline.
const CACHE_NAME = 'amar-autos-v3';   // bumped: clears every older cached build on activation

// Nothing is pre-listed by filename on purpose. The dashboard page has been renamed before, and
// a worker that hard-codes the wrong name silently caches nothing at all. Instead every
// same-origin file is cached the first time it is actually requested, so the worker keeps
// working whatever the page ends up being called.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Live data must never be served from cache — it is the whole point of the dashboard.
  // Anything going to the API, the sheet, or the IP lookup goes straight to the network.
  const isLive =
    url.hostname.indexOf('script.google.com') >= 0 ||
    url.hostname.indexOf('docs.google.com') >= 0 ||
    url.hostname.indexOf('googleusercontent.com') >= 0 ||
    url.hostname.indexOf('ipwho.is') >= 0 ||
    url.hostname.indexOf('onesignal') >= 0;
  if (isLive) return;                       // let the browser handle it normally

  // The page's "am I the latest version?" check must never be answered from the cache.
  if (url.search.indexOf('buildcheck=') >= 0) return;

  // Everything else is the shell: serve the cached copy at once, then refresh it in the
  // background so the next open already has the newer build.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);            // offline: the cached copy is all we have
        return cached || fresh;            // cached wins on speed; fresh fills the cache
      })
    )
  );
});

// The page can ask for an immediate update (used by the "Force Refresh" button) instead of
// waiting for the next open.
// The page can ask for the cache to be emptied, so the next open pulls everything fresh.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-shell-cache') caches.delete(CACHE_NAME);
});
