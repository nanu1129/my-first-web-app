// セッション画面(js/session.js)と休憩タイマー(js/timer.js)の結合テスト(Playwright / Chromium)。
// 実行: NODE_PATH=$(npm root -g) node --test
// tests/fixtures/session.html は本物のモジュールを読み込み、app.js の代わりに呼び出しを記録する ctx を渡す。
// 開始 → セットの ✓ → 休憩タイマー → キープのカウントダウン → プールの距離(25m刻み)→ 種目の入れ替え →
// 中断・再読み込み後の再開 → 記録して終了(onSave に正規化済みの記録が渡り storage.addLog が受け付ける)、
// 破棄、回復日、320px での横はみ出し・タップ領域を確かめる。Playwright が無ければスキップする。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..");
const FIXTURE = "/tests/fixtures/session.html";
// 日本時間の朝(UTC ではまだ前日)に始める: 記録の日付が端末のローカル日付になることも確かめる
const START = new Date("2026-10-01T08:30:00+09:00");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* スキップ */ }

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(REPO, p);
    if (!file.startsWith(REPO + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}

let browser = null;
let launchError = null;
async function getBrowser() {
  if (browser || launchError) return browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    launchError = err;
  }
  return browser;
}

async function openPage(t, base, viewport) {
  const b = await getBrowser();
  if (!b) {
    t.skip(`Chromium を起動できません: ${String(launchError?.message ?? launchError).split("\n")[0]}`);
    return null;
  }
  const context = await b.newContext({
    viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    timezoneId: "Asia/Tokyo", locale: "ja-JP", serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.clock.install({ time: START });
  await page.goto(base + FIXTURE);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  return { page, context, errors };
}

const calls = (page) => page.evaluate(() => structuredClone(window.fixture.calls));

// 画面全体と、セッション画面のスクロール部分が横にはみ出していないか
async function assertNoOverflow(page, label) {
  const o = await page.evaluate(() => {
    const body = document.querySelector(".ses-body");
    return {
      doc: document.documentElement.scrollWidth, vw: window.innerWidth,
      body: body ? body.scrollWidth - body.clientWidth : 0,
    };
  });
  assert.ok(o.doc <= o.vw, `${label}: page scrollWidth ${o.doc} > ${o.vw}`);
  assert.ok(o.body <= 0, `${label}: .ses-body overflows by ${o.body}px`);
}

const card = (page, name) => page.locator(".ses-card", { has: page.locator(".ses-card-name", { hasText: name }) });
const setRow = (page, name, i) => card(page, name).locator(".ses-set").nth(i);
const value = (row, field) => row.locator(`.ses-step-${field} .ses-val-text`).innerText().then((s) => s.replace(/\s+/g, ""));
const checkBtn = (row) => row.locator(".ses-check");
// 操作結果の文言(少し遅れて入る)を待つ
const waitMessage = (page, re) => page.waitForFunction(
  (src) => new RegExp(src).test(document.querySelector(".ses-msg")?.textContent ?? ""), re.source,
);

test("session mode: sets, rest timer, hold, pool distance, swap, resume, save", { skip: chromium ? false : "playwright が見つかりません(NODE_PATH=$(npm root -g) で実行)" }, async (t) => {
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}`;
  t.after(async () => {
    await browser?.close();
    browser = null;
    srv.close();
  });
  const opened = await openPage(t, base, { width: 390, height: 844 });
  if (!opened) return;
  const { page, errors } = opened;

  await t.test("opens as a full-screen dialog with previous/target notes", async () => {
    await page.evaluate(() => { window.fixture.seedPrevious(); window.fixture.open(); });
    const section = page.locator("#session");
    await section.waitFor({ state: "visible" });
    assert.equal(await section.getAttribute("role"), "dialog");
    assert.ok(await page.evaluate(() => document.body.classList.contains("session-open")));
    assert.equal(await page.locator(".ses-title").innerText(), "Day 1:全身A");
    assert.equal(await page.locator(".ses-progress-text").innerText(), "0/8");
    const bench = card(page, "ベンチプレス");
    assert.match(await bench.locator(".ses-note").first().innerText(), /前回\s*9\/26\s*60kg×10,10,8/);
    assert.match(await bench.locator(".ses-note.is-target").innerText(), /62\.5kg×8回から/);
    assert.equal(await value(setRow(page, "ベンチプレス", 0), "weight"), "62.5kg");
    assert.equal(await value(setRow(page, "ベンチプレス", 0), "reps"), "8回");
    assert.ok(await page.locator("#rest-timer").isHidden(), "timer hidden until the first ✓");
    await assertNoOverflow(page, "open");
  });

  await t.test("weight steppers follow WEIGHT_CHOICES and carry forward to untouched sets only", async () => {
    const s1 = setRow(page, "ベンチプレス", 0);
    await s1.locator(".ses-step-weight .ses-step-btn").nth(1).click();
    assert.equal(await value(s1, "weight"), "65kg");
    assert.equal(await value(setRow(page, "ベンチプレス", 1), "weight"), "65kg");
    assert.equal(await value(setRow(page, "ベンチプレス", 2), "weight"), "65kg");
    // 3セット目を自分で変えたら、以後の引き継ぎ対象から外れる
    await setRow(page, "ベンチプレス", 2).locator(".ses-step-weight select").selectOption("60");
    await s1.locator(".ses-step-weight .ses-step-btn").nth(1).click();
    assert.equal(await value(s1, "weight"), "67.5kg");
    assert.equal(await value(setRow(page, "ベンチプレス", 1), "weight"), "67.5kg");
    assert.equal(await value(setRow(page, "ベンチプレス", 2), "weight"), "60kg");
  });

  await t.test("✓ marks the set, saves the session and starts the rest timer above the footer", async () => {
    const s1 = setRow(page, "ベンチプレス", 0);
    await checkBtn(s1).click();
    assert.equal(await checkBtn(s1).getAttribute("aria-pressed"), "true");
    assert.deepEqual((await calls(page)).rest, [90]);
    const timer = page.locator("#rest-timer");
    await timer.waitFor({ state: "visible" });
    assert.ok(await page.evaluate(() => document.body.classList.contains("timer-open")));
    assert.equal(await page.locator(".rest-timer-time").innerText(), "1:30");
    assert.equal(await page.locator(".ses-progress-text").innerText(), "1/8");
    const stored = await page.evaluate(() => window.fixture.stored());
    assert.equal(stored.cards[0].sets[0].done, true);
    const box = await timer.boundingBox();
    const foot = await page.locator(".ses-foot").boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= foot.y + 1, `timer ${JSON.stringify(box)} must sit above the footer at ${foot.y}`);
    // 次のセットの ✓ がタイマーに隠れていない
    const next = await checkBtn(setRow(page, "ベンチプレス", 1)).boundingBox();
    assert.ok(next.y + next.height <= box.y, "the next set is scrolled into the visible area above the timer");
    await assertNoOverflow(page, "timer");
  });

  await t.test("+15秒 extends the rest, 終了 hides the timer", async () => {
    await page.locator('#rest-timer [data-rest="+15"]').click();
    assert.equal(await page.locator(".rest-timer-time").innerText(), "1:45");
    await page.locator('#rest-timer [data-rest="stop"]').click();
    assert.ok(await page.locator("#rest-timer").isHidden());
    assert.equal(await page.evaluate(() => document.body.classList.contains("timer-open")), false);
  });

  await t.test("un-checking the set that started the rest stops the timer", async () => {
    const s2 = setRow(page, "ベンチプレス", 1);
    await checkBtn(s2).click();
    assert.ok(await page.evaluate(() => window.fixture.timerRunning()));
    await checkBtn(s2).click();
    assert.equal(await checkBtn(s2).getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => window.fixture.timerRunning()), false);
    assert.ok(await page.locator("#rest-timer").isHidden());
  });

  await t.test("the hold countdown (3 s get-ready + hold) checks the set by itself and starts the rest", async () => {
    const p1 = setRow(page, "プランク", 0);
    await p1.locator(".ses-step-seconds select").selectOption("10");
    assert.equal(await value(p1, "seconds"), "10秒");
    const hold = p1.locator(".ses-hold");
    assert.match(await hold.innerText(), /キープ 10秒/);
    await hold.click();
    assert.match(await p1.locator(".ses-hold").getAttribute("class"), /is-running/);
    await page.clock.runFor(3_500);
    assert.match(await p1.locator(".ses-hold-text").innerText(), /^0:(10|0\d)$/, "counting down the hold");
    await page.clock.runFor(10_000);
    assert.equal(await checkBtn(setRow(page, "プランク", 0)).getAttribute("aria-pressed"), "true");
    assert.deepEqual((await calls(page)).rest.slice(-1), [45]);
    assert.ok(await page.locator("#rest-timer").isVisible());
  });

  await t.test("pool cardio: minutes and 25 m distance steps", async () => {
    const row = setRow(page, "水泳(クロール)", 0);
    assert.equal(await value(row, "minutes"), "15分");
    assert.equal(await value(row, "distance"), "200m");
    const [dec, inc] = [row.locator(".ses-step-distance .ses-step-btn").nth(0), row.locator(".ses-step-distance .ses-step-btn").nth(1)];
    await inc.click();
    assert.equal(await value(row, "distance"), "225m");
    await dec.click();
    await dec.click();
    assert.equal(await value(row, "distance"), "175m");
    const values = await row.locator(".ses-step-distance select option").evaluateAll((os) => os.map((o) => Number(o.value)));
    assert.ok(values.length > 100 && values.every((v) => v % 25 === 0), "pool distances are 25 m steps");
  });

  await t.test("↻ swaps an exercise through ctx.alternativeExercise", async () => {
    const curl = card(page, "ダンベルカール");
    await curl.locator('[data-act="swap"]').click();
    const c = await calls(page);
    assert.deepEqual(c.alt, [2]);
    assert.equal(await card(page, "ダンベルカール").count(), 0);
    await waitMessage(page, /「ダンベルカール」を「.+」に変更しました/);
    const stored = await page.evaluate(() => window.fixture.stored());
    assert.notEqual(stored.cards[2].name, "ダンベルカール");
    assert.equal(stored.day.exercises[2].name, stored.cards[2].name);
  });

  await t.test("中断 offers 保存して終了 / 破棄 / 続ける", async () => {
    await page.locator(".ses-pause").click();
    const sheet = page.locator(".ses-sheet");
    await sheet.waitFor({ state: "visible" });
    assert.deepEqual(await sheet.locator(".ses-sheet-btn").allInnerTexts(), ["保存して終了", "破棄", "続ける"]);
    await assertNoOverflow(page, "pause sheet");
    await sheet.locator(".ses-sheet-btn", { hasText: "続ける" }).click();
    assert.equal(await page.locator(".ses-sheet").count(), 0);
  });

  await t.test("after a reload the stored session is offered and resumes with the checked sets", async () => {
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const banner = page.locator("#notices .session-resume");
    await banner.waitFor({ state: "visible" });
    assert.match(await banner.innerText(), /途中のトレーニングがあります[\s\S]*Day 1:全身A・2\/8セット完了/);
    assert.equal(await page.evaluate(() => window.fixture.isOpen()), false);
    await banner.locator('[data-resume="resume"]').click();
    await page.locator("#session").waitFor({ state: "visible" });
    assert.equal(await page.locator(".ses-progress-text").innerText(), "2/8");
    // ベンチプレスは1セット完了のまま(たたまれていない)、プランクの1セット目も完了
    assert.equal(await checkBtn(setRow(page, "ベンチプレス", 0)).getAttribute("aria-pressed"), "true");
    assert.equal(await checkBtn(setRow(page, "ベンチプレス", 1)).getAttribute("aria-pressed"), "false");
    assert.equal(await value(setRow(page, "ベンチプレス", 2), "weight"), "60kg");
    assert.equal(await checkBtn(setRow(page, "プランク", 0)).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#notices .session-resume").count(), 0);
  });

  await t.test("記録して終了 builds a normalized Log that storage.addLog accepts", async () => {
    await page.clock.runFor(20 * 60_000);
    await page.locator(".ses-finish").click();
    const confirm = page.locator(".ses-sheet");
    await confirm.waitFor({ state: "visible" });
    assert.match(await confirm.innerText(), /未完了の6セットは記録されません/);
    await confirm.locator(".ses-sheet-btn", { hasText: "記録して終了" }).click();
    const summary = page.locator(".ses-sheet-layer.is-summary");
    await summary.waitFor({ state: "visible" });
    assert.match(await summary.innerText(), /おつかれさまでした/);
    assert.match(await summary.innerText(), /総挙上量\s*540\s*kg/);

    const c = await calls(page);
    assert.equal(c.saved.length, 1);
    assert.deepEqual(c.savedOk, [true]);
    const log = c.saved[0];
    assert.equal(typeof log.id, "string");
    assert.equal(log.date, "2026-10-01", "local (JST) date of the start, not the UTC date");
    assert.deepEqual(log.planDay, { index: 0, title: "Day 1:全身A" });
    assert.ok(log.startedAt >= START.getTime() && log.startedAt < START.getTime() + 60_000, `startedAt ${log.startedAt}`);
    assert.ok(log.durationMin >= 1 && log.durationMin <= 60, `durationMin ${log.durationMin}`);
    assert.equal(log.entries.length, 2);
    const [bench, plank] = log.entries;
    assert.equal(bench.name, "ベンチプレス");
    assert.equal(bench.track, "weight");
    assert.equal(bench.weight, 67.5);
    assert.equal(bench.reps, 8);
    assert.equal(bench.sets, 1);
    assert.deepEqual(bench.setDetails, [{ weight: 67.5, reps: 8 }]);
    assert.equal(bench.seconds, null);
    assert.equal(plank.name, "プランク");
    assert.equal(plank.track, "time");
    assert.equal(plank.seconds, 10);
    assert.deepEqual(plank.setDetails, [{ seconds: 10 }]);

    const saved = await page.evaluate((id) => window.fixture.logs().find((l) => l.id === id), log.id);
    assert.ok(saved, "the log is in storage");
    assert.deepEqual(saved.entries.map((e) => e.setDetails), [[{ weight: 67.5, reps: 8 }], [{ seconds: 10 }]]);
    assert.equal(await page.evaluate(() => window.fixture.stored()), null, "the active session is cleared");

    await summary.locator(".ses-sheet-btn", { hasText: "閉じる" }).click();
    assert.ok(await page.locator("#session").isHidden());
    assert.equal(await page.evaluate(() => document.body.classList.contains("session-open")), false);
    assert.ok(await page.locator("#rest-timer").isHidden(), "the rest timer is closed with the session");
    assert.equal((await calls(page)).closed.at(-1).saved, true);
  });

  await t.test("the next session shows the saved sets as 前回", async () => {
    await page.evaluate(() => window.fixture.open());
    const note = card(page, "ベンチプレス").locator(".ses-note").first();
    assert.match(await note.innerText(), /前回\s*10\/1\s*67\.5kg×8/);
  });

  await t.test("破棄 needs a second tap when sets are done, then clears the session", async () => {
    await checkBtn(setRow(page, "ベンチプレス", 0)).click();
    await page.locator(".ses-pause").click();
    const discard = page.locator(".ses-sheet-btn", { hasText: "破棄" });
    await discard.click();
    assert.equal(await discard.innerText(), "もう一度タップで破棄");
    assert.ok(await page.locator("#session").isVisible());
    await discard.click();
    assert.ok(await page.locator("#session").isHidden());
    assert.equal(await page.evaluate(() => window.fixture.stored()), null);
    assert.equal((await calls(page)).closed.at(-1).discarded, true);
    assert.equal((await calls(page)).saved.length, 1, "nothing more was saved");
  });

  await t.test("a recovery day opens with its cardio and saves without a rest timer", async () => {
    await page.evaluate(() => window.fixture.open({
      index: 2, title: "Day 3:アクティブレスト", type: "recovery", exercises: [],
      warmup: ["首・肩・股関節をゆっくり回す 各10回"], cooldown: ["キャット&カウ 10回"],
      cardio: { name: "ウォーキング(早歩き)", duration: "20〜30分(会話できる強さ)", minutes: 25, distanceM: null, isPool: false },
    }));
    assert.equal(await page.locator(".ses-kicker").innerText(), "アクティブレスト(回復日)");
    assert.equal(await page.locator(".ses-card").count(), 1);
    const row = setRow(page, "ウォーキング(早歩き)", 0);
    assert.equal(await value(row, "minutes"), "25分");
    assert.equal(await value(row, "distance"), "—");
    const restBefore = (await calls(page)).rest.length;
    await checkBtn(row).click();
    assert.equal((await calls(page)).rest.length, restBefore, "cardio does not start a rest");
    await waitMessage(page, /全セット完了/);
    await page.locator(".ses-finish").click();
    await page.locator(".ses-sheet-layer.is-summary").waitFor({ state: "visible" });
    const log = (await calls(page)).saved.at(-1);
    assert.deepEqual(log.planDay, { index: 2, title: "Day 3:アクティブレスト" });
    assert.equal(log.entries[0].track, "cardio");
    assert.equal(log.entries[0].minutes, 25);
    assert.equal(log.entries[0].distance, null);
    assert.equal(log.entries[0].unit, "km");
    await page.locator(".ses-sheet-btn", { hasText: "閉じる" }).click();
  });

  assert.deepEqual(errors, [], "no page errors");
});

test("session mode at 320 px: no horizontal overflow, 44 px targets, timer buttons on one line", { skip: chromium ? false : "playwright が見つかりません" }, async (t) => {
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}`;
  t.after(async () => {
    await browser?.close();
    browser = null;
    srv.close();
  });
  const opened = await openPage(t, base, { width: 320, height: 640 });
  if (!opened) return;
  const { page, errors } = opened;
  await page.evaluate(() => { window.fixture.seedPrevious(); window.fixture.open(); });
  await page.locator("#session").waitFor({ state: "visible" });
  await assertNoOverflow(page, "320 open");

  // 102.5kg のような長い値でも隣のボタンに重ならない
  const s3 = setRow(page, "ベンチプレス", 2);
  await s3.locator(".ses-step-weight select").selectOption("102.5");
  const fits = await s3.locator(".ses-step-weight").evaluate((step) => {
    const [dec, inc] = step.querySelectorAll(".ses-step-btn");
    const text = step.querySelector(".ses-val-text").getBoundingClientRect();
    return text.left >= dec.getBoundingClientRect().right && text.right <= inc.getBoundingClientRect().left;
  });
  assert.ok(fits, "the value stays between − and +");

  const small = await page.evaluate(() => [...document.querySelectorAll(
    "#session .ses-step-btn, #session .ses-check, #session .ses-tool, #session .ses-setcount-btn, #session .ses-pause, #session .ses-finish, #session .ses-add, #session .ses-hold",
  )].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.width < 44 || r.height < 44);
  }).map((el) => el.className));
  assert.deepEqual(small, [], "every control in the session is at least 44×44");

  await page.locator(".ses-check").first().click();
  const timer = page.locator("#rest-timer");
  await timer.waitFor({ state: "visible" });
  const buttons = await page.locator("#rest-timer .rest-mini").evaluateAll((bs) => bs.map((b) => ({
    text: b.innerText, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, overflow: b.scrollWidth > b.clientWidth,
  })));
  assert.deepEqual(buttons.map((b) => b.text), ["+15秒", "+1分", "リセット", "終了"]);
  for (const b of buttons) {
    assert.ok(b.h >= 44 && b.h <= 50, `${b.text} is one line and ≥44px tall (${b.h})`);
    assert.equal(b.overflow, false, `${b.text} fits its button`);
  }
  const box = await timer.boundingBox();
  assert.ok(box.height <= 130, `timer height ${box.height}`);
  assert.ok(box.x >= 0 && box.x + box.width <= 320, "timer fits the width");
  await assertNoOverflow(page, "320 timer");

  await page.locator(".ses-add").click();
  await page.locator(".ses-sheet").waitFor({ state: "visible" });
  await assertNoOverflow(page, "320 add sheet");
  const segs = await page.locator(".ses-seg-item span").evaluateAll((ss) => ss.map((s) => s.getBoundingClientRect().height));
  assert.ok(segs.every((h) => h <= 46), `track labels stay on one line (${segs})`);
  // 有酸素を選ぶと種目の一覧が有酸素に切り替わる
  await page.locator(".ses-seg-item", { hasText: "有酸素" }).click();
  const names = await page.locator(".ses-add-name option").allInnerTexts();
  assert.ok(names.some((n) => /水泳/.test(n)) && !names.includes("ベンチプレス"), "the list follows the chosen track");
  await page.locator(".ses-add-name").selectOption({ label: names.find((n) => /平泳ぎ/.test(n)) });
  await page.locator(".ses-sheet-btn", { hasText: "追加" }).click();
  const added = card(page, "平泳ぎ");
  await added.waitFor({ state: "visible" });
  assert.equal(await value(added.locator(".ses-set").first(), "distance"), "—");
  assert.deepEqual(errors, [], "no page errors");
});
