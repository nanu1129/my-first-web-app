// オフライン対応の Service Worker。
//
// ■ バージョン
//   VERSION は js/version.js の APP_VERSION と同じ値にする(tests/version.test.mjs が検査)。
//   キャッシュ名は `workout-${VERSION}`。有効化時に消すのは「workout-」で始まる古いキャッシュだけで、
//   同じオリジンの別アプリ(ap-study の manabit-v1 など)のキャッシュには触れない。
//
// ■ 扱うリクエスト
//   このアプリの範囲(sw.js と同じ階層以下)への同一オリジンの GET だけ。
//   ただし <scope>ap-study/ 以下は別アプリなので一切関与しない(ブラウザの通常の処理に任せる)。
//   - ページ遷移(navigate): ネットワーク優先(HTTP キャッシュを再検証、約3.5秒で打ち切り)。
//     失敗・タイムアウト・5xx のときだけキャッシュ済みの index.html を返す。遷移の結果は保存しない。
//   - それ以外(JS/CSS/画像/フォント): キャッシュ優先。無ければ取得し、正常(200番台・同一オリジン)
//     な応答だけ保存する。取得に失敗したら通常のネットワークエラーを返す(HTML で代用しない)。
//   - インストール時は HTTP キャッシュを通さず(cache: "reload")に ASSETS を取得して保存する。
//
// ■ 更新の流れ(ページ側との約束)
//   1. 新しい sw.js はインストール後「待機中(registration.waiting)」になる。
//   2. ページは registration.waiting(または updatefound → installed)を見つけたら
//      「新しいバージョンがあります [更新]」を表示する。
//   3. [更新] で waiting.postMessage({ type: "SKIP_WAITING" }) を送ると、この SW が有効化される。
//   4. ページは navigator.serviceWorker の controllerchange で一度だけ再読み込みする。
//      (clients.claim() は呼ばないので、初回インストール時には controllerchange は起きない)
//   その他のメッセージ: { type: "GET_VERSION" } → { type: "VERSION", version } を
//   MessageChannel のポート(無ければ送信元)に返す。
//   例外: 旧世代(キャッシュ名 workout-vNN、SKIP_WAITING 非対応)からの更新時だけは待機せず有効化し、
//   開いている(ap-study 以外の)ページを claim して開き直す(旧ページは自分では再読み込みしないため)。
const VERSION = "14";
const CACHE_PREFIX = "workout-";
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const NAV_TIMEOUT_MS = 3500;

const v = (path) => `${path}?v=${VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  v("./style.css"),
  v("./session.css"),
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./fonts/bebas-neue-latin-400.woff2",
  v("./js/app.js"),
  v("./js/version.js"),
  v("./js/util.js"),
  v("./js/storage.js"),
  v("./js/planner.js"),
  v("./js/stats.js"),
  v("./js/charts.js"),
  v("./js/icons.js"),
  v("./js/timer.js"),
  v("./js/session.js"),
  v("./js/views/menu.js"),
  v("./js/views/log.js"),
  v("./js/views/progress.js"),
  v("./js/views/settings.js"),
];

const SCOPE_PATH = new URL("./", self.location.href).pathname;
const SIBLING_APP = `${SCOPE_PATH}ap-study`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
    const keys = await caches.keys();
    if (keys.some((k) => /^workout-v\d+$/.test(k))) await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const fromLegacy = keys.some((k) => /^workout-v\d+$/.test(k));
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    if (!fromLegacy) return;
    // 旧世代のページは更新の案内も controllerchange での再読み込みも持たないので、こちらから開き直して
    // 最初の起動で新しい版に切り替える(隣のアプリ ap-study/ のページには触れない)
    // 旧世代の SW が制御していたページだけ(初めて開いたページは含まれない)
    const wins = await self.clients.matchAll({ type: "window" });
    await self.clients.claim();
    await Promise.all(wins
      .filter((c) => !new URL(c.url).pathname.startsWith(SIBLING_APP))
      .map((c) => c.navigate(c.url).catch(() => null)));
  })());
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "GET_VERSION") {
    const reply = { type: "VERSION", version: VERSION };
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

function isOwnRequest(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return false;
  return !(url.pathname === SIBLING_APP || url.pathname.startsWith(`${SIBLING_APP}/`));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!isOwnRequest(req)) return;
  event.respondWith(req.mode === "navigate" ? handleNavigation(req) : handleAsset(event));
});

async function cachedShell() {
  const cache = await caches.open(CACHE);
  return (await cache.match("./index.html")) || (await cache.match("./"));
}

// ページ遷移: ネットワーク優先。オフライン・タイムアウト・5xx のときはキャッシュのアプリ本体
async function handleNavigation(req) {
  let netReq = req;
  try { netReq = new Request(req, { cache: "no-cache" }); } catch { /* 古いブラウザはそのまま */ }
  const network = fetch(netReq).then((res) => {
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return res;
  });
  network.catch(() => {});
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, NAV_TIMEOUT_MS, null); });
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch { /* 下のキャッシュへ */ } finally {
    clearTimeout(timer);
  }
  const shell = await cachedShell();
  return shell || network;
}

// 静的ファイル: キャッシュ優先。取得した正常な応答だけを保存する
async function handleAsset(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(req);
  } catch {
    return Response.error();
  }
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    try { event.waitUntil(cache.put(req, copy).catch(() => {})); } catch { /* 応答は返せるので無視 */ }
  }
  return res;
}
