// Lets SlithyMDView open with no internet. Network first, so a new version shows up as soon as
// you're online; the saved copy is used when you're not. (build.mjs fills in the cache name from the version.)
// `cache: 'no-cache'` makes every online fetch check with GitHub (cheap when unchanged), instead of
// trusting the browser's copy for the 10 minutes GitHub Pages allows.
const CACHE = 'slithymdview-iphone-v004-2026-11-10';
const FILES = [
  './', 'index.html', 'app.js', 'app.css', 'iphone.css', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req)                                  // the exact file we saved last
        .then(hit => hit || caches.match(req, { ignoreSearch: true }))   // else any saved version of it
        .then(hit => hit || caches.match('index.html')))
  );
});
