// アプリの起動・画面切り替え(ハッシュルーター)・共通 UI(トースト・シート・確認)・サービスワーカー。
//
// ■ ビューの約束(js/views/*.js)
//   index.html の <section id="view-<name>" class="view"> 1つにつき1モジュール(name = menu / log / progress / settings)。
//   section には固定の見出し(.view-head の h1#<name>-title と、補足を書ける p.view-sub)と、
//   各ビューが中身を描く div.view-body がある。モジュールは次を export する:
//     mount(section, ctx)  起動時に1回だけ呼ばれる。.view-body を組み立て、イベントを結線する。
//     update(reason)       データが変わったとき、表示中かどうかに関係なく呼ばれる。reason は
//                          "logs"(記録の追加・削除・編集)/ "plan"(メニューの作成・変更)/ "profile"(プロフィール保存)/
//                          "import"(バックアップの読み込み・取り消し)/ "day"(日付が変わった)。
//     show(detail)         (任意)そのタブが表示された直後に呼ばれる。navigate(name, {detail}) で渡した値が
//                          detail に入る(例: 進捗のカレンダーから記録画面へ {logId} を渡して、その記録を開く)。
//   ビューどうしは直接 import しない。画面をまたぐ処理はすべて ctx を通す。
//
// ■ ctx(全ビュー共通のオブジェクト)
//   storage                  js/storage.js のモジュール(localStorage に触れるのはこれだけ)
//   navigate(name, {focus, detail})
//                            タブ切り替え。focus=true(既定)で切り替え先の見出しへフォーカス。detail は show(detail) へ渡す
//   refresh(reason)          全ビューの update(reason) を呼ぶ
//   toast(message, {action, onAction, tone, duration})
//                            画面下の通知。action を渡すとボタン(「元に戻す」など)が付く。
//                            tone: "ok" | "info" | "error" | "pr"(自己ベスト)。読み上げも行う
//   announce(message)        スクリーンリーダーへの読み上げのみ(role=status)
//   openSheet({title, body, footer, onClose})
//                            下から出るシート(<dialog>)。body/footer は Node か HTML 文字列。
//                            戻り値 {el, body, footer, close()}。同時に開けるのは1枚
//   confirm({title, message, ok, cancel, danger})  確認シート。Promise<boolean>
//   getPlan() / setPlan(record)
//                            保存済みメニュー {v, savedAt, profile, plan, modified}(無ければ null)。
//                            setPlan は保存し、容量不足で保存できなくてもこの起動中は使える
//   createPlan(profile)      プロフィールから1週間のメニューを作って保存し、refresh("plan")。記録を返す
//   saveLog(log, {notify, message})
//                            記録を1件保存して通知する(自己ベストの祝福・「元に戻す」付き。notify=false で通知なし)。
//                            id が無ければ振る。初回の保存で永続化(navigator.storage.persist)も頼む。戻り値 {ok, id, prs}
//   startWorkout(dayIndex)   保存済みメニューのその日をセッション(ワークアウト)モードで開く
//   startRestTimer(sec)      休憩タイマーを開始(js/timer.js)
//   checkForUpdate()         新しいバージョンの確認。Promise<"update"(更新の通知を表示済み) | "installing" | "latest" | "unsupported" | "error">
//   env                      { standalone, ios, version }
//   motion()                 アニメーションしてよいか(prefers-reduced-motion を尊重)
//
// ■ 画面の部品(style.css に用意したクラス。ビューはこれを組み合わせて描く)
//   .card(.card-head .card-title .card-text .card-note)  .section-head(.section-title .section-meta)
//   .btn(.btn-primary / -secondary / -outline / -ghost / -danger、.btn-lg .btn-sm .btn-block)  .btn-row  .icon-btn  .link-btn
//   .chips + .chip[aria-pressed]  .seg(.seg-2 / .seg-3)+ label.seg-opt > input[type=radio] + .seg-main/.seg-sub
//   .field-group .field-legend .field-grid .field .field-label  select(標準で 44px・16px 文字)
//   .fold(<details>)+ summary(.fold-ico .fold-label .fold-count .fold-chev)  .fold-list  .note-list
//   .list > .list-row(.list-main .list-title .list-sub)  .stats > .stat(.stat-label .stat-value > .num .stat-unit)
//   .empty-state(.empty-ico .empty-title .empty-text)  .tag(--main --focus --dist)  .badge  .kv  .notice  .sr-only
//   下に固定する UI は --bottom-ui(タブバー+セーフエリア)の上に置く。休憩タイマー表示中は body.timer-open
import * as storage from "./storage.js?v=14";
import { APP_VERSION } from "./version.js?v=14";
import { formatJaDate, localDateStr, uid } from "./util.js?v=14";
import { generatePlan, alternativeExercise } from "./planner.js?v=14";
import { detectPRs } from "./stats.js?v=14";
import { uiIcon } from "./icons.js?v=14";
import { initTimer, startRestTimer } from "./timer.js?v=14";
import { openSession, resumeSessionIfAny } from "./session.js?v=14";
import * as menuView from "./views/menu.js?v=14";
import * as logView from "./views/log.js?v=14";
import * as progressView from "./views/progress.js?v=14";
import * as settingsView from "./views/settings.js?v=14";

const $ = (sel, root = document) => root.querySelector(sel);

const VIEWS = { menu: menuView, log: logView, progress: progressView, settings: settingsView };
const UPDATE_CHECK_INTERVAL = 10 * 60 * 1000;

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const motion = () => !reducedMotion?.matches;

const env = {
  standalone: navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  version: APP_VERSION,
};

// index.html の <span data-icon="名前"> を線画アイコンに置き換える
function paintIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    el.insertAdjacentHTML("afterend", uiIcon(el.dataset.icon, el.className));
    el.remove();
  }
}

// ---------- 読み上げ・トースト ----------

function announce(message) {
  const el = $("#sr-status");
  el.textContent = "";
  // 同じ文言が続いても読み上げられるよう、いったん空にしてから次のフレームで入れる
  requestAnimationFrame(() => { el.textContent = message; });
}

const TOAST_ICON = { ok: "check", info: "infoCircle", error: "alert", pr: "trophy" };
let toastTimer = 0;

function dismissToast() {
  clearTimeout(toastTimer);
  $("#toast-region").replaceChildren();
}

// 開いているシートの上にも出せるよう、シート表示中はトースト領域をシート(最前面)の中へ移す
function placeToastRegion() {
  const region = $("#toast-region");
  const sheet = $("#sheet");
  const host = sheet.open ? sheet : document.body;
  if (region.parentElement !== host) host.append(region);
}

function toast(message, { action = null, onAction = null, tone = "info", duration } = {}) {
  placeToastRegion();
  const region = $("#toast-region");
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  el.innerHTML = `${uiIcon(TOAST_ICON[tone] ?? "infoCircle", "toast-ico")}<p class="toast-msg"></p>`;
  $(".toast-msg", el).textContent = message;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action;
    btn.addEventListener("click", () => {
      dismissToast();
      onAction?.();
    });
    el.append(btn);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn toast-close";
  close.setAttribute("aria-label", "通知を閉じる");
  close.innerHTML = uiIcon("close");
  close.addEventListener("click", dismissToast);
  el.append(close);
  region.replaceChildren(el);
  announce(message);

  const ms = duration ?? (action ? 6500 : tone === "error" ? 8000 : 3500);
  const arm = () => {
    clearTimeout(toastTimer);
    if (Number.isFinite(ms)) toastTimer = setTimeout(dismissToast, ms);
  };
  // 操作中(フォーカスがある間)は消さない
  el.addEventListener("focusin", () => clearTimeout(toastTimer));
  el.addEventListener("focusout", arm);
  arm();
}

// ---------- シート(<dialog>)・確認 ----------

let sheetState = null; // { onClose, returnFocus }

function fill(el, content) {
  if (content == null) el.replaceChildren();
  else if (typeof content === "string") el.innerHTML = content;
  else el.replaceChildren(content);
}

// 閉じた後の後始末(1回だけ)
function finishSheet() {
  const s = sheetState;
  if (!s) return;
  sheetState = null;
  document.body.classList.remove("sheet-open");
  placeToastRegion();
  s.onClose?.();
  if (!$("#sheet").open && s.returnFocus?.isConnected) s.returnFocus.focus({ preventScroll: true });
}

function closeSheet() {
  const sheet = $("#sheet");
  if (sheet.open) sheet.close();
  finishSheet();
}

function openSheet({ title, body, footer = null, onClose = null }) {
  const sheet = $("#sheet");
  let returnFocus = document.activeElement;
  // 前の操作の通知がシートの内容に重ならないよう消しておく
  dismissToast();
  if (sheetState) {
    // 開いているシートを差し替える(前のシートの後始末だけ先に行う)
    returnFocus = sheetState.returnFocus;
    const prev = sheetState;
    sheetState = null;
    prev.onClose?.();
  }
  $("#sheet-title").textContent = title;
  const bodyEl = $(".sheet-body", sheet);
  const footEl = $(".sheet-foot", sheet);
  fill(bodyEl, body);
  fill(footEl, footer);
  footEl.hidden = footer == null;
  sheetState = { onClose, returnFocus };
  document.body.classList.add("sheet-open");
  if (!sheet.open) {
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.setAttribute("open", "");
  }
  placeToastRegion();
  bodyEl.scrollTop = 0;
  // 入力欄に自動でフォーカスすると iOS ではピッカーが開いてしまうので、見出しへ
  $("#sheet-title").focus({ preventScroll: true });
  return { el: sheet, body: bodyEl, footer: footEl, close: closeSheet };
}

function setupSheet() {
  const sheet = $("#sheet");
  // Esc で閉じたとき(すぐ別のシートを開いた場合は何もしない)
  sheet.addEventListener("close", () => { if (!sheet.open) finishSheet(); });
  // 背景(::backdrop)のタップで閉じる
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
  $(".sheet-close", sheet).addEventListener("click", closeSheet);
}

function confirmSheet({ title, message, ok = "OK", cancel = "キャンセル", danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const body = document.createElement("p");
    body.className = "sheet-text";
    body.textContent = message;
    const foot = document.createElement("div");
    foot.className = "sheet-actions";
    foot.innerHTML =
      `<button type="button" class="btn btn-secondary" data-answer="no"></button>` +
      `<button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-answer="yes"></button>`;
    $('[data-answer="no"]', foot).textContent = cancel;
    $('[data-answer="yes"]', foot).textContent = ok;
    foot.addEventListener("click", (e) => {
      const b = e.target.closest("[data-answer]");
      if (!b) return;
      result = b.dataset.answer === "yes";
      closeSheet();
    });
    openSheet({ title, body, footer: foot, onClose: () => resolve(result) });
  });
}

// ---------- 画面切り替え ----------

let current = null;
const scrollPos = new Map();
const mounted = new Set();

const viewFromHash = () => {
  const h = location.hash.slice(1);
  return Object.hasOwn(VIEWS, h) ? h : null;
};

function showView(name, { focus = false, detail = null } = {}) {
  const switching = current !== name;
  if (switching) {
    if (current) scrollPos.set(current, window.scrollY);
    for (const n of Object.keys(VIEWS)) $(`#view-${n}`).hidden = n !== name;
    for (const tab of document.querySelectorAll(".tab-bar .tab")) {
      if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    current = name;
    storage.setMeta({ lastTab: name });
    window.scrollTo(0, scrollPos.get(name) ?? 0);
  }
  if (focus) $(`#${name}-title`)?.focus({ preventScroll: true });
  if (mounted.has(name) && (switching || detail != null)) {
    try { VIEWS[name].show?.(detail); } catch (err) { viewFailed(name, err); }
  }
}

function navigate(name, { focus = true, detail = null } = {}) {
  if (!Object.hasOwn(VIEWS, name)) return;
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  showView(name, { focus, detail });
}

function setupRouter() {
  history.scrollRestoration = "manual";
  // タブは履歴を積まずに切り替える(ホーム画面アプリには戻るボタンが無いため)
  for (const tab of document.querySelectorAll(".tab-bar .tab")) {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      if (tab.dataset.tab === current) window.scrollTo({ top: 0, behavior: motion() ? "smooth" : "auto" });
      navigate(tab.dataset.tab);
    });
  }
  window.addEventListener("hashchange", () => {
    const name = viewFromHash();
    if (name) showView(name, { focus: true });
  });
}

function initialView() {
  const fromHash = viewFromHash();
  if (fromHash) return fromHash;
  if (!storage.loadProfile()) return "settings"; // 初回はプロフィール入力から
  const last = storage.getMeta().lastTab;
  return Object.hasOwn(VIEWS, last) ? last : "menu";
}

function viewFailed(name, err) {
  console.error(err);
  showNotice({
    id: `view-error-${name}`,
    tone: "error",
    text: "画面の表示中に問題が発生しました。再読み込みしても直らない場合は、設定の「書き出す」で記録を保存してください。",
  });
}

function refresh(reason) {
  if (reason === "import") planRecord = undefined;
  for (const name of mounted) {
    try { VIEWS[name].update?.(reason); } catch (err) { viewFailed(name, err); }
  }
}

// ---------- お知らせ(画面上部・通常の配置) ----------

function showNotice({ id, text, tone = "info", action = null, onAction = null, onDismiss = null }) {
  const box = $("#notices");
  box.querySelector(`[data-notice="${id}"]`)?.remove();
  const el = document.createElement("div");
  el.className = `notice notice--${tone}`;
  el.dataset.notice = id;
  el.setAttribute("role", tone === "error" ? "alert" : "note");
  el.innerHTML = `${uiIcon(tone === "error" ? "alert" : "infoCircle", "notice-ico")}<div class="notice-body"><p class="notice-text"></p></div>`;
  $(".notice-text", el).textContent = text;
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn";
    b.textContent = action;
    b.addEventListener("click", () => onAction?.());
    $(".notice-body", el).append(b);
  }
  if (onDismiss) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "icon-btn notice-close";
    x.setAttribute("aria-label", "このお知らせを閉じる");
    x.innerHTML = uiIcon("close");
    x.addEventListener("click", () => {
      el.remove();
      onDismiss();
    });
    el.append(x);
  }
  box.append(el);
}

function setupNotices() {
  const meta = storage.getMeta();
  // B11: 旧バージョンの API キーを削除したことを一度だけ知らせる
  if (meta.legacyKeyNotice) {
    showNotice({
      id: "legacy-key",
      text: "以前のバージョンで保存されていた API キーを端末から削除しました。このアプリは端末内の内蔵アルゴリズムだけで動作し、外部には何も送信しません。",
      onDismiss: () => storage.setMeta({ legacyKeyNotice: undefined }),
    });
  }
  // I27: iPhone の Safari のまま使っている人へ(ホーム画面のアプリとは記録が別々)
  if (env.ios && !env.standalone && !meta.iosTipDismissed) {
    showNotice({
      id: "ios-tip",
      text: "iPhone ではホーム画面に追加して使うのがおすすめです。Safari のままだと、しばらく開かないと記録が消えることがあります。",
      action: "記録の移し方を見る",
      onAction: () => {
        navigate("settings");
        $("#backup")?.scrollIntoView({ behavior: motion() ? "smooth" : "auto", block: "start" });
      },
      onDismiss: () => storage.setMeta({ iosTipDismissed: true }),
    });
  }
}

// ---------- メニュー・記録(ビュー共通の処理) ----------

let planRecord; // undefined = まだ読んでいない / null = 無し

function getPlan() {
  if (planRecord === undefined) planRecord = storage.loadPlan();
  return planRecord;
}

function setPlan(record) {
  planRecord = record;
  if (record) storage.savePlan(record);
  else storage.clearPlan();
}

function createPlan(profile) {
  const plan = generatePlan(profile, storage.loadLogs());
  setPlan({ v: 1, savedAt: Date.now(), profile, plan, modified: false });
  refresh("plan");
  return planRecord;
}

let persistAsked = false;
function askPersistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  storage.requestPersistentStorage();
}

// 保存した記録の通知。自己ベストを更新していれば祝福し、どちらの場合も「元に戻す」を付ける
function notifySaved(entry, prs, message = null) {
  const saved = message ?? `${formatJaDate(entry.date)} に${entry.entries.length}種目を記録しました`;
  const undo = {
    action: "元に戻す",
    onAction: () => {
      if (storage.deleteLog(entry.id)) {
        refresh("logs");
        toast("記録を取り消しました", { tone: "info" });
      }
    },
  };
  if (prs.length > 0) {
    const top = prs[0];
    const more = prs.length > 1 ? ` ほか${prs.length - 1}件` : "";
    toast(`自己ベスト更新! ${top.name} ${top.label} ${top.prev}→${top.value}${top.unit}${more}(${saved})`, {
      tone: "pr", duration: 9000, ...undo,
    });
  } else {
    toast(saved, { tone: "ok", ...undo });
  }
}

// 記録を1件保存する。notify=false のときは通知しない(セッション画面は自分でまとめを表示するため)
function saveLog(log, { notify = true, message = null } = {}) {
  const prev = storage.loadLogs();
  const entry = { ...log, id: log.id != null ? String(log.id) : uid() };
  if (!storage.addLog(entry)) return { ok: false, id: null, prs: [] };
  askPersistOnce();
  const prs = detectPRs(prev, entry);
  refresh("logs");
  if (notify) notifySaved(entry, prs, message);
  return { ok: true, id: entry.id, prs };
}

// ---------- セッション(ワークアウト)モード ----------

function sessionContext(profile) {
  return {
    logs: storage.loadLogs(),
    profile: profile ?? storage.loadProfile(),
    onSave: (log) => saveLog(log, { notify: false }).ok,
    startRestTimer,
    alternativeExercise,
    // 画面を閉じたあとで(または再開の案内から記録したときに)、保存したことを知らせる。
    // 自己ベストはセッションのまとめで祝っているので、ここでは「元に戻す」付きの保存の通知だけにする
    onClose: (result) => {
      if (result?.saved && result.log) notifySaved(result.log, []);
    },
  };
}

function startWorkout(dayIndex) {
  const record = getPlan();
  const day = record?.plan.days[dayIndex];
  if (!day) return;
  // セッション中にメニューを調整しても影響しないよう、その日の内容を複製して渡す
  const snapshot = { ...structuredClone(day), index: dayIndex };
  openSession(snapshot, sessionContext(record.profile));
}

// ---------- サービスワーカー(オフライン対応・更新) ----------

let swRegistration = null;

function offerUpdate(worker) {
  // 初回インストール(まだ制御されていない)ときは知らせない
  if (!worker || !navigator.serviceWorker.controller) return;
  toast("新しいバージョンがあります", {
    tone: "info",
    action: "更新",
    duration: Infinity,
    onAction: () => worker.postMessage({ type: "SKIP_WAITING" }),
  });
}

function watchInstalling(reg) {
  const worker = reg.installing;
  worker?.addEventListener("statechange", () => {
    if (worker.state === "installed") offerUpdate(worker);
  });
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    swRegistration = reg;
    if (reg.waiting) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => watchInstalling(reg));
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  }).catch(() => { /* 対応していない環境でもアプリは動く */ });
}

async function checkForUpdate() {
  if (!swRegistration) return "unsupported";
  try {
    await swRegistration.update();
  } catch {
    return "error";
  }
  if (swRegistration.waiting) {
    offerUpdate(swRegistration.waiting);
    return "update";
  }
  return swRegistration.installing ? "installing" : "latest";
}

// ---------- 起動 ----------

function mountViews(ctx) {
  for (const [name, mod] of Object.entries(VIEWS)) {
    try {
      mod.mount($(`#view-${name}`), ctx);
      mounted.add(name);
    } catch (err) {
      viewFailed(name, err);
    }
  }
}

function watchDayChange() {
  let today = localDateStr();
  const check = () => {
    if (document.visibilityState !== "visible") return;
    const now = localDateStr();
    if (now !== today) {
      today = now;
      refresh("day");
    }
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", check);
}

function boot() {
  // 保存データの点検(旧 API キーの削除・形式の移行)は、どの画面を描くよりも先に行う
  const status = storage.initStorage({ onError: (msg) => toast(msg, { tone: "error", duration: 10000 }) });

  paintIcons();
  setupSheet();
  setupRouter();
  // 休憩タイマー(表示中は timer.js が body.timer-open と --timer-h を設定し、レイアウトが下に余白を空ける)
  initTimer($("#rest-timer"));
  // iOS Safari はタッチの listener が無いと :active(押した感触)を表示しない
  document.addEventListener("touchstart", () => {}, { passive: true });

  const reloadBtn = $("#app-reload");
  reloadBtn.hidden = !env.standalone;
  reloadBtn.addEventListener("click", () => location.reload());

  const ctx = {
    storage, navigate, refresh, toast, announce, openSheet, confirm: confirmSheet,
    getPlan, setPlan, createPlan, saveLog, startWorkout, startRestTimer, checkForUpdate, env, motion,
  };
  mountViews(ctx);
  setupNotices();
  if (!status.available) {
    showNotice({ id: "storage", tone: "error", text: storage.MESSAGES.unavailable });
  }
  const first = initialView();
  history.replaceState(null, "", `#${first}`);
  showView(first);
  watchDayChange();
  if (env.standalone) askPersistOnce();

  resumeSessionIfAny(sessionContext(getPlan()?.profile));
  registerSW();
}

boot();
