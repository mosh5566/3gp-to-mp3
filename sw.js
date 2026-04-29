/* Service Worker
   - Cross-Origin Isolation (injects COOP/COEP/CORP headers) so SharedArrayBuffer works on GitHub Pages
   - Web Share Target POST handler
   - Light caching for offline use
*/
const CACHE = 'mp3-converter-v3';
const sharedFiles = new Map();
let nextShareId = 1;
let coepCredentialless = true;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Tell open clients we just took over so they can reload into an isolated context
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'sw-activated' });
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.action === 'get-shared-files') {
    const port = event.ports?.[0];
    const files = sharedFiles.get(data.id) || [];
    sharedFiles.delete(data.id);
    if (port) port.postMessage({ files });
  } else if (data.type === 'coepCredentialless') {
    coepCredentialless = !!data.value;
  }
});

self.addEventListener('fetch', (event) => {
  const r = event.request;
  const url = new URL(r.url);

  // Web Share Target POST
  if (r.method === 'POST' && url.pathname.endsWith('/share-target/')) {
    event.respondWith((async () => {
      try {
        const formData = await r.formData();
        const incoming = formData.getAll('files');
        const validFiles = incoming.filter(f => f && f.size && f.size > 0);
        const id = String(nextShareId++);
        sharedFiles.set(id, validFiles);
        const base = url.pathname.replace(/share-target\/$/, '');
        return Response.redirect(`${base}?share=${id}`, 303);
      } catch (e) {
        return Response.redirect('./', 303);
      }
    })());
    return;
  }

  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

  // Inject COOP/COEP/CORP headers so the page becomes cross-origin isolated
  const request = (coepCredentialless && r.mode === 'no-cors')
    ? new Request(r, { credentials: 'omit' })
    : r;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set(
          'Cross-Origin-Embedder-Policy',
          coepCredentialless ? 'credentialless' : 'require-corp'
        );
        if (!coepCredentialless) {
          newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
        }
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch(err => {
        console.error('SW fetch failed:', err);
        throw err;
      })
  );
});
