// Action Order Service Worker — v2
// Caches static assets so repeat MiniPay visits load from device, not network.

const CACHE = "ao-v2";

// Static assets to pre-cache on install
const PRECACHE = [
  "/material-icons.woff2",
  "/new-assets/landing-hero.webp",
  "/new-assets/fighters-energy-sm.webp",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache strategy:
//   Fonts / static images / sounds → Cache-first (immutable)
//   _next/static chunks            → Cache-first (content-hashed filenames)
//   API routes                     → Network-only
//   HTML pages                     → Network-first with cache fallback
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (RPC calls etc.)
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes — always network
  if (url.pathname.startsWith("/api/")) return;

  // Static chunks / fonts / images — cache-first
  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".webm") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.startsWith("/Sounds/") ||
    url.pathname.startsWith("/arena-backgrounds/") ||
    url.pathname.startsWith("/cards/") ||
    url.pathname.startsWith("/bad-cards/") ||
    url.pathname.startsWith("/new-assets/") ||
    url.pathname.startsWith("/characters/") ||
    url.pathname.startsWith("/Characters");

  if (isImmutable) {
    e.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // HTML pages — network-first, cache fallback
  if (request.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
