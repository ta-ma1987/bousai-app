const CACHE_NAME = "bousai-app-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/map.js",
  "./js/warning.js",
  "./js/checklist.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// アプリの外殻(HTML/CSS/JS)は「ネットワーク優先」にし、オフライン時のみキャッシュへ
// フォールバックする。地図タイルや警報APIなど他オリジンへのリクエストは素通しする。
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellRequest = url.origin === self.location.origin;
  if (!isShellRequest) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
