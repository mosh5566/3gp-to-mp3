/* Service Worker - Web Share Target + light caching */
const CACHE = 'mp3-converter-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];

const sharedFiles = new Map();
let nextId = 1;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Web Share Target POST handler
  if (req.method === 'POST' && url.pathname.endsWith('/share-target/')) {
    event.respondWith((async () => {
      try {
        const formData = await req.formData();
        const incoming = formData.getAll('files');
        const validFiles = incoming.filter(f => f && f.size && f.size > 0);
        const id = String(nextId++);
        sharedFiles.set(id, validFiles);
        const base = url.pathname.replace(/share-target\/$/, '');
        return Response.redirect(`${base}?share=${id}`, 303);
      } catch (e) {
        return Response.redirect('./', 303);
      }
    })());
    return;
  }

  // Network-first for own HTML/JS so updates roll out fast; cache fallback for offline
  if (req.method === 'GET' && url.origin === location.origin) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const clone = fresh.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw new Error('offline and not cached');
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.action === 'get-shared-files') {
    const port = event.ports?.[0];
    const files = sharedFiles.get(data.id) || [];
    sharedFiles.delete(data.id);
    if (port) port.postMessage({ files });
  }
});
