/* Pratirakshak service worker — offline mode (SPEC U5, S11).
   Network-first for the snapshot (/data/*), cache-first for built assets; network-first for navigations with an app-shell fallback.
   Bump VERSION when the snapshot changes. */
const VERSION = "pratirakshak-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await cache.addAll(["/", "/data/meta.json", "/data/manifest.json"]);
      try {
        const manifest = await (await fetch("/data/manifest.json")).json();
        await cache.addAll(manifest.files.map((f) => "/" + f.path));
      } catch (e) {
        /* manifest unavailable: data is cached lazily on first use */
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return; // API calls bypass the cache
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/data/")) {
    // snapshot: network-first so a fresh export always wins; the cached copy serves when offline
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});
