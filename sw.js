/* Offline-cache. Appens egna filer och WCA-svaren hämtas nätverket först och
   faller tillbaka på cachen utan nät, så senast visade profil går att läsa offline. */
const CACHE = 'wca-graphs-v6';
const DATA = 'wca-graphs-data';
const SKAL = ['./', './index.html', './app.js', './manifest.json', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SKAL.map(async u => {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (r.ok) await c.put(u, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== DATA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const api = url.hostname === 'www.worldcubeassociation.org' && url.pathname.startsWith('/api/v0/persons/');
  if (url.origin !== location.origin && !api) return;
  e.respondWith((async () => {
    const c = await caches.open(api ? DATA : CACHE);
    try {
      const r = await fetch(e.request, api ? undefined : { cache: 'no-cache' });
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(e.request, { ignoreSearch: !api });
      if (hit) return hit;
      if (api) throw err;
      return c.match('./index.html');
    }
  })());
});
