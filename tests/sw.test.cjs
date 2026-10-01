// Service Worker の結合テスト(Playwright / Chromium)。
// 実行: NODE_PATH=$(npm root -g) node --test tests/
// GitHub Pages と同じく /my-first-web-app/ 配下で配信し、隣に ap-study/ がある状態を再現して、
// 事前キャッシュ・他アプリのキャッシュ保護・エラー応答を保存しないこと・更新の手順(SKIP_WAITING)・
// オフライン時のページ遷移とファイル取得を確認する。
// Playwright が無い、または事前キャッシュ対象のファイルがまだ揃っていない場合はスキップする。
// SW_TEST_REPO=<dir> で別のディレクトリ(作業コピー)を対象にできる。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO = path.resolve(process.env.SW_TEST_REPO || path.join(__dirname, ".."));
const BASE_PATH = "/my-first-web-app/";

let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* スキップ */ }

function loadSW(code) {
  const noop = () => {};
  const ctx = {
    self: { location: { href: `https://example.test${BASE_PATH}sw.js`, origin: "https://example.test" }, addEventListener: noop },
    URL, Request: class {}, Response: { error: noop }, caches: {}, fetch: noop, setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  return vm.runInContext(`${code}\n;({ VERSION, CACHE, ASSETS: [...ASSETS] })`, ctx);
}

const swSource = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
const SW = loadSW(swSource);
const assetPath = (u) => {
  const p = u.replace(/^\.\//, "").split("?")[0];
  return path.join(REPO, p === "" ? "index.html" : p);
};
const missing = SW.ASSETS.filter((u) => !fs.existsSync(assetPath(u)));

// 現在公開中の旧世代 SW(v13 まで)と同じ振る舞い: 即時 skipWaiting、全キャッシュ削除、SKIP_WAITING 非対応
const LEGACY_SW = `
const CACHE = "workout-v13";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./__sw-test.html"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => { if (e.request.method !== "GET") return; e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request))); });
`;

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2",
};

function startServer(state) {
  const sockets = new Set();
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let p = decodeURIComponent(url.pathname);
    state.hits.push(p + url.search);
    if (!p.startsWith(BASE_PATH)) { res.writeHead(404); return res.end("nf"); }
    p = p.slice(BASE_PATH.length);
    if (p === "__sw-test.html") {
      res.writeHead(200, { "content-type": MIME[".html"] });
      return res.end("<!doctype html><title>sw test</title><p>test page</p>");
    }
    if (p === "__flaky.js") {
      state.flaky = (state.flaky ?? 0) + 1;
      if (state.flaky === 1) { res.writeHead(503, { "content-type": "text/plain" }); return res.end("Service Unavailable"); }
      res.writeHead(200, { "content-type": MIME[".js"] });
      return res.end("export const ok = true;");
    }
    if (p === "sw.js" && state.legacy) {
      res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-cache" });
      return res.end(LEGACY_SW);
    }
    if (p === "sw.js" && state.bump) {
      res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-cache" });
      return res.end(swSource.replace(/const VERSION = "[^"]*";/, `const VERSION = "${state.bump}";`));
    }
    if (p === "" || p.endsWith("/")) p += "index.html";
    const f = path.join(REPO, p);
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    // GitHub Pages と同じく max-age=600(事前キャッシュが HTTP キャッシュを通らないことの確認用)
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "max-age=600" });
    fs.createReadStream(f).pipe(res);
  });
  srv.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({
    srv,
    port: srv.address().port,
    stop: () => new Promise((r) => { for (const s of sockets) s.destroy(); srv.close(() => r()); }),
  })));
}

const skip = !chromium
  ? "playwright is not available (run with NODE_PATH=$(npm root -g))"
  : missing.length > 0
    ? `precache targets are missing, so the SW cannot install yet: ${missing.join(", ")}`
    : false;

test("service worker: precache, sibling-app isolation, ok-only caching, update protocol, offline", { skip, timeout: 90000 }, async () => {
  const state = { hits: [], bump: null };
  const server = await startServer(state);
  const origin = `http://127.0.0.1:${server.port}`;
  const base = `${origin}${BASE_PATH}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`${base}__sw-test.html`);

    // 他アプリのキャッシュと旧世代のキャッシュを用意してから登録する
    await page.evaluate(async () => {
      await (await caches.open("manabit-v1")).put("/my-first-web-app/ap-study/app.js", new Response("ap"));
      await (await caches.open("workout-v13")).put("/my-first-web-app/old.js", new Response("old"));
    });
    const firstVersion = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const sw = reg.active;
      if (sw.state !== "activated") await new Promise((r) => sw.addEventListener("statechange", () => sw.state === "activated" && r()));
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        sw.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      });
    });
    assert.deepEqual(firstVersion, { type: "VERSION", version: SW.VERSION });

    let keys = await page.evaluate(() => caches.keys());
    assert.ok(keys.includes(SW.CACHE), `cache ${SW.CACHE} missing: ${keys}`);
    assert.ok(keys.includes("manabit-v1"), "ap-study cache (manabit-v1) must survive activation");
    assert.ok(!keys.includes("workout-v13"), "old workout cache must be deleted");

    // 事前キャッシュの内容は ASSETS と一致
    const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((r) => r.url), SW.CACHE);
    const expected = SW.ASSETS.map((u) => new URL(u, base).href);
    assert.deepEqual([...cached].sort(), [...expected].sort());

    // 初回は clients.claim() しない → 再読み込みで制御下に入る
    await page.reload();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);

    // エラー応答は保存しない(一時的な 503 が次回以降も返り続けない)
    const flaky = await page.evaluate(async (name) => {
      const first = (await fetch("__flaky.js")).status;
      const afterError = !!(await (await caches.open(name)).match("__flaky.js"));
      const second = (await fetch("__flaky.js")).status;
      await new Promise((r) => setTimeout(r, 200));
      const afterOk = !!(await (await caches.open(name)).match("__flaky.js"));
      const notFound = (await fetch("__missing.js")).status;
      await new Promise((r) => setTimeout(r, 200));
      const cached404 = !!(await (await caches.open(name)).match("__missing.js"));
      return { first, afterError, second, afterOk, notFound, cached404 };
    }, SW.CACHE);
    assert.deepEqual(flaky, { first: 503, afterError: false, second: 200, afterOk: true, notFound: 404, cached404: false });

    // ap-study への要求には関与しない(このアプリのキャッシュに入らない)
    const ap = await page.evaluate(async (name) => {
      const res = await fetch("ap-study/index.html");
      await new Promise((r) => setTimeout(r, 200));
      const keys = (await (await caches.open(name)).keys()).map((r) => r.url);
      return { status: res.status, leaked: keys.filter((u) => u.includes("/ap-study")) };
    }, SW.CACHE);
    assert.equal(ap.leaked.length, 0, `ap-study responses were cached: ${ap.leaked}`);

    // 更新: 新しい SW は待機し、SKIP_WAITING で有効化 → controllerchange → 古い workout キャッシュだけ削除
    state.bump = "999";
    const update = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
      const installing = reg.installing || reg.waiting;
      if (installing && installing.state !== "installed") {
        await new Promise((r) => installing.addEventListener("statechange", () => ["installed", "redundant"].includes(installing.state) && r()));
      }
      const waiting = !!reg.waiting;
      const ask = (sw) => new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data.version);
        sw.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      });
      const before = await ask(navigator.serviceWorker.controller);
      const changed = new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await changed;
      const after = await ask(navigator.serviceWorker.controller);
      // activate の後片付け(古いキャッシュの削除)は controllerchange の後に終わる
      let keys = await caches.keys();
      for (let i = 0; i < 50 && keys.length > 2; i++) {
        await new Promise((r) => setTimeout(r, 100));
        keys = await caches.keys();
      }
      return { waiting, before, after, keys };
    });
    assert.equal(update.waiting, true, "the new worker must wait for SKIP_WAITING");
    assert.equal(update.before, SW.VERSION);
    assert.equal(update.after, "999");
    assert.ok(update.keys.includes("workout-999"));
    assert.ok(!update.keys.includes(SW.CACHE), "previous workout cache must be deleted");
    assert.ok(update.keys.includes("manabit-v1"), "ap-study cache must survive the update");

    // 事前キャッシュは HTTP キャッシュを通さずに取得している(cache: "reload")
    const refetched = state.hits.filter((h) => h.includes("?v=999"));
    assert.ok(refetched.length > 0, "the update must fetch its versioned assets from the network");

    // オフライン: サーバーを止める
    await server.stop();
    const nav = await page.goto(base);
    assert.equal(nav.status(), 200);
    assert.match(await page.content(), /<html/i);
    const offline = await page.evaluate(async () => {
      const js = await fetch("js/app.js?v=999");
      let missingResult;
      try { const r = await fetch("js/does-not-exist.js"); missingResult = `status ${r.status} ${r.headers.get("content-type")}`; } catch { missingResult = "network-error"; }
      return { jsType: js.headers.get("content-type"), jsOk: js.ok, missingResult };
    });
    assert.equal(offline.jsOk, true);
    assert.match(offline.jsType, /javascript/);
    assert.equal(offline.missingResult, "network-error", "a failed asset request must not be answered with HTML");
    // オフラインで ap-study を開いても、このアプリの HTML は返さない
    let apOffline = null;
    try { apOffline = await page.goto(`${base}ap-study/`); } catch { apOffline = "error"; }
    const shellTitle = /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(path.join(REPO, "index.html"), "utf8"))?.[1];
    assert.ok(apOffline === "error" || (await page.title()) !== shellTitle, "ap-study must not get the workout shell");
    assert.deepEqual(pageErrors.filter((e) => !/Failed to fetch/.test(e)), []);
    await ctx.close();
  } finally {
    await browser.close();
    await server.stop().catch(() => {});
  }
});

test("service worker: upgrading from the legacy worker (workout-vNN) activates without waiting and keeps ap-study's cache", { skip, timeout: 60000 }, async () => {
  const state = { hits: [], bump: null, legacy: true };
  const server = await startServer(state);
  const base = `http://127.0.0.1:${server.port}${BASE_PATH}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();
    await page.goto(`${base}__sw-test.html`);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
      return reg.active.state;
    });
    // 旧 SW が動いている状態で ap-study を使った想定
    await page.evaluate(async () => (await caches.open("manabit-v1")).put("/my-first-web-app/ap-study/app.js", new Response("ap")));
    state.legacy = false;
    const result = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const changed = new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
      await reg.update();
      await changed; // SKIP_WAITING を送らなくても有効化される
      let keys = await caches.keys();
      for (let i = 0; i < 50 && keys.includes("workout-v13"); i++) {
        await new Promise((r) => setTimeout(r, 100));
        keys = await caches.keys();
      }
      return { keys, waiting: !!reg.waiting };
    });
    assert.equal(result.waiting, false);
    assert.ok(result.keys.includes(SW.CACHE), result.keys.join(","));
    assert.ok(!result.keys.includes("workout-v13"), "legacy cache must be deleted");
    assert.ok(result.keys.includes("manabit-v1"), "ap-study cache must be kept");
    await ctx.close();
  } finally {
    await browser.close();
    await server.stop().catch(() => {});
  }
});
