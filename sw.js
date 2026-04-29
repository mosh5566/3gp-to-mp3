/* Service Worker - Web Share Target handler */
const CACHE = 'mp3-converter-v1';
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
  event.waitUntil(self.clients.claim());
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

  // Cache-first for app shell (GET only)
  if (req.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached))
    );
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
