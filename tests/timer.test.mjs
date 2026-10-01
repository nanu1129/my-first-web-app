// 休憩タイマー(js/timer.js)の単体テスト。DOM は最小限の模型、時計は node:test の mock.timers で動かす。
// - 表示用の純粋関数(formatClock / jaDuration / remainingSeconds)
// - 壁時計基準: JS が止まっていた(iPhone のロック中)あとでも、画面が見えた瞬間に正しい残り時間になる
// - +15秒 / +1分 / リセット / 終了 の動き、終了後に古い残り時間を引き継がないこと、完了表示と自動で閉じる時機
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// ---------- 最小限の DOM ----------

class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, on = !this.set.has(c)) { if (on) this.set.add(c); else this.set.delete(c); return on; }
}

class El {
  constructor(tag, { cls = "", data = {} } = {}) {
    this.tagName = tag.toUpperCase();
    this.id = "";
    this.hidden = false;
    this.textContent = "";
    this.attrs = new Map();
    this.dataset = { ...data };
    this.classList = new ClassList();
    for (const c of cls.split(" ").filter(Boolean)) this.classList.add(c);
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.kids = [];
    this.parent = null;
    this.listeners = {};
    this.offsetHeight = 0;
  }
  append(...els) { for (const e of els) { e.parent = this; this.kids.push(e); } }
  get isConnected() { return true; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  hasAttribute(k) { return this.attrs.has(k); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] ?? []).filter((f) => f !== fn); }
  dispatch(type, extra = {}) { for (const fn of this.listeners[type] ?? []) fn({ type, target: this, ...extra }); }
  descendants() { return this.kids.flatMap((k) => [k, ...k.descendants()]); }
  contains(el) { return el === this || this.descendants().includes(el); }
  matches(sel) {
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    if (sel.startsWith("#")) return this.id === sel.slice(1);
    if (sel === "[data-rest]") return "rest" in this.dataset;
    return false;
  }
  querySelector(sel) { return this.descendants().find((e) => e.matches(sel)) ?? null; }
  querySelectorAll(sel) { return this.descendants().filter((e) => e.matches(sel)); }
  closest(sel) {
    for (let e = this; e; e = e.parent) if (e.matches(sel)) return e;
    return null;
  }
  focus() { doc.activeElement = this; }
  blur() { doc.activeElement = doc.body; }
  // タイマー内のボタンのタップ(クリックはルート要素で受ける)
  click() { root.dispatch("click", { target: this }); }
}

// index.html の #rest-timer と同じ構造
const root = new El("div", { cls: "rest-timer" });
root.id = "rest-timer";
root.hidden = true;
const track = new El("div", { cls: "rest-timer-track" });
const bar = new El("div", { cls: "rest-timer-bar" });
track.append(bar);
const main = new El("div", { cls: "rest-timer-main" });
const time = new El("span", { cls: "rest-timer-time" });
time.textContent = "0:00";
main.append(time);
const actions = new El("div", { cls: "rest-timer-actions" });
const btn = {};
for (const v of ["+15", "+60", "reset", "stop"]) {
  btn[v] = new El("button", { cls: "rest-mini", data: { rest: v } });
  actions.append(btn[v]);
}
btn["+15"].textContent = "+15秒";
const live = new El("span", { cls: "rest-timer-live" });
root.append(track, main, actions, live);

const docListeners = {};
const doc = {
  visibilityState: "visible",
  body: new El("body"),
  documentElement: new El("html"),
  activeElement: null,
  getElementById: (id) => (id === "rest-timer" ? root : null),
  addEventListener(t, fn) { (docListeners[t] ??= []).push(fn); },
  removeEventListener(t, fn) { docListeners[t] = (docListeners[t] ?? []).filter((f) => f !== fn); },
};
doc.body.append(root);
doc.activeElement = doc.body;
globalThis.document = doc;

// 振動の呼び出しを記録する(navigator.vibrate)
const vibrations = [];
Object.defineProperty(globalThis, "navigator", {
  value: { vibrate: (p) => { vibrations.push(p); return true; } },
  configurable: true,
  writable: true,
});

function setVisible(visible) {
  doc.visibilityState = visible ? "visible" : "hidden";
  for (const fn of docListeners.visibilitychange ?? []) fn({ type: "visibilitychange" });
}

// Date.now と setInterval/setTimeout を偽の時計にしてから読み込む
mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.UTC(2026, 8, 30, 1, 0, 0) });
const timer = await import("../js/timer.js");
const { formatClock, jaDuration, remainingSeconds, initTimer, startRestTimer, addRest, resetRest, stopRest, isRunning } = timer;

// 実時間の経過(JS も動いている)
const run = (ms) => mock.timers.tick(ms);
// ロック中の経過(JS は止まっていて、時計だけ進む)
const sleep = (ms) => mock.timers.setTime(Date.now() + ms);
const barPct = () => Number.parseFloat(bar.style.width);
const isOpen = () => !root.hidden && doc.body.classList.contains("timer-open");

// ---------- 純粋関数 ----------

test("formatClock shows m:ss and never goes negative", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(5), "0:05");
  assert.equal(formatClock(59.6), "1:00");
  assert.equal(formatClock(90), "1:30");
  assert.equal(formatClock(600), "10:00");
  assert.equal(formatClock(-3), "0:00");
  assert.equal(formatClock("abc"), "0:00");
});

test("jaDuration reads naturally in Japanese", () => {
  assert.equal(jaDuration(45), "45秒");
  assert.equal(jaDuration(60), "1分");
  assert.equal(jaDuration(90), "1分30秒");
  assert.equal(jaDuration(0), "0秒");
});

test("remainingSeconds rounds up and stops at zero", () => {
  assert.equal(remainingSeconds(1000, 0), 1);
  assert.equal(remainingSeconds(1001, 0), 2);
  assert.equal(remainingSeconds(90_000, 0), 90);
  assert.equal(remainingSeconds(0, 5000), 0);
});

// ---------- タイマー本体 ----------

test("initTimer keeps the timer hidden and names the buttons starting with their visible text", () => {
  assert.equal(initTimer(root), root);
  assert.equal(initTimer(root), root, "idempotent");
  assert.equal(root.hidden, true);
  assert.equal(isRunning(), false);
  assert.equal(doc.body.classList.contains("timer-open"), false);
  assert.equal(root.getAttribute("role"), "region", "a named landmark");
  assert.equal(root.getAttribute("aria-label"), "休憩タイマー");
  assert.equal(time.getAttribute("role"), "timer");
  assert.match(btn["+15"].getAttribute("aria-label"), /^\+15秒/);
  assert.match(btn["+60"].getAttribute("aria-label"), /^\+1分/);
  assert.match(btn.reset.getAttribute("aria-label"), /^リセット/);
  assert.match(btn.stop.getAttribute("aria-label"), /^終了/);
});

test("startRestTimer shows the time, a full bar, the body class and announces the start", () => {
  assert.equal(startRestTimer(0), false, "0 seconds does nothing");
  assert.equal(root.hidden, true);
  assert.equal(startRestTimer(90), true);
  assert.ok(isOpen());
  assert.equal(isRunning(), true);
  assert.equal(time.textContent, "1:30");
  assert.equal(barPct(), 100);
  run(150);
  assert.equal(live.textContent, "休憩 1分30秒 開始");
});

test("the countdown follows the wall clock and the bar shrinks", () => {
  run(30_000 - 150);
  assert.equal(time.textContent, "1:00");
  assert.ok(Math.abs(barPct() - 66.67) < 0.5, `bar ${barPct()}`);
});

test("+15秒 / +1分 extend the running rest; リセット restarts from the first length", () => {
  btn["+15"].click();
  assert.equal(time.textContent, "1:15");
  btn["+60"].click();
  assert.equal(time.textContent, "2:15");
  assert.ok(Math.abs(barPct() - (135 / 165) * 100) < 0.5, `bar ${barPct()}`);
  btn.reset.click();
  assert.equal(time.textContent, "1:30");
  assert.equal(barPct(), 100);
});

test("after the phone was locked, the time is correct the moment the page is visible again", () => {
  setVisible(false);
  sleep(60_000); // JS は止まっていた(setInterval は1回も動いていない)
  assert.equal(time.textContent, "1:30", "nothing ran while locked");
  setVisible(true);
  assert.equal(time.textContent, "0:30");
  assert.equal(isRunning(), true);
});

test("a rest that ended while locked shows 完了! on return without a late beep, then closes after 3 s", () => {
  const before = vibrations.length;
  setVisible(false);
  sleep(45_000);
  setVisible(true);
  assert.equal(time.textContent, "完了!");
  assert.ok(root.classList.contains("is-done"));
  assert.equal(isRunning(), false);
  assert.equal(barPct(), 0);
  assert.equal(vibrations.length, before, "ended 15 s ago: no late vibration/beep");
  run(150);
  assert.equal(live.textContent, "休憩終了");
  run(2800);
  assert.ok(isOpen(), "完了! stays for 3 s");
  run(200);
  assert.equal(root.hidden, true);
  assert.equal(doc.body.classList.contains("timer-open"), false);
});

test("finishing on time vibrates; while the page is hidden the 3 s display waits until it is visible", () => {
  startRestTimer(10);
  const before = vibrations.length;
  setVisible(false); // 画面は消えたが、JS は動いている(Android・デスクトップ)
  run(10_250);
  assert.equal(time.textContent, "完了!");
  assert.equal(vibrations.length, before + 1, "on-time completion vibrates");
  run(20_000);
  assert.ok(isOpen(), "not closed while nobody can see it");
  setVisible(true);
  run(2900);
  assert.ok(isOpen());
  run(200);
  assert.equal(root.hidden, true);
});

test("a stale auto-hide never closes a newly started timer", () => {
  startRestTimer(5);
  run(5_250);
  assert.equal(time.textContent, "完了!");
  run(1000);
  startRestTimer(60);
  run(3000);
  assert.ok(isOpen());
  assert.equal(isRunning(), true);
  assert.equal(time.textContent, "0:57");
});

test("終了 hides the timer and a later +15秒 starts fresh instead of resuming the old time", () => {
  btn.stop.click();
  assert.equal(root.hidden, true);
  assert.equal(isRunning(), false);
  assert.equal(doc.body.classList.contains("timer-open"), false);
  assert.equal(addRest(15), true);
  assert.ok(isOpen());
  assert.equal(time.textContent, "0:15");
  stopRest();
  assert.equal(root.hidden, true);
});

test("tapping the card while it shows 完了! closes it; +1分 on the finished card starts a new rest", () => {
  startRestTimer(3);
  run(3_250);
  assert.ok(root.classList.contains("is-done"));
  btn["+60"].click();
  assert.equal(isRunning(), true);
  assert.equal(time.textContent, "1:00");
  assert.equal(root.classList.contains("is-done"), false);
  run(60_250);
  assert.ok(root.classList.contains("is-done"));
  root.dispatch("click", { target: time });
  assert.equal(root.hidden, true);
});

test("リセット restarts from the length of the last started rest", () => {
  // 直前の休憩の長さ(3秒)は覚えているので、リセットはその長さで始め直す
  assert.equal(resetRest(), true);
  assert.equal(time.textContent, "0:03");
  stopRest();
});

test("restSnapshot/resumeRest: a rest saved before the app was killed continues on the wall clock", () => {
  stopRest();
  assert.equal(timer.restSnapshot(), null);
  startRestTimer(120);
  run(30_000);
  const snap = timer.restSnapshot();
  assert.equal(snap.initial, 120);
  stopRest(); // アプリが落ちた
  sleep(20_000);
  assert.equal(timer.resumeRest(snap), true);
  assert.equal(isRunning(), true);
  assert.equal(time.textContent, "1:10");
  assert.ok(barPct() > 55 && barPct() < 60, String(barPct()));
  // リセットは最初の長さ(2分)から
  resetRest();
  assert.equal(time.textContent, "2:00");
  stopRest();
  // すでに終わった休憩は出さない
  sleep(200_000);
  assert.equal(timer.resumeRest(snap), false);
  assert.equal(root.hidden, true);
});

test("focus returns to where it was when the timer closes from inside", () => {
  const outside = new El("button");
  doc.body.append(outside);
  outside.focus();
  startRestTimer(30);
  // 終了ボタンへフォーカスが移ってから閉じる
  root.dispatch("focusin", { target: btn.stop, relatedTarget: outside });
  btn.stop.focus();
  btn.stop.click();
  assert.equal(doc.activeElement, outside);
  mock.timers.reset();
});
