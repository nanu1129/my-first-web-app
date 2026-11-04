// Service Worker: オフラインでも学習でき、2回目からはすぐに開けるようにする
// 方針:
// - ページ(HTML)とバージョンの付いていないファイルは「ネットワーク優先・失敗時はキャッシュ」。常に最新版を取りにいく
// - ?v= の付いたJS・CSS・データは、中身が変わるとバージョンが上がる。キャッシュにあればそれを使い(速い)、
//   なければ取得して保存する。同じファイルの古いバージョンは、そのときに掃除する
const CACHE = 'manabit-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('manabit-') && k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

async function store(cache, req, res) {
  await cache.put(req, res.clone());
  const url = new URL(req.url);
  if (!url.search) return;
  const keys = await cache.keys();
  await Promise.all(keys.map((k) => {
    const ku = new URL(k.url);
    return (ku.pathname === url.pathname && ku.search !== url.search) ? cache.delete(k) : null;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // 外部(フォント・Firebase)はブラウザに任せる
  const versioned = /(^|&)v=/.test(url.search.slice(1));

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (versioned) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await store(cache, req, res);
      return res;
    }
    try {
      const res = await fetch(req);
      if (res.ok) await store(cache, req, res);
      return res;
    } catch (err) {
      const hit = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('./') || await cache.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
