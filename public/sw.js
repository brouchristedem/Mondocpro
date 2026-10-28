/* mondocpro : fonctionne aussi sans connexion une fois le site chargé. */
const VERSION = 'mondocpro-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const r = e.request
  const url = new URL(r.url)
  if (r.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (r.mode === 'navigate') {
    // page : le réseau d'abord (toujours la dernière version), la copie en secours
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(VERSION).then(k => k.put('/', c)); return res })
      .catch(() => caches.match('/').then(m => m || Response.error())))
    return
  }
  // fichiers du site : la copie tout de suite, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(r)
    const net = fetch(r).then(res => { if (res.ok) cache.put(r, res.clone()); return res }).catch(() => hit)
    return hit || net
  }))
})
