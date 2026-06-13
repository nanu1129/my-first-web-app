// オフライン対応の Service Worker。
// アプリ更新時は CACHE のバージョン(v?)を上げると古いキャッシュを破棄する。
const CACHE = "workout-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=10",
  "./manifest.webmanifest",
  "./icon.svg",
  "./js/app.js?v=10",
  "./js/planner.js?v=10",
  "./js/icons.js?v=10",
  "./js/stats.js?v=10",
  "./js/charts.js?v=10",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 同一オリジンは cache-first(無ければ取得してキャッシュ)。外部(フォント等)は素通し。
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
