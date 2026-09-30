// 休憩タイマー(壁時計基準)と、セッション画面と共用する合図(ビープ・振動・画面スリープ防止)。
// - 残り時間は毎回「終了予定時刻 endAt − 現在時刻」から計算する。iPhone のロック中や別アプリ表示中に
//   JS が止まっても、戻った瞬間(visibilitychange / pageshow)に正しい残り時間・完了状態になる
// - 完了時: 2音のビープ(AudioContext は最初のタップで解錠済みのものを再利用)+ 対応端末なら振動 +
//   読み上げ。「完了!」を 3 秒表示してから閉じる(画面が見えていない間は 3 秒を数えない)
// - マナーモードではビープが鳴らないことがあるため、画面表示(ライム色の完了状態)が主な合図
// 画面の部品は index.html の #rest-timer(SPEC の markup contract)を使い、足りない部品だけ補う。

const TICK_MS = 250;
const DONE_SHOW_MS = 3000;   // 「完了!」を表示しておく時間
const LATE_CUE_MS = 3000;    // 終了からこれ以上たって気づいた場合は鳴らさない(遅れた音は雑音になる)

// ---------- 純粋な計算(テスト用に公開) ----------

// 秒 → "1:30"
export function formatClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 秒 → 読み上げ用 "1分30秒" / "45秒" / "2分"
export function jaDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}秒`;
  return r === 0 ? `${m}分` : `${m}分${r}秒`;
}

// 残り秒(切り上げ)。0 以下にはならない
export function remainingSeconds(endAt, now = Date.now()) {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

// ---------- 合図(音・振動・画面スリープ防止) ----------

let audioCtx = null;
let audioPrimed = false;

function audioContext() {
  if (audioCtx) return audioCtx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

// ユーザー操作(タップ)の中で呼ぶ。iOS は操作中に resume した AudioContext でないと鳴らない。
// ロック後は "interrupted" に戻ることがあるので、タイマー操作のたびに呼んでよい。
export function unlockAudio() {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state !== "running") ctx.resume?.().catch(() => {});
    if (!audioPrimed) {
      // 1サンプルの無音を再生すると WebKit で確実に解錠される
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      audioPrimed = true;
    }
  } catch { /* 音が出せない環境では何もしない */ }
}

// kind: "end" = 2音(休憩終了・キープ終了) / "start" = 短い1音(キープ開始)
export function playBeep(kind = "end") {
  const ctx = audioContext();
  if (!ctx) return;
  const tones = kind === "start" ? [[660, 0, 0.12]] : [[880, 0, 0.16], [1320, 0.2, 0.26]];
  const run = () => {
    try {
      const t0 = ctx.currentTime + 0.02;
      for (const [freq, at, dur] of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.28, t0 + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.02);
      }
    } catch { /* 無視 */ }
  };
  if (ctx.state === "running") run();
  else ctx.resume?.().then(run, () => {});
}

// Android などの振動(iPhone の Safari には無いので何もしない)
export function vibrate(pattern) {
  try {
    globalThis.navigator?.vibrate?.(pattern);
  } catch { /* 無視 */ }
}

// 画面のスリープ防止(Screen Wake Lock)。理由ごとに保持し、どれか1つでも残っていれば維持する。
// 画面が隠れると OS が自動で解除するので、見える状態に戻ったら取り直す。非対応なら何もしない。
const wakeReasons = new Set();
let wakeSentinel = null;
let wakeRequesting = false;

async function requestWake() {
  const nav = globalThis.navigator;
  if (!nav?.wakeLock || wakeSentinel || wakeRequesting || wakeReasons.size === 0) return;
  if (globalThis.document?.visibilityState !== "visible") return;
  wakeRequesting = true;
  try {
    const sentinel = await nav.wakeLock.request("screen");
    sentinel.addEventListener?.("release", () => { if (wakeSentinel === sentinel) wakeSentinel = null; });
    wakeSentinel = sentinel;
    if (wakeReasons.size === 0) releaseSentinel();
  } catch {
    wakeSentinel = null;
  } finally {
    wakeRequesting = false;
  }
}

function releaseSentinel() {
  const s = wakeSentinel;
  wakeSentinel = null;
  s?.release?.().catch(() => {});
}

export function acquireWakeLock(reason) {
  wakeReasons.add(reason);
  requestWake();
}

export function releaseWakeLock(reason) {
  wakeReasons.delete(reason);
  if (wakeReasons.size === 0) releaseSentinel();
}

// ---------- タイマー本体 ----------

let root = null;
let els = null;
const state = { endAt: 0, initial: 0, total: 0, running: false, done: false, shown: -1 };
let tickId = null;
let hideId = null;
let hidePending = false;   // 画面が隠れている間に完了した → 見えてから 3 秒表示する
let returnFocusTo = null;  // タイマー内のボタンを押す前にフォーカスがあった要素
let resizeObs = null;
let docListeners = false;

const DEFAULT_MARKUP =
  `<div class="rest-timer-bar" aria-hidden="true"></div>` +
  `<div class="rest-timer-main"><span class="rest-timer-label">休憩</span><span class="rest-timer-time">0:00</span></div>` +
  `<div class="rest-timer-actions">` +
  `<button type="button" data-rest="+15">+15秒</button>` +
  `<button type="button" data-rest="+60">+1分</button>` +
  `<button type="button" data-rest="reset">リセット</button>` +
  `<button type="button" data-rest="stop">終了</button>` +
  `</div>` +
  `<span class="rest-timer-live" aria-live="polite"></span>`;

const BUTTON_NAMES = {
  "+15": "休憩を15秒のばす",
  "+60": "休憩を1分のばす",
  reset: "休憩タイマーを最初の時間に戻す",
  stop: "休憩タイマーを終了",
};

function findRoot(rootEl) {
  const doc = globalThis.document;
  if (rootEl?.id === "rest-timer" || rootEl?.classList?.contains("rest-timer")) return rootEl;
  const inside = rootEl?.querySelector?.("#rest-timer");
  if (inside) return inside;
  const byId = doc.getElementById("rest-timer");
  if (byId) return byId;
  // index.html に無ければ作る(単体ページ・テスト用)
  const el = doc.createElement("div");
  el.id = "rest-timer";
  el.className = "rest-timer";
  el.hidden = true;
  el.innerHTML = DEFAULT_MARKUP;
  doc.body.appendChild(el);
  return el;
}

// 契約の部品が欠けていれば補う(既にあるものは触らない)
function ensureParts(el) {
  const doc = globalThis.document;
  if (!el.getAttribute("role")) el.setAttribute("role", "timer");
  if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "休憩タイマー");
  let time = el.querySelector(".rest-timer-time");
  if (!time) {
    time = doc.createElement("span");
    time.className = "rest-timer-time";
    time.textContent = "0:00";
    el.prepend(time);
  }
  let bar = el.querySelector(".rest-timer-bar");
  if (!bar) {
    bar = doc.createElement("div");
    bar.className = "rest-timer-bar";
    bar.setAttribute("aria-hidden", "true");
    el.prepend(bar);
  }
  if (!el.querySelector("[data-rest]")) {
    const actions = doc.createElement("div");
    actions.className = "rest-timer-actions";
    actions.innerHTML = DEFAULT_MARKUP.match(/<div class="rest-timer-actions">(.*?)<\/div>/)[1];
    el.appendChild(actions);
  }
  let live = el.querySelector(".rest-timer-live");
  if (!live) {
    live = doc.createElement("span");
    live.className = "rest-timer-live";
    live.setAttribute("aria-live", "polite");
    el.appendChild(live);
  }
  for (const b of el.querySelectorAll("[data-rest]")) {
    const name = BUTTON_NAMES[b.dataset.rest];
    if (name && !b.hasAttribute("aria-label")) b.setAttribute("aria-label", name);
    if (b.tagName === "BUTTON" && !b.getAttribute("type")) b.type = "button";
  }
  return { time, bar, live };
}

function onRootClick(e) {
  const btn = e.target.closest?.("[data-rest]");
  if (!btn || !root.contains(btn)) {
    // 完了表示中はカードのどこをタップしても閉じられる
    if (state.done) hide();
    return;
  }
  unlockAudio();
  const v = btn.dataset.rest;
  const plus = /^\+(\d+)$/.exec(v);
  if (plus) addRest(Number(plus[1]));
  else if (v === "reset") resetRest();
  else if (v === "stop") stopRest();
}

function onRootFocusIn(e) {
  if (!root.contains(e.relatedTarget)) returnFocusTo = e.relatedTarget ?? null;
}

function onVisible() {
  if (globalThis.document.visibilityState !== "visible") return;
  requestWake();
  if (state.running) paint();
  if (state.done && hidePending) {
    hidePending = false;
    scheduleHide();
  }
}

function measure() {
  if (!root || root.hidden) return;
  const h = root.offsetHeight;
  if (h > 0) globalThis.document.documentElement.style.setProperty("--timer-h", `${h}px`);
}

// 何度呼んでもよい。rootEl は #rest-timer 自体か、それを含む要素(省略時は document から探す)
export function initTimer(rootEl) {
  const doc = globalThis.document;
  const el = findRoot(rootEl);
  if (el === root) return root;
  if (root) {
    root.removeEventListener("click", onRootClick);
    root.removeEventListener("focusin", onRootFocusIn);
    resizeObs?.disconnect();
  }
  root = el;
  els = ensureParts(root);
  root.addEventListener("click", onRootClick);
  root.addEventListener("focusin", onRootFocusIn);
  if (globalThis.ResizeObserver) {
    resizeObs = new ResizeObserver(measure);
    resizeObs.observe(root);
  }
  if (!docListeners) {
    docListeners = true;
    doc.addEventListener("visibilitychange", onVisible);
    globalThis.addEventListener?.("pageshow", onVisible);
    // 最初のユーザー操作で AudioContext を解錠する(完了時の音はタップの外で鳴らすため)
    const events = ["pointerdown", "touchend", "click", "keydown"];
    const unlockOnce = () => {
      unlockAudio();
      if (!audioCtx || audioCtx.state === "running") {
        for (const t of events) doc.removeEventListener(t, unlockOnce, true);
      }
    };
    for (const t of events) doc.addEventListener(t, unlockOnce, true);
  }
  // 初期状態は必ず非表示(以前の状態を引き継がない)
  if (!state.running && !state.done) {
    root.hidden = true;
    root.classList.remove("is-done");
  } else {
    show();
    paint();
  }
  return root;
}

function ensureInit() {
  if (!root || !root.isConnected) {
    root = null;
    initTimer();
  }
}

// 読み上げ。表示直後の要素の中身が変わっても読まれないことがあるので、少し遅らせて入れ直す
function announce(msg) {
  const live = els?.live;
  if (!live) return;
  live.textContent = "";
  setTimeout(() => { live.textContent = msg; }, 120);
}

function show() {
  root.hidden = false;
  globalThis.document.body.classList.add("timer-open");
  measure();
}

function hide() {
  stopTicking();
  clearTimeout(hideId);
  hideId = null;
  hidePending = false;
  const hadFocus = root.contains(globalThis.document.activeElement);
  state.running = false;
  state.done = false;
  state.endAt = 0;
  state.shown = -1;
  root.hidden = true;
  root.classList.remove("is-done");
  globalThis.document.body.classList.remove("timer-open");
  releaseWakeLock("rest");
  if (hadFocus) {
    if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    else globalThis.document.activeElement?.blur?.();
  }
  returnFocusTo = null;
}

function startTicking() {
  if (tickId == null) tickId = setInterval(paint, TICK_MS);
}

function stopTicking() {
  if (tickId != null) clearInterval(tickId);
  tickId = null;
}

function paint() {
  if (!state.running) return;
  const now = Date.now();
  const ms = state.endAt - now;
  if (ms <= 0) {
    complete(-ms);
    return;
  }
  const sec = remainingSeconds(state.endAt, now);
  if (sec !== state.shown) {
    els.time.textContent = formatClock(sec);
    state.shown = sec;
  }
  const ratio = Math.min(1, Math.max(0, ms / (Math.max(1, state.total) * 1000)));
  els.bar.style.width = `${(ratio * 100).toFixed(2)}%`;
}

function complete(lateMs) {
  stopTicking();
  state.running = false;
  state.done = true;
  state.shown = -1;
  els.time.textContent = "完了!";
  els.bar.style.width = "0%";
  root.classList.add("is-done");
  if (lateMs <= LATE_CUE_MS) {
    playBeep("end");
    vibrate([200, 100, 200]);
  }
  announce("休憩終了");
  scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideId);
  if (globalThis.document.visibilityState === "hidden") {
    hidePending = true;
    return;
  }
  hideId = setTimeout(() => {
    hideId = null;
    if (globalThis.document.visibilityState === "hidden") {
      hidePending = true;
      return;
    }
    hide();
  }, DONE_SHOW_MS);
}

// 休憩を sec 秒で開始する(動作中なら置き換える)。sec が 0 以下なら何もしない
export function startRestTimer(sec) {
  const s = Math.round(Number(sec));
  if (!(s > 0)) return false;
  ensureInit();
  unlockAudio();
  clearTimeout(hideId);
  hideId = null;
  hidePending = false;
  Object.assign(state, { endAt: Date.now() + s * 1000, initial: s, total: s, running: true, done: false, shown: -1 });
  root.classList.remove("is-done");
  show();
  paint();
  startTicking();
  acquireWakeLock("rest");
  announce(`休憩 ${jaDuration(s)} 開始`);
  return true;
}

// 休憩をのばす。完了表示中・停止中なら今から sec 秒の休憩にする
export function addRest(sec) {
  const s = Math.round(Number(sec));
  if (!(s > 0)) return false;
  ensureInit();
  if (!state.running) {
    if (!state.done) return startRestTimer(s);
    clearTimeout(hideId);
    hideId = null;
    hidePending = false;
    Object.assign(state, { endAt: Date.now() + s * 1000, total: s, running: true, done: false, shown: -1 });
    root.classList.remove("is-done");
    show();
    acquireWakeLock("rest");
  } else {
    state.endAt += s * 1000;
    state.total += s;
  }
  paint();
  startTicking();
  announce(`残り ${jaDuration(remainingSeconds(state.endAt))}`);
  return true;
}

// 最初に指定した秒数からやり直す
export function resetRest() {
  ensureInit();
  if (!(state.initial > 0)) return false;
  clearTimeout(hideId);
  hideId = null;
  hidePending = false;
  Object.assign(state, { endAt: Date.now() + state.initial * 1000, total: state.initial, running: true, done: false, shown: -1 });
  root.classList.remove("is-done");
  show();
  paint();
  startTicking();
  acquireWakeLock("rest");
  announce(`休憩 ${jaDuration(state.initial)} から再開`);
  return true;
}

// 止めて閉じる(残り時間は持ち越さない)
export function stopRest() {
  if (!root) return;
  hide();
}

// 休憩中(カウントダウン中)か。完了表示中・停止中は false
export function isRunning() {
  return state.running;
}
