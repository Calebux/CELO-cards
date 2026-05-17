// Action Order Service Worker — v3
// Caches static assets so repeat MiniPay visits load from device, not network.

const CACHE = "ao-v3";

// Critical game assets pre-cached on SW install so first gameplay has zero image pop-in.
// Paths must match exactly what the browser requests (URL-encoded for paths with spaces).
const PRECACHE = [
  // ── Shell ─────────────────────────────────────────────────────────────────
  "/material-icons.woff2",
  "/new-assets/landing-hero.webp",
  "/new-assets/fighters-energy-sm.webp",

  // ── Card images (played during every match) ────────────────────────────────
  "/cards/storm_kick.webp",
  "/cards/power_punch.webp",
  "/cards/direct_impact.webp",
  "/cards/finisher.webp",
  "/cards/guard_stance.webp",
  "/cards/stability.webp",
  "/cards/anticipation.webp",
  "/cards/mind_game.webp",
  "/cards/evasion.webp",
  "/cards/pressure_advance.webp",
  "/cards/disrupt.webp",
  "/cards/berserk_surge.webp",
  "/cards/run_away.webp",
  "/cards/inner_focus.webp",
  "/cards/javelin_dive.webp",
  "/cards/aerial_spear_fist.webp",

  // ── Premium / market cards ──────────────────────────────────────────────────
  "/cards/market/rko.webp",
  "/cards/market/go_to_hell.webp",
  "/cards/market/headbutt.webp",
  "/cards/market/darkness_repellant.webp",
  "/cards/market/no_drain.webp",
  "/cards/market/bite.webp",
  "/bad-cards/phantombreak.webp",
  "/bad-cards/reversaledge.webp",
  "/bad-cards/cage.webp",
  "/bad-cards/ethereal_form.webp",
  "/bad-cards/fire.webp",
  "/bad-cards/grab.webp",
  "/bad-cards/gravity_well.webp",
  "/bad-cards/halo_knee_jab.webp",
  "/bad-cards/halo_shield.webp",
  "/bad-cards/jaw_breaker.webp",
  "/bad-cards/lightning.webp",
  "/bad-cards/shadow_bind.webp",
  "/bad-cards/downslide.webp",

  // ── Arena backgrounds (all 25 matchup combos) ──────────────────────────────
  "/arena-backgrounds/arena_kaira_kaira.webp",
  "/arena-backgrounds/arena_kaira_kenji.webp",
  "/arena-backgrounds/arena_kaira_riven.webp",
  "/arena-backgrounds/arena_kaira_zane.webp",
  "/arena-backgrounds/arena_kaira_elara.webp",
  "/arena-backgrounds/arena_kenji_kenji.webp",
  "/arena-backgrounds/arena_kenji_kaira.webp",
  "/arena-backgrounds/arena_kenji_riven.webp",
  "/arena-backgrounds/arena_kenji_zane.webp",
  "/arena-backgrounds/arena_kenji_elara.webp",
  "/arena-backgrounds/arena_riven_riven.webp",
  "/arena-backgrounds/arena_riven_kaira.webp",
  "/arena-backgrounds/arena_riven_kenji.webp",
  "/arena-backgrounds/arena_riven_zane.webp",
  "/arena-backgrounds/arena_riven_elara.webp",
  "/arena-backgrounds/arena_zane_zane.webp",
  "/arena-backgrounds/arena_zane_kenji.webp",
  "/arena-backgrounds/arena_zane_riven.webp",
  "/arena-backgrounds/arena_zane_kaira.webp",
  "/arena-backgrounds/arena_zane_elara.webp",
  "/arena-backgrounds/arena_elara_elara.webp",
  "/arena-backgrounds/arena_elara_riven.webp",
  "/arena-backgrounds/arena_elara_zane.webp",
  "/arena-backgrounds/arena_elara_kaira.webp",
  "/arena-backgrounds/arena_elara_kenji.webp",

  // ── Character portraits (URL-encoded for paths that contain spaces) ─────────
  "/characters/characters%20/Adobe%20Express%20-%20file%20(4).webp",
  "/characters/characters%20/Adobe%20Express%20-%20file%20(6).webp",
  "/characters/characters%20/zane_portrait.webp",
  "/Characters%20standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
  "/Characters%20standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
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
