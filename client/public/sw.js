/**
 * Service worker: кэширует только собранные ассеты.
 *
 * Данные не кэшируются намеренно. Закэшированный счёт хуже отсутствующего: человек
 * увидел бы старые очки и поверил им. Всё под /api идёт мимо кэша всегда.
 *
 * Оболочка приложения кэшируется по принципу «сеть, потом кэш»: с сетью человек
 * получает свежую версию, без сети — хотя бы открывающееся приложение.
 */

const CACHE = 'score-shell-v1'
const SHELL = ['/', '/icon.svg', '/icon-192.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Чужие домены, не-GET и всё API — мимо кэша.
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Кладём в кэш только удачные ответы, иначе закэшируем страницу ошибки.
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        // Любой маршрут приложения — это одна и та же оболочка.
        return (await caches.match('/')) ?? Response.error()
      }),
  )
})
