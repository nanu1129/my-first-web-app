// Service Worker: オフラインでも学習できるようにする
// 方針: 同一オリジンのGETは「ネットワーク優先・失敗時はキャッシュ」。
// 常に最新版を取りにいき、電波がないときだけ前回取得した内容で動かす。
const CACHE = 'manabit-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // 外部(フォント・Firebase)はブラウザに任せる

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) {
        await cache.put(req, res.clone());
        // 同じファイルの古いバージョン(?v=旧番号)を掃除する
        if (url.search) {
          const keys = await cache.keys();
          await Promise.all(keys.map((k) => {
            const ku = new URL(k.url);
            return (ku.pathname === url.pathname && ku.search !== url.search) ? cache.delete(k) : null;
          }));
        }
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('./') || await cache.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
