// バージョン(キャッシュ破棄用の ?v=N)の一貫性チェック。
// 規則(SPEC「Versioning / caching」):
//   - js/version.js の APP_VERSION = "N" が唯一の正
//   - js/**/*.js のすべての相対 import 指定子は "./x.js?v=N" / "../x.js?v=N"(同じ N)
//   - index.html は style.css?v=N と js/app.js?v=N を参照する(ローカルの .css/.js はすべて ?v=N)
//   - sw.js は const VERSION = "N" で、index.html・CSS・マニフェストが参照するファイルと
//     js/**/*.js をすべて(同じ URL で)事前キャッシュし、存在しないファイルは載せない
// ap-study/ は別アプリなので対象外。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();
const posix = (p) => p.split(path.sep).join("/");

const versionSrc = read("js/version.js");
const versionMatch = /export\s+const\s+APP_VERSION\s*=\s*"(\d+)"/.exec(versionSrc);
const APP_VERSION = versionMatch?.[1];
const RULE = `APP_VERSION in js/version.js is "${APP_VERSION}"`;

function jsFiles(dir = "js") {
  const out = [];
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix(path.join(dir, ent.name));
    if (ent.isDirectory()) out.push(...jsFiles(rel));
    else if (ent.name.endsWith(".js")) out.push(rel);
  }
  return out.sort();
}

// import/export の指定子(静的・動的・副作用のみ)を行番号付きで取り出す
function specifiers(src) {
  const out = [];
  const patterns = [
    /\b(?:import|export)\s[^;]*?\bfrom\s*(["'])([^"']+)\1/g,
    /\bimport\s*(["'])([^"']+)\1/g,
    /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      out.push({ spec: m[2], line: src.slice(0, m.index + m[0].length).split("\n").length });
    }
  }
  return out;
}

const splitQuery = (u) => {
  const i = u.indexOf("?");
  return i < 0 ? [u, ""] : [u.slice(0, i), u.slice(i)];
};

// sw.js をブラウザ外で評価して VERSION / CACHE / ASSETS を読む
function loadSW() {
  const noop = () => {};
  const ctx = {
    self: { location: { href: "https://example.test/my-first-web-app/sw.js", origin: "https://example.test" }, addEventListener: noop, skipWaiting: noop },
    URL, Request: class {}, Response: { error: noop }, caches: {}, fetch: noop, setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  return vm.runInContext(`${read("sw.js")}\n;({ VERSION, CACHE, ASSETS: [...ASSETS] })`, ctx);
}

// ルートからの相対パス(./x) → リポジトリ内のファイル
const assetFile = (u) => {
  const [p] = splitQuery(u.replace(/^\.\//, ""));
  return p === "" ? "index.html" : p;
};

const fail = (title, problems) => {
  if (problems.length > 0) assert.fail(`${title}\n  - ${problems.join("\n  - ")}\n  (${RULE})`);
};

test("js/version.js exports APP_VERSION as a numeric string", () => {
  assert.ok(APP_VERSION, `js/version.js must contain: export const APP_VERSION = "N";`);
});

test("every relative import in js/**/*.js uses ?v=APP_VERSION and resolves to a file", () => {
  const problems = [];
  for (const file of jsFiles()) {
    for (const { spec, line } of specifiers(read(file))) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const [p, q] = splitQuery(spec);
      if (q !== `?v=${APP_VERSION}`) {
        problems.push(`${file}:${line} import "${spec}" must end with "?v=${APP_VERSION}"${q ? ` (found "${q}")` : " (missing ?v)"}`);
      }
      const target = posix(path.normalize(path.join(path.dirname(file), p)));
      if (!exists(target)) problems.push(`${file}:${line} import "${spec}" points to ${target}, which does not exist`);
    }
  }
  fail("Relative import specifiers are out of sync:", problems);
});

test("index.html references its local CSS/JS with ?v=APP_VERSION", () => {
  const html = read("index.html");
  const problems = [];
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const local = refs.filter((u) => !/^(?:[a-z]+:|\/\/|#)/i.test(u));
  for (const u of local) {
    const [p, q] = splitQuery(u);
    if (/\.(?:css|js)$/.test(p) && q !== `?v=${APP_VERSION}`) {
      problems.push(`index.html references "${u}"; it must be "${p}?v=${APP_VERSION}"`);
    }
    if (!exists(p.replace(/^\.\//, ""))) problems.push(`index.html references "${u}", but ${p} does not exist`);
  }
  for (const required of ["style.css", "js/app.js"]) {
    if (!local.some((u) => splitQuery(u)[0].replace(/^\.\//, "") === required)) {
      problems.push(`index.html must reference ${required}?v=${APP_VERSION}`);
    }
  }
  fail("index.html is out of sync:", problems);
});

test("sw.js VERSION and cache name match APP_VERSION", () => {
  const sw = loadSW();
  assert.equal(sw.VERSION, APP_VERSION, `sw.js has const VERSION = "${sw.VERSION}" but ${RULE}; bump sw.js together with js/version.js`);
  assert.equal(sw.CACHE, `workout-${APP_VERSION}`, `sw.js cache name must be "workout-${APP_VERSION}" (activate deletes only "workout-*" caches)`);
});

test("sw.js precaches exactly what the app loads, and every precached file exists", () => {
  const { ASSETS } = loadSW();
  const problems = [];
  const set = new Set(ASSETS);
  if (set.size !== ASSETS.length) problems.push(`sw.js ASSETS has duplicates: ${ASSETS.filter((a, i) => ASSETS.indexOf(a) !== i).join(", ")}`);
  for (const a of ["./", "./index.html"]) if (!set.has(a)) problems.push(`sw.js ASSETS must include "${a}" (offline shell)`);

  for (const a of ASSETS) {
    const file = assetFile(a);
    if (!exists(file)) problems.push(`sw.js ASSETS lists "${a}" but ${file} does not exist (cache.addAll would reject and the SW would never install)`);
    const [p, q] = splitQuery(a);
    if (/\.(?:css|js)$/.test(p) && q !== `?v=${APP_VERSION}`) problems.push(`sw.js ASSETS entry "${a}" must be "${p}?v=${APP_VERSION}"`);
    if (a.includes("ap-study")) problems.push(`sw.js must not precache the sibling app: "${a}"`);
  }
  // すべての JS モジュールが同じ URL で事前キャッシュされている
  for (const f of jsFiles()) {
    const url = `./${f}?v=${APP_VERSION}`;
    if (!set.has(url)) problems.push(`${f} exists but sw.js ASSETS lacks "${url}" (it would be missing offline)`);
  }
  // index.html が参照するローカルファイル
  const html = read("index.html");
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const u = m[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(u)) continue;
    const norm = u.startsWith("./") ? u : `./${u}`;
    if (!set.has(norm)) problems.push(`index.html references "${u}" but sw.js ASSETS lacks "${norm}"`);
  }
  // CSS の url() が参照するファイル(フォントなど)
  for (const css of ["style.css", "session.css"].filter(exists)) {
    for (const m of read(css).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
      const u = m[2];
      if (/^(?:[a-z]+:|\/\/|#)/i.test(u)) continue;
      const norm = u.startsWith("./") ? u : `./${u}`;
      if (!set.has(norm)) problems.push(`${css} references url(${u}) but sw.js ASSETS lacks "${norm}"`);
    }
  }
  // マニフェストのアイコン
  const manifest = JSON.parse(read("manifest.webmanifest"));
  if (!set.has("./manifest.webmanifest")) problems.push(`sw.js ASSETS must include "./manifest.webmanifest"`);
  for (const icon of manifest.icons ?? []) {
    const norm = icon.src.startsWith("./") ? icon.src : `./${icon.src}`;
    if (!exists(assetFile(norm))) problems.push(`manifest.webmanifest icon ${icon.src} does not exist`);
    if (!set.has(norm)) problems.push(`manifest.webmanifest icon ${icon.src} is not in sw.js ASSETS`);
  }
  fail("sw.js precache list is out of sync:", problems);
});

test("the manifest has PNG icons (any + maskable) and matching theme colours", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  const png = (m.icons ?? []).filter((i) => i.type === "image/png");
  assert.ok(png.some((i) => i.sizes === "192x192" && i.purpose === "any"), "manifest needs a 192x192 PNG icon (purpose any)");
  assert.ok(png.some((i) => i.sizes === "512x512" && i.purpose === "any"), "manifest needs a 512x512 PNG icon (purpose any)");
  assert.ok(png.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), "manifest needs a 512x512 maskable PNG icon");
  assert.ok(!(m.icons ?? []).some((i) => /any maskable|maskable any/.test(i.purpose ?? "")), `"any maskable" on one icon is discouraged`);
  assert.equal(m.id, "./");
  assert.equal(m.theme_color, "#111319");
  assert.equal(m.background_color, "#111319");
  assert.ok(exists("icon-180.png"), "icon-180.png (apple-touch-icon) must exist");
  for (const f of ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    assert.equal(buf.toString("latin1", 1, 4), "PNG", `${f} is not a PNG`);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const size = Number(/(\d+)\.png$/.exec(f)[1]);
    assert.deepEqual([w, h], [size, size], `${f} must be ${size}x${size}`);
  }
});
