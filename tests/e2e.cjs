// E2E smoke harness for the workout app (CommonJS; run with NODE_PATH=$(npm root -g)).
// Usage: node e2e.cjs <repoDir> <outDir>
// Serves repoDir over HTTP, drives the main user flows in Chromium at several
// viewports, and writes screenshots + summary.json to outDir.
// Flow (v2 IA: bottom tabs メニュー / 記録 / 進捗 / 設定):
//   first run → 設定 onboarding → preset + focus → 保存してメニュー作成 → メニュー
//   → swap ↻ → consult (きつく / 楽に / 短く / 戻す) → ⓘ tip → rest timer
//   → TODAY 記録 sheet → log saved → 記録 / 進捗 smoke → reload restores plan → export
//   → 記録: type switch changes the list → picker (pool 25 m steps, custom cardio name stays cardio)
//     → no clipped select text → draft survives reload → save → edit → 今日もこれをやる → delete + undo
//   → 進捗: charts (role=img + label) / calendar labels + day detail / badges text / metric switch / bodyweight
//   → ▶ 開始 (session): ✓ a set starts the rest timer → 記録して終了 → the log appears in 記録
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repo = path.resolve(process.argv[2] || ".");
const out = path.resolve(process.argv[3] || "./e2e-out");
fs.mkdirSync(out, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(repo, p);
      if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); return res.end("nf");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

const VIEWPORTS = [
  { name: "mobile390", width: 390, height: 844, mobile: true },
  { name: "mobile320", width: 320, height: 640, mobile: true },
  { name: "mobile375", width: 375, height: 667, mobile: true },
  { name: "mobile430", width: 430, height: 932, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false },
];

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [];
    if (doc.scrollWidth > window.innerWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : ""} right=${Math.round(r.right)}`);
          if (offenders.length >= 8) break;
        }
      }
    }
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, overflowing: doc.scrollWidth > window.innerWidth + 1, offenders };
  });
}

async function step(results, name, fn) {
  try {
    const v = await fn();
    results.steps.push({ name, ok: true, ...(v && typeof v === "object" ? { info: v } : {}) });
  } catch (e) {
    results.steps.push({ name, ok: false, error: String(e && e.message || e).slice(0, 400) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 記録フォーム・記録シートの選択リストで、どの選択肢を選んでも文字が欠けないか(B29)。欠ける選択肢の一覧を返す
async function clippedSelects(page, selector = "#log-compose .entry select") {
  return page.evaluate((selector) => {
    const c = document.createElement("canvas").getContext("2d");
    const out = [];
    for (const s of document.querySelectorAll(selector)) {
      const cs = getComputedStyle(s);
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      for (const o of s.options) {
        const need = c.measureText(o.textContent).width;
        if (need > avail + 0.5) out.push({ field: s.dataset.field ?? s.className, text: o.textContent, need: Math.round(need), avail: Math.round(avail) });
      }
    }
    return out.slice(0, 10);
  }, selector);
}

// 表示中のトーストの文言(無ければ "")
async function toastText(page) {
  const t = page.locator(".toast .toast-msg").last();
  await t.waitFor({ state: "visible", timeout: 3000 });
  return t.innerText();
}

async function runViewport(browser, base, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile,
    serviceWorkers: "block", acceptDownloads: true, timezoneId: "Asia/Tokyo", locale: "ja-JP",
  });
  const page = await ctx.newPage();
  const results = { viewport: vp.name, consoleErrors: [], pageErrors: [], steps: [], overflow: {} };
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => results.pageErrors.push(String(e.message).slice(0, 300)));
  // 外部フォントは使わないが、万一の読み込みで止まらないように遮断する
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  const shot = (n) => page.screenshot({ path: path.join(out, `${vp.name}-${n}.png`), fullPage: false });
  const full = (n) => page.screenshot({ path: path.join(out, `${vp.name}-${n}-full.png`), fullPage: true });
  const tab = (name) => page.locator(`.tab-bar .tab[data-tab="${name}"]`);
  const firstExName = () => page.locator("#menu-day .ex .ex-name").first().innerText();
  const storedLogs = () => page.evaluate(() => JSON.parse(localStorage.getItem("workout_logs") || "[]"));
  const typeSeg = (label) => page.locator("#log-compose .type-seg .seg-opt", { hasText: label });
  const entries = () => page.locator("#log-compose .entry");
  const openLogItem = async (item) => {
    const head = item.locator(".log-head");
    if (await head.getAttribute("aria-expanded") !== "true") {
      await head.click();
      await page.waitForTimeout(250); // 矢印の回転が終わってから
    }
    return (await item.getAttribute("id")).slice(4);
  };

  await step(results, "load-first-run", async () => {
    await page.goto(base + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(300);
    await shot("01-first-run"); await full("01-first-run");
    results.overflow.initial = await overflow(page);
    const hash = await page.evaluate(() => location.hash);
    assert(hash === "#settings", `first run should open settings, got ${hash}`);
    assert(await page.locator("#view-settings .welcome").isVisible(), "welcome card not visible");
    const hiddenShown = await page.evaluate(() =>
      [...document.querySelectorAll("[hidden]")].filter((e) => getComputedStyle(e).display !== "none").length);
    assert(hiddenShown === 0, `${hiddenShown} [hidden] elements are displayed`);
    return { hash };
  });

  await step(results, "preset-gym+focus", async () => {
    await page.locator(".preset-btn", { hasText: "ジム" }).first().click();
    assert(await page.locator(".preset-btn", { hasText: "ジム" }).first().getAttribute("aria-pressed") === "true", "preset not pressed");
    const chip = page.locator('.chip[data-act="focus"]').first();
    await chip.click();
    assert(await chip.getAttribute("aria-pressed") === "true", "focus chip not pressed");
    return { checked: await page.locator('input[name="equipment"]:checked').count() };
  });

  await step(results, "generate", async () => {
    await page.locator('#view-settings button[type=submit]').click();
    await page.waitForSelector("#view-menu:not([hidden]) #menu-today", { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot("02-menu"); await full("02-menu");
    results.overflow.afterGenerate = await overflow(page);
    const days = await page.locator(".day-tab").count();
    const cards = await page.locator("#menu-day .ex").count();
    assert(days > 0 && cards > 0, "no plan rendered");
    return { days, cards, toast: await toastText(page) };
  });

  await step(results, "swap-exercise", async () => {
    const btn = page.locator('#menu-day .swap-btn:not([aria-disabled="true"])').first();
    const li = btn.locator("xpath=ancestor::li[contains(@class,'ex')]");
    const id = await li.getAttribute("id");
    const before = await li.locator(".ex-name").innerText();
    await btn.click(); await page.waitForTimeout(150);
    const after = await page.locator(`#${id} .ex-name`).innerText();
    assert(before !== after, "swap did not change the exercise");
    return { before, after, toast: await toastText(page) };
  });

  await step(results, "consult-each", async () => {
    const res = {};
    for (const op of ["harder", "easier", "shorter", "reset"]) {
      await page.locator(`.consult-btn[data-op="${op}"]`).click();
      await page.waitForTimeout(150);
      res[op] = await toastText(page);
    }
    return res;
  });

  await step(results, "info-toggle", async () => {
    const b = page.locator("#menu-day .info-btn").first();
    await b.click(); await page.waitForTimeout(100);
    const expanded = await b.getAttribute("aria-expanded");
    const tipVisible = await page.locator(`#${await b.getAttribute("aria-controls")}`).isVisible();
    assert(expanded === "true" && tipVisible, "tip did not open");
    return { expanded, tipVisible };
  });

  await step(results, "rest-timer", async () => {
    await page.locator("#menu-day .rest-btn").first().click();
    await page.waitForTimeout(1300);
    const t = page.locator("#rest-timer");
    assert(await t.isVisible(), "timer not visible");
    const box = await t.boundingBox();
    const size = page.viewportSize();
    await shot("03-timer");
    const time = await page.locator("#rest-timer .rest-timer-time").innerText();
    const within = box && box.y >= 0 && box.y + box.height <= size.height && box.x >= 0 && box.x + box.width <= size.width;
    const bar = await page.locator(".tab-bar").boundingBox();
    const tabBarVisible = await page.locator(".tab-bar").isVisible();
    // タブバー(スマホは画面下、広い画面はアプリバーの中)と重ならないこと
    const clearOfTabBar = !tabBarVisible || !bar || box.y + box.height <= bar.y + 1 || box.y >= bar.y + bar.height - 1 ||
      box.x + box.width <= bar.x + 1 || box.x >= bar.x + bar.width - 1;
    const oneLineButtons = await page.evaluate(() =>
      [...document.querySelectorAll("#rest-timer [data-rest]")].every((b) => b.getBoundingClientRect().height <= 60));
    assert(within && clearOfTabBar, "timer outside the viewport or under the tab bar");
    await page.locator('#rest-timer [data-rest="+15"]').click();
    await page.locator('#rest-timer [data-rest="stop"]').click();
    await page.waitForTimeout(100);
    assert(await t.isHidden(), "終了 did not hide the timer");
    return { time, withinViewport: !!within, clearOfTabBar, oneLineButtons, box };
  });

  await step(results, "today-record-sheet", async () => {
    await page.locator('#menu-today [data-act="record"]').click();
    await page.waitForSelector("#sheet[open] .rec-row", { timeout: 3000 });
    const rows = await page.locator("#sheet .rec-row").count();
    await page.waitForTimeout(400); // 開いた直後のタップはダブルタップとして無視される
    await shot("04-record-sheet");
    results.overflow.recordSheet = await overflow(page);
    const clipped = await clippedSelects(page, "#sheet .rec-row select");
    assert(clipped.length === 0, `record sheet select text clipped: ${JSON.stringify(clipped)}`);
    const save = page.locator("#sheet .rec-save");
    await save.click();
    // 重量が未選択の種目があると確認が出る。すぐの2回目(ダブルタップ)では保存されず、少し待ってからなら保存される
    if (await page.locator("#sheet .rec-warn:not([hidden])").count()) {
      await save.click();
      assert(await page.locator("#sheet[open]").count() === 1, "a double tap skipped the unset-weight warning");
      await page.waitForTimeout(600);
      await save.click();
    }
    await page.waitForTimeout(300);
    assert(!(await page.locator("#sheet[open]").count()), "sheet still open");
    const logs = await page.evaluate(() => JSON.parse(localStorage.getItem("workout_logs") || "[]"));
    assert(logs.length === 1, `expected 1 log, got ${logs.length}`);
    const doneMark = await page.locator(".day-tab .dt-mark.is-done").count();
    results.overflow.afterRecord = await overflow(page);
    return { rows, entries: logs[0].entries.length, planDay: logs[0].planDay, doneMark, toast: await toastText(page) };
  });

  await step(results, "log-view-smoke", async () => {
    await tab("log").click(); await page.waitForTimeout(200);
    assert(await page.locator("#view-log").isVisible(), "log view hidden");
    await shot("05-log");
    results.overflow.log = await overflow(page);
    const items = await page.locator("#view-log .log-item").count();
    assert(items === 1, `expected 1 log in the history, got ${items}`);
    return { current: await tab("log").getAttribute("aria-current"), items };
  });

  await step(results, "progress-view-smoke", async () => {
    await tab("progress").click(); await page.waitForTimeout(200);
    assert(await page.locator("#view-progress").isVisible(), "progress view hidden");
    await shot("06-progress");
    results.overflow.progress = await overflow(page);
    return { stats: await page.locator("#view-progress .stat").count() };
  });

  await step(results, "reload-restores-plan", async () => {
    await tab("menu").click(); await page.waitForTimeout(150);
    const before = await firstExName();
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const hash = await page.evaluate(() => location.hash);
    const after = await firstExName();
    assert(hash === "#menu", `last tab not restored: ${hash}`);
    assert(before === after, "plan changed after reload");
    return { hash, firstExercise: after };
  });

  await step(results, "settings-export", async () => {
    await tab("settings").click(); await page.waitForTimeout(200);
    await shot("07-settings"); await full("07-settings");
    results.overflow.settings = await overflow(page);
    const b = page.locator("#export-btn");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 3000 }), b.click()]);
    const p = path.join(out, `${vp.name}-backup.json`); await dl.saveAs(p);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    assert(j.logs?.length === 1 && j.profile && j.plan, "backup is missing data");
    return { file: dl.suggestedFilename(), logs: j.logs.length, hasProfile: !!j.profile, hasPlan: !!j.plan };
  });

  // ---------- 記録画面 ----------

  await step(results, "log-type-switch", async () => {
    await tab("log").click(); await page.waitForTimeout(200);
    const chips = () => page.locator("#log-compose .pick-chip .pick-chip-text").allInnerTexts();
    await typeSeg("筋トレ").click();
    const weight = await chips();
    await typeSeg("有酸素").click(); await page.waitForTimeout(100);
    const cardio = await chips();
    assert(cardio.length > 0 && cardio.join() !== weight.join(), "type switch did not change the quick picks");
    await page.locator('#log-compose [data-act="open-picker"]').click();
    await page.waitForSelector("#sheet[open] .pick-item", { timeout: 3000 });
    const names = await page.locator("#sheet .pick-name").allInnerTexts();
    assert(names.includes("水泳(クロール)") && names.includes("水泳(平泳ぎ)") && !names.includes("ベンチプレス"), "cardio picker shows the wrong list");
    await page.waitForTimeout(400); // シートが開く動きが終わってから撮る
    await shot("10-picker");
    results.overflow.picker = await overflow(page);
    return { weight, cardio, picker: names.length };
  });

  await step(results, "log-pool-and-custom-cardio", async () => {
    await page.locator('#sheet .pick-item[data-name="水泳(クロール)"]').first().click();
    // 有酸素で一覧に無い名前を入れても筋トレに変わらない(B27)
    await page.locator("#sheet .text-input").fill("サイクリング(屋外)");
    await page.locator("#sheet .custom-add").click();
    await page.locator("#sheet .picker-add").click();
    await page.waitForTimeout(200);
    assert(await entries().count() === 2, "picker did not add 2 exercises");
    const pool = entries().filter({ hasText: "水泳(クロール)" });
    const dist = await pool.locator("select.f-distance option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean).map(Number));
    assert(dist.length > 10 && dist.every((v) => v % 25 === 0), "pool distances are not 25 m steps");
    await pool.locator("select.f-distance").selectOption("1000");
    const custom = entries().filter({ hasText: "サイクリング(屋外)" });
    assert(await custom.locator("select.f-minutes").count() === 1 && await custom.locator("select.f-weight").count() === 0,
      "custom cardio name was switched to strength");
    return { poolChoices: dist.length, firstSteps: dist.slice(0, 4) };
  });

  await step(results, "log-weight-row-no-clipping", async () => {
    await typeSeg("筋トレ").click();
    await page.locator('#log-compose [data-act="open-picker"]').click();
    await page.waitForSelector("#sheet[open] .pick-item", { timeout: 3000 });
    await page.locator('#sheet .pick-item[data-name="ベンチプレス"]').first().click();
    await page.locator("#sheet .picker-add").click();
    await page.waitForTimeout(200);
    const bench = entries().filter({ hasText: "ベンチプレス" });
    await bench.locator("select.f-weight").selectOption("102.5");
    await bench.locator("select.f-reps").selectOption("8");
    const clipped = await clippedSelects(page);
    assert(clipped.length === 0, `select text clipped: ${JSON.stringify(clipped)}`);
    const added = await page.locator("#log-compose .pick-chip.is-added .pick-chip-text").allInnerTexts();
    assert(added.includes("ベンチプレス"), `quick pick does not show the added state: ${added}`);
    const rm = await bench.locator(".entry-remove").boundingBox();
    assert(rm.width >= 44 && rm.height >= 44, "remove button smaller than 44px");
    await shot("11-log-form");
    results.overflow.logForm = await overflow(page);
    return { rows: await entries().count(), removeBox: [Math.round(rm.width), Math.round(rm.height)] };
  });

  await step(results, "log-draft-survives-reload", async () => {
    const before = await page.locator("#log-compose .entry-name").allInnerTexts();
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const after = await page.locator("#log-compose .entry-name").allInnerTexts();
    assert(before.length === 3 && before.join() === after.join(), `draft lost: ${before} → ${after}`);
    const w = await entries().filter({ hasText: "ベンチプレス" }).locator("select.f-weight").inputValue();
    assert(w === "102.5", `weight not restored (${w})`);
    return { rows: after };
  });

  await step(results, "log-save", async () => {
    const n0 = (await storedLogs()).length;
    await page.locator('#log-compose [data-act="save"]').click();
    await page.waitForTimeout(250);
    const all = await storedLogs();
    assert(all.length === n0 + 1, `expected ${n0 + 1} logs, got ${all.length}`);
    const log = all.find((l) => l.entries.some((e) => e.name === "サイクリング(屋外)"));
    const byName = Object.fromEntries(log.entries.map((e) => [e.name, e]));
    assert(byName["サイクリング(屋外)"].track === "cardio", "custom cardio saved with the wrong track");
    assert(byName["水泳(クロール)"].distance === 1000 && byName["水泳(クロール)"].unit === "m", "pool distance not saved in m");
    assert(byName["ベンチプレス"].weight === 102.5 && byName["ベンチプレス"].reps === 8, "weight row not saved");
    assert(await entries().count() === 0, "form not cleared after saving");
    assert(!(await page.evaluate(() => localStorage.getItem("workout_log_draft"))), "draft not cleared");
    return { logs: all.length, toast: await toastText(page) };
  });

  await step(results, "log-edit", async () => {
    const n0 = (await storedLogs()).length;
    const item = page.locator("#log-history .log-item").first();
    const id = await openLogItem(item);
    await shot("12-log-expanded");
    results.overflow.logExpanded = await overflow(page);
    await item.locator('[data-act="edit"]').click();
    await page.waitForTimeout(200);
    assert(await page.locator("#log-compose.is-editing").count() === 1, "form is not in edit mode");
    await entries().filter({ hasText: "ベンチプレス" }).locator("select.f-sets").selectOption("5");
    await page.locator('#log-compose [data-act="save"]').click();
    await page.waitForTimeout(250);
    const all = await storedLogs();
    const log = all.find((l) => l.id === id);
    assert(all.length === n0, "editing changed the number of logs");
    assert(log && log.entries.find((e) => e.name === "ベンチプレス").sets === 5, "edit not saved to the same log");
    assert(log.entries.find((e) => e.name === "水泳(クロール)").distance === 1000, "distance lost on edit");
    return { id, toast: await toastText(page) };
  });

  await step(results, "log-duplicate-today", async () => {
    const n0 = (await storedLogs()).length;
    const item = page.locator("#log-history .log-item").nth(1);
    const id = await openLogItem(item);
    const src = (await storedLogs()).find((l) => l.id === id);
    await item.locator('[data-act="repeat"]').click();
    await page.waitForTimeout(250);
    assert(await entries().count() === src.entries.length, "duplicate did not fill the form");
    assert(await page.locator('#log-compose input[name="log-date"][value="today"]').isChecked(), "duplicate is not dated today");
    const save = page.locator('#log-compose [data-act="save"]');
    await save.click();
    if (await entries().count()) await save.click();
    await page.waitForTimeout(250);
    const all = await storedLogs();
    assert(all.length === n0 + 1, "duplicate was not saved as a new log");
    assert(all.find((l) => l.id === id).date === src.date, "original log changed");
    return { entries: src.entries.length };
  });

  await step(results, "log-delete-undo", async () => {
    const n0 = (await storedLogs()).length;
    const item = page.locator("#log-history .log-item").first();
    const id = await openLogItem(item);
    await item.locator('[data-act="delete"]').click();
    await page.waitForTimeout(200);
    const afterDelete = await storedLogs();
    assert(afterDelete.length === n0 - 1 && !afterDelete.some((l) => l.id === id), "log not deleted");
    const msg = await toastText(page);
    await page.locator(".toast .toast-action").click();
    await page.waitForTimeout(200);
    const restored = await storedLogs();
    assert(restored.length === n0 && restored.some((l) => l.id === id), "undo did not restore the log");
    await full("13-log");
    results.overflow.log = await overflow(page);
    return { toast: msg };
  });

  // ---------- 進捗画面 ----------

  await step(results, "progress-charts-calendar-badges", async () => {
    await tab("progress").click(); await page.waitForTimeout(350);
    const labels = await page.locator('#view-progress svg.line-chart[role="img"]').evaluateAll((s) => s.map((x) => x.getAttribute("aria-label")));
    assert(labels.length >= 1 && labels.every((l) => l && l.length > 5), "chart without role=img/label");
    // 縦軸の目盛りは重複せず、回数・秒・分のグラフに小数の目盛りが出ない(B26)
    const ticks = await page.locator("#view-progress svg.line-chart").evaluateAll((s) =>
      s.map((svg) => [...svg.querySelectorAll('text[text-anchor="end"]')].map((t) => t.textContent)));
    assert(ticks.every((t) => t.length >= 2 && new Set(t).size === t.length), `bad tick labels: ${JSON.stringify(ticks)}`);
    assert(ticks.every((t) => !/[回秒分]$/.test(t[t.length - 1]) || t.every((x) => !/\./.test(x))), `fractional count ticks: ${JSON.stringify(ticks)}`);
    const days = await page.locator("#view-progress button.cal-cell").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label")));
    assert(days.length >= 1 && days.every((l) => /\d+月\d+日\(.\) 記録\d+件/.test(l)), `calendar labels: ${days}`);
    const rest = await page.evaluate(() => [...document.querySelectorAll("#view-progress .cal span.cal-cell:not(.is-future)")]
      .every((c) => /\d+月\d+日\(.\) 記録なし/.test(c.textContent)));
    assert(rest, "calendar rest days lack a text label");
    await page.locator("#view-progress button.cal-cell").first().click();
    assert(await page.locator("#view-progress .cal-detail-card").isVisible(), "day detail not shown");
    const badgeTexts = await page.locator("#view-progress .badge-item").allInnerTexts();
    assert(badgeTexts.length === 8 && badgeTexts.every((t) => /獲得|\d+\/\d+/.test(t)), "badge state text missing");
    let metric = null;
    const metricOpts = page.locator("#pg-chart .chart-metric .seg-opt");
    if (await metricOpts.count() > 1) {
      const before = await page.locator("#pg-chart svg.line-chart").getAttribute("aria-label");
      await metricOpts.nth(1).click(); await page.waitForTimeout(150);
      metric = await page.locator("#pg-chart svg.line-chart, #pg-chart .chart-empty").first().evaluate((el) => el.getAttribute("aria-label") ?? el.textContent);
      assert(metric !== before, "metric switch did not redraw the chart");
    }
    await full("14-progress");
    results.overflow.progressFull = await overflow(page);
    return { charts: labels.length, firstChart: labels[0], ticks: ticks[0], calendarDays: days.length, badges: badgeTexts.length, metric };
  });

  await step(results, "progress-bodyweight", async () => {
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("bodyweight_logs") || "[]").length);
    await page.locator('#pg-bw [data-act="bw-step"][data-step="1"]').click();
    const value = Number(await page.locator("#pg-bw .bw-select").inputValue());
    await page.locator('#pg-bw [data-act="bw-save"]').click();
    await page.waitForTimeout(200);
    const list = await page.evaluate(() => JSON.parse(localStorage.getItem("bodyweight_logs") || "[]"));
    assert(list.length === before + 1 && list[list.length - 1].weight === value, "bodyweight not saved");
    assert(await page.locator('#pg-bw svg.line-chart[role="img"]').count() === 1, "bodyweight chart missing");
    await shot("15-bodyweight");
    return { value, toast: await toastText(page) };
  });

  // ---------- セッション(ワークアウト)モード ----------

  await step(results, "session-flow", async () => {
    const n0 = (await storedLogs()).length;
    await tab("menu").click(); await page.waitForTimeout(150);
    await page.locator('#menu-today [data-act="start"], #menu-day [data-act="start"]').first().click();
    await page.waitForSelector("#session:not([hidden])", { timeout: 3000 });
    await shot("08-session");
    results.overflow.session = await overflow(page);
    const tabBarHidden = await page.locator(".tab-bar").isHidden();
    const check = page.locator("#session .ses-check").first();
    await check.click();
    // 記録の無い重り種目は、目安の重さのまま記録してよいかを1回確かめる(0kg のまま記録しない)
    const firstWeight = await page.locator("#session .ses-step-weight .ses-val-text").first().innerText().catch(() => "");
    assert(!/^0\s*kg$/.test(firstWeight.replace(/\s+/g, "")), `loaded exercise starts at ${firstWeight}`);
    if (await check.getAttribute("aria-pressed") !== "true") {
      await page.waitForTimeout(600);
      await check.click();
    }
    await page.waitForTimeout(400);
    assert(await page.locator("#rest-timer").isVisible(), "✓ did not start the rest timer");
    await shot("08b-session-timer");
    results.overflow.sessionTimer = await overflow(page);
    await page.locator("#session .ses-finish").click();
    await page.waitForSelector(".ses-sheet-layer", { timeout: 3000 });
    await page.waitForTimeout(400); // 開いた直後のタップは無視される
    if (!(await page.locator(".ses-sheet-layer.is-summary").count())) {
      await page.locator(".ses-sheet-layer .ses-sheet-btn.is-primary").click();
    }
    await page.waitForSelector(".ses-sheet-layer.is-summary", { timeout: 3000 });
    await page.waitForTimeout(400); // シートが開く動きが終わってから撮る
    await shot("09-session-summary");
    await page.waitForTimeout(400);
    await page.locator(".ses-sheet-layer.is-summary .ses-sheet-btn.is-primary").click();
    await page.waitForSelector("#session", { state: "hidden", timeout: 3000 });
    const all = await storedLogs();
    assert(all.length === n0 + 1, "session was not saved");
    await tab("log").click(); await page.waitForTimeout(200);
    const title = await page.locator("#log-history .log-item .log-title-text").first().innerText();
    return { tabBarHidden, title, timerHidden: await page.locator("#rest-timer").isHidden() };
  });

  // 記録が増えたら、保存済みメニューの「前回」と「目標」も変わる(I02/I19)
  await step(results, "targets-follow-new-logs", async () => {
    await tab("menu").click(); await page.waitForTimeout(150);
    const ex = page.locator('#menu-day .ex:not(.ex--cardio)').first();
    const name = await ex.locator(".ex-name").innerText();
    const before = await ex.locator(".ex-target").innerText().catch(() => "");
    await page.evaluate((name) => {
      const logs = JSON.parse(localStorage.getItem("workout_logs") || "[]");
      const d = new Date(); // 今日の記録(同じ日の中では重いセットが前回の基準になる)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      logs.push({ id: "e2e-target", date, entries: [{ name, track: "weight", weight: 47.5, reps: 9, sets: 3 }] });
      localStorage.setItem("workout_logs", JSON.stringify(logs));
    }, name);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const after = await page.locator('#menu-day .ex:not(.ex--cardio)').first().locator(".ex-target").innerText();
    assert(after !== before && /47\.5kg/.test(after), `target did not follow the new log: ${before} → ${after}`);
    return { name, before, after };
  });

  await full("09-final");
  results.overflow.final = await overflow(page);
  await ctx.close();
  return results;
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const all = [];
  for (const vp of VIEWPORTS) all.push(await runViewport(browser, base, vp));
  await browser.close(); srv.close();
  const summary = {
    ok: all.every((r) => r.pageErrors.length === 0 && r.steps.every((s) => s.ok) && !Object.values(r.overflow).some((o) => o && o.overflowing)),
    results: all,
  };
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: summary.ok, perViewport: all.map((r) => ({
    vp: r.viewport, pageErrors: r.pageErrors.length, consoleErrors: r.consoleErrors.length,
    failed: r.steps.filter((s) => !s.ok).map((s) => s.name + ": " + s.error),
    overflow: Object.fromEntries(Object.entries(r.overflow).map(([k, o]) => [k, o && o.overflowing])),
  })) }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
