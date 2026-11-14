// Site worker: keeps the home pages (/zh/, /it/, /en/) and their styles, fonts and photos readable without a connection.
// It touches nothing else: coupon links (/c/, /v/), accounts, the restaurant area, APIs and every other page go straight to the network.
const PAGES = 'pci-site-pages-v1', FILES = 'pci-site-files-v1';
const HOME = /^\/(zh|it|en)\/$/;
const STATIC = /^\/(_next\/static\/|fonts\/|icons\/|apple-touch-icon\.png)/;
const PHOTOS = /^\/(_next\/image\/?$|images\/)/;
const offline = {
  zh: ['没有网络', '请连上网络后再打开本页。已领取的优惠券请从邮件或之前保存的券链接打开。'],
  it: ['Nessuna connessione', 'Collegati a internet e riprova. Il coupon già richiesto si apre dal link ricevuto.'],
  en: ['No connection', 'Connect to the internet and try again. A coupon you already claimed opens from its link.'],
};

self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (/^pci-site-/.test(name) && name !== PAGES && name !== FILES) await caches.delete(name);
  await self.clients.claim();
})()));

async function home(request, lang) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/' + lang + '/', response.clone());
    return response;
  } catch {
    const saved = await cache.match('/' + lang + '/');
    if (saved) return saved;
    const [title, body] = offline[lang];
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title><body style="font-family:system-ui;margin:0;padding:2rem 1rem;background:#fbf8f1;color:#2c3a2b"><h1>' + title + '</h1><p>' + body + '</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
async function files(request, revalidate) {
  const cache = await caches.open(FILES), saved = await cache.match(request);
  const fresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; });
  if (saved) { if (revalidate) fresh.catch(() => {}); return saved; }
  return fresh;
}
self.addEventListener('fetch', (event) => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && !url.search) { const match = HOME.exec(url.pathname); if (match) event.respondWith(home(request, match[1])); return; }
  if (STATIC.test(url.pathname)) event.respondWith(files(request, false));
  else if (PHOTOS.test(url.pathname)) event.respondWith(files(request, true));
});
