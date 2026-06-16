# Service Worker Cache

A service worker pre-caches static assets on install to reduce repeat load times.
Game audio files and character sprites are included in the precache manifest.
Cache is versioned so stale assets are purged on each deployment.
