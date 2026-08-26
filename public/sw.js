const CACHE_NAME = "picsecure-renew-shell-v056";
const APP_ASSETS = [
  "/manifest.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/pwa-maskable-192.png",
  "/pwa-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put("/", response.clone()));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/");
          return cached || new Response(
            "<!doctype html><meta name=viewport content='width=device-width'><meta name=theme-color content='#07111b'><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#07090e;color:#e9f8fa;font:16px system-ui}.card{max-width:420px;padding:28px;text-align:center}small{display:block;margin-top:10px;color:#7d8b9d}</style><div class=card><b>PicSecure Renew is offline</b><small>Reconnect once, then your local vault will open normally.</small></div>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/pwa-") || url.pathname.includes("favicon") || url.pathname.includes("apple-touch")) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});
