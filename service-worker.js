const CACHE_NAME = "focus-oyl-local-v39";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/memory-core.js",
  "/time-core.js",
  "/ocr-engine.js",
  "/native-bridge.js",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/node_modules/tesseract.js/dist/tesseract.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;

  if (url.pathname.startsWith("/node_modules/") || url.pathname.startsWith("/ocr-data/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (event.request.mode === "navigate" || isCoreAsset(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/#timeline";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);
        if (existing) {
          if ("navigate" in existing) existing.navigate(targetUrl);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") return cache.match("/index.html");
    throw new Error("Focus Oyl asset is not available offline.");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

function isCoreAsset(pathname) {
  return pathname === "/"
    || pathname === "/index.html"
    || pathname === "/service-worker.js"
    || pathname === "/manifest.webmanifest"
    || pathname.endsWith(".js")
    || pathname.endsWith(".css")
    || pathname.endsWith(".webmanifest");
}
