const VERSAO = 'rota-v1';
const BIBLIOTECAS = 'bibliotecas-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(['./', './index.html', './manifest.webmanifest'])));
});

self.addEventListener('activate', e => e.waitUntil((async () => {
  const manter = [VERSAO, BIBLIOTECAS, 'compartilhado'];
  for (const nome of await caches.keys()) if (!manter.includes(nome)) await caches.delete(nome);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith(receber(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) {
    if (!/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|tessdata\.projectnaptha\.com)$/.test(url.origin)) return;
    e.respondWith(
      caches.match(e.request).then(guardado => guardado || fetch(e.request).then(r => {
        const copia = r.clone();
        caches.open(BIBLIOTECAS).then(c => c.put(e.request, copia));
        return r;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./index.html')))
  );
});

async function receber(req) {
  const dados = await req.formData();
  await caches.delete('compartilhado');
  const cache = await caches.open('compartilhado');
  let i = 0;
  for (const f of dados.getAll('imagens')) {
    if (f && f.size) await cache.put(`./compartilhado/img${i++}`, new Response(f));
  }
  const texto = [dados.get('title'), dados.get('text'), dados.get('url')].filter(Boolean).join('\n');
  if (texto) await cache.put('./compartilhado/texto', new Response(texto));
  return Response.redirect(new URL('./?compartilhado=1', self.registration.scope).href, 303);
}
