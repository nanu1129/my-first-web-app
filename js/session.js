// トレーニング中の画面(セッションモード)。全画面のオーバーレイで、1セットずつ ✓ を付けて進める。
// - 種目ごとのカード。セット行は −/+ のステッパー(重量は WEIGHT_CHOICES の段階、回数は1回刻み)。
//   値をタップするとネイティブの選択リストで大きく変えられる。変更は後ろの「未変更・未完了」のセットへ引き継ぐ
// - ✓ でそのセットを完了にし、休憩タイマーを自動で開始して次のセットへ進む
// - 体幹・キープ種目は ▶ でキープのカウントダウン(準備3秒 → 指定秒)。終わると自動で ✓
// - 有酸素は時間と距離(プールは25m刻み)
// - 状態はタップのたびに storage.saveSession で保存し、アプリが落ちても12時間以内なら再開できる
// - 記録して終了で、セット詳細(setDetails)と要約値(最も重いセット)を持つ正規化済みの記録を作り、ctx.onSave に渡す
import {
  WEIGHT_CHOICES, isPoolExercise, parseRestSeconds, alternativeExercise, alternativeCardio, hasAlternative,
  exerciseChoices, getExerciseTrack, getExerciseTip, getExerciseInfo, startingWeight,
} from "./planner.js?v=14";
import { loadSession, saveSession, clearSession, loadLogs, loadProfile, addLog, normalizeEntry } from "./storage.js?v=14";
import { localDateStr, formatShortDate, escapeHtml, numRange, uid, formatNum } from "./util.js?v=14";
import { detectPRs, lastWorkingSet } from "./stats.js?v=14";
import { EQUIPMENT_SVG, uiIcon } from "./icons.js?v=14";
import {
  initTimer, startRestTimer, stopRest, isRunning, playBeep, vibrate, unlockAudio, acquireWakeLock, releaseWakeLock,
  formatClock, restSnapshot, resumeRest,
} from "./timer.js?v=14";

const STALE_MS = 12 * 60 * 60 * 1000; // これより前に始めたセッションは再開せず、記録するか破棄するかを選ぶ
const PREP_MS = 3000;                 // キープ開始前の準備時間
const LATE_CUE_MS = 3000;
const MAX_SETS = 10;
const SHEET_GUARD_MS = 350;   // シートを開いた直後のタップ(ダブルタップの2回目)は受け付けない
const CONFIRM_GUARD_MS = 500; // 「もう一度タップ」の確認は、これより速い2回目(ダブルタップ)では確定しない
const UNCHECK_GUARD_MS = 400; // ✓ の直後の2回目のタップで完了を取り消さない
const DAY_PREFIX = /^Day\s*(\d+)\s*[::]\s*/i;

const REPS_CHOICES = numRange(1, 50);
const SECONDS_CHOICES = numRange(5, 600, 5);
const MINUTE_CHOICES = numRange(1, 180);
const KM_CHOICES = [0, ...numRange(0.1, 50, 0.1)];
const POOL_CHOICES = [0, ...numRange(25, 10000, 25)];
const TRACK_LABELS = { weight: "筋トレ", time: "体幹・キープ", cardio: "有酸素" };

// icons.js に無い2つ(ステッパーの −、キープ中止の ■)。描き方は uiIcon と同じ
const lineIcon = (body) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON_MINUS = lineIcon(`<path d="M5 12h14"/>`);
const ICON_STOP = lineIcon(`<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>`);

// ---------- 小さなヘルパー ----------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const fmtNum = (v) => formatNum(v, 2);
const reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// "8〜12回" "30〜60秒キープ" の先頭の数値範囲の中央(整数)。読めなければ null
function midOf(text) {
  const m = String(text ?? "").match(/(\d+(?:\.\d+)?)(?:\s*[〜~～\-–]\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  return Math.round((a + b) / 2);
}

// 昇順リストで v の1つ上/下の値(v がリストに無くても隣の値へ進む)
function stepIn(list, v, dir) {
  const x = num(v) ?? list[0];
  if (dir > 0) return list.find((c) => c > x + 1e-9) ?? list[list.length - 1];
  for (let i = list.length - 1; i >= 0; i--) if (list[i] < x - 1e-9) return list[i];
  return list[0];
}

// 重りを使う器具の種目か(0kg を「自重」と書かないため)
const LOAD_EQUIPMENT = /^(barbell|dumbbell|kettlebell|machine|cable|mc_)/;
const isLoaded = (name) => (getExerciseInfo(name)?.equipment ?? []).some((k) => LOAD_EQUIPMENT.test(k));

function elapsedText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// 始めた時刻の言い方: "たった今開始" / "5分前に開始" / "2時間前に開始"
function startedText(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "たった今開始";
  if (min < 60) return `${min}分前に開始`;
  return `${Math.floor(min / 60)}時間前に開始`;
}

// メニューの日の名前。"Day 3:全身C" → { num: 3, name: "全身C" }(メニュー画面の DAY チップと同じ表し方)
function dayLabel(day) {
  const title = String(day?.title ?? "");
  const m = DAY_PREFIX.exec(title);
  const num = Number.isInteger(day?.index) && day.index >= 0 ? day.index + 1 : m ? Number(m[1]) : null;
  return { num, name: title.replace(DAY_PREFIX, "") || "トレーニング" };
}

// 案内・確認の文中で使う "3日目・全身C"
function dayText(day) {
  const { num, name } = dayLabel(day);
  return num ? `${num}日目・${name}` : name;
}

// ---------- 前回の記録 ----------

// 記録1行の短い表記: "60kg×10,10,8" / "60kg×10 / 62.5kg×8" / "30,30,25秒" / "25分・500m"
function describeEntry(e) {
  if (!e) return "";
  const details = Array.isArray(e.setDetails) ? e.setDetails : [];
  if (e.track === "time") {
    if (details.length) return `${details.map((s) => fmtNum(num(s.seconds) ?? 0)).join(",")}秒`;
    return `${fmtNum(num(e.seconds) ?? 0)}秒×${num(e.sets) ?? 1}セット`;
  }
  if (e.track === "cardio") {
    const d = num(e.distance);
    return `${fmtNum(num(e.minutes) ?? 0)}分${d ? `・${fmtNum(d)}${e.unit ?? "km"}` : ""}`;
  }
  if (details.length) {
    const groups = [];
    for (const s of details) {
      const w = num(s.weight) ?? 0;
      const last = groups[groups.length - 1];
      if (last && last.w === w) last.reps.push(num(s.reps));
      else groups.push({ w, reps: [num(s.reps)] });
    }
    return groups.map((g) => (g.w > 0 ? `${fmtNum(g.w)}kg×${g.reps.join(",")}` : `${g.reps.join(",")}回`)).join(" / ");
  }
  const w = num(e.weight) ?? 0;
  return `${w > 0 ? `${fmtNum(w)}kg×` : ""}${num(e.reps) ?? "?"}回×${num(e.sets) ?? 1}セット`;
}

// ---------- セッションの状態 ----------

function trackOf(ex) {
  return ex.track === "weight" || ex.track === "time" || ex.track === "cardio" ? ex.track : getExerciseTrack(ex.name);
}

function liftCard(ex, planIndex, logs, extra = {}) {
  const track = trackOf(ex);
  if (track === "cardio") return cardioCard(ex, logs, extra);
  const count = Math.min(MAX_SETS, Math.max(1, Math.round(num(ex.sets) ?? 3)));
  const target = isObj(ex.target) ? ex.target : null;
  // 前回の記録(その日の中で最も良いセット)。目標(planner の target)が無いときの初期値に使う
  const prev = lastWorkingSet(logs, ex.name);
  const last = prev?.track === track ? prev : null;
  let base;
  // 目標・前回の値は丸めずにそのまま使う(選択肢に無い 61kg なども、その値を選択肢に足して表示する。B30)
  let guess = false;
  if (track === "time") {
    base = { seconds: Math.max(1, Math.round(num(target?.seconds) ?? midOf(ex.reps) ?? num(last?.seconds) ?? 30)) };
  } else {
    let weight = num(target?.weight) > 0 ? num(target.weight) : num(last?.weight) > 0 ? num(last.weight) : null;
    if (weight == null) {
      // 重りを使う種目で記録も目標も無いときは、0kg ではなく軽めの目安の重さから(「目安」と表示し、✓ の前に確かめる)
      const start = isLoaded(ex.name) ? startingWeight(ex.name) : null;
      guess = start > 0;
      weight = guess ? start : 0;
    }
    const reps = Math.round(num(target?.reps) ?? midOf(ex.reps) ?? num(last?.reps) ?? 10);
    base = { weight, reps: Math.min(REPS_CHOICES[REPS_CHOICES.length - 1], Math.max(1, reps)) };
  }
  return {
    key: uid(),
    kind: "lift",
    name: String(ex.name),
    track,
    planIndex: Number.isInteger(planIndex) ? planIndex : null,
    focused: !!ex.focused,
    reps: String(ex.reps ?? ""),
    rest: String(ex.rest ?? ""),
    target: target?.text ? String(target.text) : null,
    tip: String(ex.tip || getExerciseTip(ex.name) || ""),
    added: !!extra.added,
    guess,
    sets: Array.from({ length: count }, () => ({ ...base, done: false, touched: false })),
  };
}

function cardioCard(c, logs, extra = {}) {
  const pool = isPoolExercise(c.name) || c.isPool === true;
  const t = isObj(c.target) ? c.target : null;
  const last = lastWorkingSet(logs, c.name);
  const durMid = /分/.test(String(c.duration ?? "")) ? midOf(c.duration) : null;
  // 任意の軽い泳ぎは処方どおり(前回より伸ばす目標は使わない)
  const goal = c.optional ? null : t;
  const minutes = Math.max(1, Math.round(num(goal?.minutes) ?? num(c.minutes) ?? durMid ?? num(last?.minutes) ?? 20));
  let distance = 0;
  if (pool) {
    const m = goal?.unit === "m" ? num(goal.distance) : num(c.distanceM);
    distance = m > 0 ? m : 0;
  } else if (goal?.unit === "km" && num(goal.distance) > 0) {
    distance = num(goal.distance);
  }
  return {
    key: uid(),
    kind: "cardio",
    name: String(c.name),
    track: "cardio",
    unit: pool ? "m" : "km",
    planIndex: null,
    optional: !!c.optional,
    duration: String(c.duration ?? ""),
    reps: "",
    rest: "",
    target: goal?.text ? String(goal.text) : null,
    tip: String(c.tip || getExerciseTip(c.name) || ""),
    added: !!extra.added,
    sets: [{ minutes, distance, done: false, touched: false }],
  };
}

// 画面に渡された日のメニュー(スナップショット)からセッションを作る
function createSession(daySnapshot, logs) {
  const day = clone(daySnapshot) ?? {};
  const index = Number.isInteger(day.index) ? day.index : Number.isInteger(day.dayIndex) ? day.dayIndex : null;
  const cards = [];
  (Array.isArray(day.exercises) ? day.exercises : []).forEach((ex, i) => {
    if (ex?.name) cards.push(liftCard(ex, i, logs));
  });
  if (day.cardio?.name) cards.push(cardioCard(day.cardio, logs));
  return {
    v: 1,
    id: uid(),
    startedAt: Date.now(),
    day: { ...day, index, title: String(day.title ?? "トレーニング") },
    cards,
  };
}

// 保存されていたセッションを検証する(壊れていれば null)
function validSession(s) {
  if (!isObj(s) || s.v !== 1 || !Number.isFinite(s.startedAt) || !Array.isArray(s.cards) || !isObj(s.day)) return null;
  const cards = s.cards.filter((c) => isObj(c) && typeof c.name === "string" && c.name && Array.isArray(c.sets) && c.sets.length > 0);
  if (cards.length === 0 && s.cards.length > 0) return null;
  for (const c of cards) {
    if (typeof c.key !== "string" || !c.key) c.key = uid();
    if (!["weight", "time", "cardio"].includes(c.track)) c.track = getExerciseTrack(c.name);
    c.kind = c.track === "cardio" ? "cardio" : "lift";
    if (c.kind === "cardio" && c.unit !== "m" && c.unit !== "km") c.unit = isPoolExercise(c.name) ? "m" : "km";
    c.sets = c.sets.filter(isObj).slice(0, MAX_SETS);
    if (c.sets.length === 0) c.sets = [{ done: false, touched: false }];
    for (const set of c.sets) {
      set.done = set.done === true;
      set.touched = set.touched === true;
      if (c.track === "weight") {
        set.weight = Math.max(0, num(set.weight) ?? 0);
        set.reps = Math.max(1, Math.round(num(set.reps) ?? 10));
      } else if (c.track === "time") {
        set.seconds = Math.max(1, Math.round(num(set.seconds) ?? 30));
      } else {
        set.minutes = Math.max(1, Math.round(num(set.minutes) ?? 20));
        set.distance = Math.max(0, num(set.distance) ?? 0);
      }
    }
  }
  const day = {
    ...s.day,
    title: String(s.day.title ?? "トレーニング"),
    exercises: Array.isArray(s.day.exercises) ? s.day.exercises : [],
  };
  return { ...s, id: typeof s.id === "string" && s.id ? s.id : uid(), cards, day };
}

const countSets = (s) => s.cards.reduce((n, c) => n + c.sets.length, 0);
const countDone = (s) => s.cards.reduce((n, c) => n + c.sets.filter((x) => x.done).length, 0);
const cardDone = (c) => c.sets.every((x) => x.done);

// 完了したセットから記録(正規化済みの Log)を作る。完了セットが1つも無ければ null
function buildSessionLog(session) {
  const s = validSession(clone(session));
  if (!s) return null;
  const entries = [];
  for (const c of s.cards) {
    const done = c.sets.filter((x) => x.done);
    if (done.length === 0) continue;
    let e;
    if (c.track === "weight") {
      const setDetails = done.map((x) => ({ weight: x.weight, reps: x.reps }));
      const top = setDetails.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
      e = { name: c.name, track: "weight", weight: top.weight, reps: top.reps, sets: done.length, setDetails };
    } else if (c.track === "time") {
      const setDetails = done.map((x) => ({ seconds: x.seconds }));
      e = { name: c.name, track: "time", seconds: Math.max(...setDetails.map((x) => x.seconds)), sets: done.length, setDetails };
    } else {
      const x = done[0];
      e = { name: c.name, track: "cardio", minutes: x.minutes, distance: x.distance > 0 ? x.distance : null, unit: c.unit, sets: 1 };
    }
    const clean = normalizeEntry(e);
    if (clean) entries.push(clean);
  }
  if (entries.length === 0) return null;
  // 終了時刻 = 最後に ✓ を付けた時刻(放置したセッションを後から保存しても所要時間が膨らまない)
  const lastDone = Math.max(0, ...s.cards.flatMap((c) => c.sets.map((x) => (x.done && Number.isFinite(x.doneAt) ? x.doneAt : 0))));
  const end = lastDone > s.startedAt ? lastDone : Date.now();
  const log = {
    id: s.id,
    date: localDateStr(new Date(s.startedAt)),
    entries,
    startedAt: s.startedAt,
    durationMin: Math.max(1, Math.round((end - s.startedAt) / 60000)),
  };
  if (Number.isInteger(s.day.index) && s.day.index >= 0) log.planDay = { index: s.day.index, title: s.day.title };
  return log;
}

// 総挙上量(重量×回数の合計、自重は含めない)
function totalVolume(log) {
  let v = 0;
  for (const e of log.entries) {
    if (e.track !== "weight") continue;
    for (const s of e.setDetails ?? [{ weight: e.weight, reps: e.reps }]) v += (num(s.weight) ?? 0) * (num(s.reps) ?? 0);
  }
  return Math.round(v * 10) / 10;
}

// ---------- 画面の状態 ----------

let section = null;
let state = null;          // 現在のセッション
let ctx = {};
let elapsedId = null;
let hold = null;           // キープのカウントダウン { key, i, phase, endAt, seconds, id }
let sheet = null;          // 開いているシート
let banner = null;         // 再開の案内
let msgId = null;
let openerFocus = null;
let openerScroll = 0;      // 開く前のページのスクロール位置(閉じたら戻す)
let restFrom = null;       // 休憩タイマーを始めたセット { key, i }
const expanded = new Set(); // 完了後も開いておくカード
const tipsOpen = new Set();
const inerted = [];

const ctxLogs = () => (Array.isArray(ctx.logs) ? ctx.logs : loadLogs());
const prevCache = new Map();  // 種目名 → 前回の記録(セッション中は記録が変わらないので1回だけ探す)

function previousOf(name) {
  if (!prevCache.has(name)) prevCache.set(name, lastWorkingSet(ctxLogs(), name));
  return prevCache.get(name);
}

const findCard = (key) => state?.cards.find((c) => c.key === key) ?? null;

let storageFailed = false;

// 状態を保存する(動いている休憩タイマーも一緒に)。保存できなければ、この画面の中に消えない警告を出す
// (トーストはオーバーレイの下に隠れることがあるため)
function persist() {
  if (!state) return;
  state.rest = restSnapshot();
  const ok = saveSession(state);
  if (!ok && !storageFailed) {
    storageFailed = true;
    message("端末の保存容量が不足しているため、途中経過を保存できません。アプリを閉じる前に「記録して終了」で保存してください", "error", { sticky: true });
  } else if (ok && storageFailed) {
    storageFailed = false;
    message("途中経過を保存できるようになりました");
  }
}

export function isSessionOpen() {
  return !!(section && !section.hidden && state);
}

function ensureSection() {
  const doc = globalThis.document;
  section = doc.getElementById("session");
  if (!section) {
    section = doc.createElement("section");
    section.id = "session";
    section.className = "session";
    section.hidden = true;
    doc.body.appendChild(section);
  }
  if (section.dataset.ready === "1") return section;
  section.dataset.ready = "1";
  section.classList.add("session");
  // aria-modal は付けない: 休憩タイマーは画面の外側(body 直下)にあり、読み上げでも操作できる必要がある。
  // 後ろの画面は showOverlay で inert にする
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-labelledby", "session-title");
  section.innerHTML = `
    <header class="ses-head">
      <div class="ses-head-inner">
        <div class="ses-head-row">
          <div class="ses-head-titles">
            <p class="ses-kicker"></p>
            <h2 class="ses-title" id="session-title" tabindex="-1"></h2>
          </div>
          <button type="button" class="ses-pause" data-act="pause">中断</button>
        </div>
        <div class="ses-head-stats">
          <p class="ses-stat"><span class="ses-stat-label">経過</span><span class="ses-stat-num ses-elapsed">0:00</span></p>
          <p class="ses-stat"><span class="ses-stat-label">完了</span><span class="ses-stat-num ses-progress-text">0/0</span><span class="ses-stat-unit">セット</span></p>
          <div class="ses-progress" aria-hidden="true"><span class="ses-progress-fill"></span></div>
        </div>
      </div>
      <p class="ses-msg" role="status" aria-live="polite"></p>
    </header>
    <div class="ses-body">
      <div class="ses-prep-top"></div>
      <ol class="ses-cards"></ol>
      <div class="ses-prep-bottom"></div>
    </div>
    <footer class="ses-foot">
      <div class="ses-foot-inner">
        <button type="button" class="ses-add" data-act="add-ex">${uiIcon("plus")}<span>種目</span></button>
        <button type="button" class="ses-finish" data-act="finish">${uiIcon("check")}<span>記録して終了</span></button>
      </div>
    </footer>`;
  section.addEventListener("click", onClick);
  section.addEventListener("change", onChange);
  section.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet) {
      e.preventDefault();
      openPauseSheet();
    }
  });
  return section;
}

// ---------- 描画 ----------

function prepHtml(label, icon, items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `<details class="ses-prep"><summary>${uiIcon(icon)}<span class="ses-prep-label">${label}</span>` +
    `<span class="ses-prep-count">${items.length}</span>${uiIcon("chevronDown", "ses-prep-chev")}</summary>` +
    `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></details>`;
}

// カード左上の絵: 器具の線画(ベンチより主役の器具を優先)。器具を使わない種目は種類のアイコン
function cardIcon(c) {
  const keys = (getExerciseInfo(c.name)?.equipment ?? []).filter((k) => EQUIPMENT_SVG[k]);
  const key = keys.find((k) => k !== "bench") ?? keys[0];
  if (key) return `<span class="ses-card-icon" aria-hidden="true">${EQUIPMENT_SVG[key]}</span>`;
  const generic = c.kind === "cardio" ? (c.unit === "m" ? "wave" : "pulse") : c.track === "time" ? "clock" : "bolt";
  return `<span class="ses-card-icon is-generic" aria-hidden="true">${uiIcon(generic)}</span>`;
}

function optionsHtml(list, value, label) {
  const values = list.includes(value) ? list : [...list, value].sort((a, b) => a - b);
  return values.map((v) => `<option value="${v}"${v === value ? " selected" : ""}>${escapeHtml(label(v))}</option>`).join("");
}

const FIELDS = {
  weight: {
    list: () => WEIGHT_CHOICES,
    label: (v, c) => (v > 0 ? `${fmtNum(v)}kg` : isLoaded(c.name) ? "0kg" : "自重"),
    name: "重量",
    show: (v, c) => (v > 0 ? [fmtNum(v), "kg"] : isLoaded(c.name) ? ["0", "kg"] : ["自重", ""]),
  },
  reps: { list: () => REPS_CHOICES, label: (v) => `${v}回`, name: "回数", show: (v) => [String(v), "回"] },
  seconds: { list: () => SECONDS_CHOICES, label: (v) => `${v}秒`, name: "秒数", show: (v) => [String(v), "秒"] },
  minutes: { list: () => MINUTE_CHOICES, label: (v) => `${v}分`, name: "時間", show: (v) => [String(v), "分"] },
  distance: {
    list: (c) => (c.unit === "m" ? POOL_CHOICES : KM_CHOICES),
    label: (v, c) => (v > 0 ? `${fmtNum(v)}${c.unit}` : "記録しない"),
    name: "距離",
    show: (v, c) => (v > 0 ? [fmtNum(v), c.unit] : ["—", ""]),
  },
};

// 数字でない値(自重・—)は本文の字体、5文字以上の数字は少し小さく
function valueClass(text) {
  if (!/\d/.test(text)) return ` class="is-word"`;
  return text.length >= 5 ? ` class="is-long"` : "";
}

function stepperHtml(c, i, field) {
  const f = FIELDS[field];
  const set = c.sets[i];
  const v = set[field];
  const list = f.list(c);
  const [big, unit] = f.show(v, c);
  const where = `${escapeHtml(c.name)} ${i + 1}セット目`;
  const attrs = (act) => `data-act="${act}" data-card="${c.key}" data-set="${i}" data-field="${field}" data-fk="${c.key}:${i}:${field}:${act}"`;
  const guess = field === "weight" && c.guess && !set.done ? " is-guess" : "";
  return `<div class="ses-step ses-step-${field}${guess}" role="group" aria-label="${where}の${f.name}">` +
    `<button type="button" class="ses-step-btn" ${attrs("dec")} aria-label="${f.name}を減らす(${where})"${v <= list[0] ? " disabled" : ""}>${ICON_MINUS}</button>` +
    `<label class="ses-val"><span class="ses-val-text" aria-hidden="true"><b${valueClass(big)}>${escapeHtml(big)}</b>` +
    `${unit ? `<small>${escapeHtml(unit)}</small>` : ""}</span>` +
    `<select class="ses-val-select" data-card="${c.key}" data-set="${i}" data-field="${field}" data-fk="${c.key}:${i}:${field}:sel" aria-label="${where}の${f.name}">${optionsHtml(list, v, (x) => f.label(x, c))}</select></label>` +
    `<button type="button" class="ses-step-btn" ${attrs("inc")} aria-label="${f.name}を増やす(${where})"${v >= list[list.length - 1] ? " disabled" : ""}>${uiIcon("plus")}</button>` +
    `</div>`;
}

function holdButtonHtml(c, i) {
  const running = hold && hold.key === c.key && hold.i === i;
  const set = c.sets[i];
  const label = running ? holdLabel() : `キープ ${set.seconds}秒`;
  const phase = running ? ` is-running${hold.phase === "prep" ? " is-prep" : ""}` : "";
  return `<button type="button" class="ses-hold${phase}" data-act="hold" data-card="${c.key}" data-set="${i}" data-fk="${c.key}:${i}:hold"` +
    ` aria-label="${running ? "キープを中止" : `${escapeHtml(c.name)} ${i + 1}セット目のキープを開始(${set.seconds}秒)`}"${set.done ? " disabled" : ""}>` +
    `<span class="ses-hold-fill" aria-hidden="true"></span>${running ? ICON_STOP : uiIcon("play")}` +
    `<span class="ses-hold-text" aria-hidden="true">${label}</span></button>`;
}

function setRowHtml(c, i, nextKey) {
  const set = c.sets[i];
  const isNext = nextKey && nextKey.key === c.key && nextKey.i === i;
  let a;
  let b;
  if (c.track === "weight") {
    a = stepperHtml(c, i, "weight");
    b = stepperHtml(c, i, "reps");
  } else if (c.track === "time") {
    a = stepperHtml(c, i, "seconds");
    b = holdButtonHtml(c, i);
  } else {
    a = stepperHtml(c, i, "minutes");
    b = stepperHtml(c, i, "distance");
  }
  const checkLabel = `${escapeHtml(c.name)}${c.kind === "cardio" ? "" : ` ${i + 1}セット目`}を完了`;
  return `<li class="ses-set${set.done ? " is-done" : ""}${isNext ? " is-next" : ""}" data-set="${i}">` +
    (c.kind === "cardio" ? "" : `<span class="ses-set-no" aria-hidden="true">${i + 1}</span>`) +
    `<div class="ses-set-a">${a}</div><div class="ses-set-b">${b}</div>` +
    `<button type="button" class="ses-check" data-act="check" data-card="${c.key}" data-set="${i}" data-fk="${c.key}:${i}:check"` +
    ` aria-pressed="${set.done}" aria-label="${checkLabel}">${uiIcon("check")}</button>` +
    `</li>`;
}

// 次に行うセット(最初の未完了セット)
function nextSet() {
  for (const c of state.cards) {
    const i = c.sets.findIndex((x) => !x.done);
    if (i >= 0) return { key: c.key, i };
  }
  return null;
}

// カード下部のアイコンだけのボタン(読み上げ名は label)
function toolHtml(c, act, icon, label, { disabled = false, expanded = null } = {}) {
  return `<button type="button" class="ses-tool" data-act="${act}" data-card="${c.key}" data-fk="${c.key}:${act}" aria-label="${label}"` +
    `${expanded == null ? "" : ` aria-expanded="${expanded}"`}${act === "tip" ? ` aria-controls="tip-${c.key}"` : ""}` +
    `${disabled ? " disabled" : ""}>${icon}</button>`;
}

// ↻ で入れ替えられる種目があるか(有酸素は押したときに確かめる)
function canSwap(c) {
  if (c.kind === "cardio") return true;
  if (c.planIndex == null) return false;
  return hasAlternative(ctx.profile ?? loadProfile(), state.day, c.planIndex);
}

function cardHtml(c, next) {
  const doneN = c.sets.filter((x) => x.done).length;
  const total = c.sets.length;
  const complete = doneN === total;
  const current = next && next.key === c.key;
  const cls = `ses-card${c.kind === "cardio" ? " is-cardio" : ""}${complete ? " is-done" : ""}${current ? " is-current" : ""}`;
  const name = escapeHtml(c.name);
  if (complete && !expanded.has(c.key)) {
    return `<li class="${cls} is-collapsed" data-card="${c.key}">` +
      `<button type="button" class="ses-card-summary" data-act="expand" data-card="${c.key}" data-fk="${c.key}:expand" aria-expanded="false">` +
      `<span class="ses-sum-check" aria-hidden="true">${uiIcon("check")}</span>` +
      `<span class="ses-sum-text"><span class="ses-sum-name">${name}</span>` +
      `<span class="ses-sum-detail">${escapeHtml(describeEntry(buildCardEntry(c)))}</span></span>` +
      `<span class="ses-sum-count">${doneN}/${total}<span class="sr-only">セット完了</span></span></button></li>`;
  }
  const prev = previousOf(c.name);
  const meta = c.kind === "cardio"
    ? `${c.duration ? escapeHtml(c.duration) : "有酸素"}${c.optional ? "(任意)" : ""}`
    : [escapeHtml(c.reps), c.rest ? `休憩 ${escapeHtml(c.rest)}` : ""]
      .filter(Boolean).map((t) => `<span class="ses-meta-part">${t}</span>`).join("・");
  const anyDone = doneN > 0;
  const tipOpen = tipsOpen.has(c.key);
  const notes = [];
  if (prev) {
    notes.push(`<p class="ses-note"><span class="ses-note-label">前回 ${escapeHtml(formatShortDate(prev.date))}</span>` +
      `<span class="ses-note-value">${escapeHtml(describeEntry(prev))}</span></p>`);
  }
  if (c.target) {
    notes.push(`<p class="ses-note is-target"><span class="ses-note-label">目標</span><span class="ses-note-value">${escapeHtml(c.target)}</span></p>`);
  }
  if (c.guess && !anyDone) {
    notes.push(`<p class="ses-note is-guess"><span class="ses-note-label">目安</span>` +
      `<span class="ses-note-value">記録が無いので軽めの${escapeHtml(fmtNum(c.sets[0].weight))}kgを入れています。実際の重さに合わせてください</span></p>`);
  }
  const tools = [];
  if (c.tip) {
    tools.push(toolHtml(c, "tip", uiIcon("info"), `${name}のやり方`, { expanded: tipOpen }));
  }
  if (c.added) {
    tools.push(toolHtml(c, "remove-card", uiIcon("close"), `${name}をこのトレーニングから外す`, { disabled: anyDone }));
  } else if (c.kind === "cardio" || c.planIndex != null) {
    tools.push(toolHtml(c, "swap", uiIcon("swap"), `${name}を別の種目に替える`, { disabled: anyDone || !canSwap(c) }));
  }
  const collapse = complete ? toolHtml(c, "collapse", uiIcon("chevronDown"), `${name}をたたむ`, { expanded: true }) : "";
  const setBtn = (act, icon, label, disabled) =>
    `<button type="button" class="ses-setcount-btn" data-act="${act}" data-card="${c.key}" data-fk="${c.key}:${act}"` +
    ` aria-label="${label}(${name})"${disabled ? " disabled" : ""}>${icon}</button>`;
  const setTools = c.kind === "cardio" ? "" :
    `<div class="ses-setcount" role="group" aria-label="${name}のセット数">` +
    setBtn("remove-set", ICON_MINUS, "セットを1つ減らす", total <= 1 || c.sets[total - 1].done) +
    `<span class="ses-setcount-label" aria-hidden="true">セット</span>` +
    setBtn("add-set", uiIcon("plus"), "セットを1つ増やす", total >= MAX_SETS) +
    `</div>`;
  return `<li class="${cls}" data-card="${c.key}">` +
    `<div class="ses-card-head">${cardIcon(c)}` +
    `<div class="ses-card-titles"><h3 class="ses-card-name">` +
    `${c.focused ? `<span class="ses-star" aria-hidden="true">★</span><span class="sr-only">強化部位:</span>` : ""}${name}</h3>` +
    `<p class="ses-card-meta">${meta}</p></div>` +
    `<div class="ses-card-side"><p class="ses-card-count"><b>${doneN}</b>/${total}<span class="sr-only">セット完了</span></p>` +
    (tools.length ? `<div class="ses-card-tools">${tools.join("")}</div>` : "") + `</div></div>` +
    (notes.length ? `<div class="ses-notes">${notes.join("")}</div>` : "") +
    `<ol class="ses-sets">${c.sets.map((_, i) => setRowHtml(c, i, next)).join("")}</ol>` +
    (collapse || setTools ? `<div class="ses-card-foot">${collapse}${setTools}</div>` : "") +
    (c.tip ? `<div class="ses-card-tip" id="tip-${c.key}"${tipOpen ? "" : " hidden"}>${uiIcon("bulb")}<p>${escapeHtml(c.tip)}</p></div>` : "") +
    `</li>`;
}

// 1枚のカードの完了分を記録の形にする(たたんだカードの要約用)
function buildCardEntry(c) {
  const done = c.sets.filter((x) => x.done);
  if (c.track === "weight") return { track: "weight", setDetails: done.map((x) => ({ weight: x.weight, reps: x.reps })) };
  if (c.track === "time") return { track: "time", setDetails: done.map((x) => ({ seconds: x.seconds })) };
  const x = done[0] ?? c.sets[0];
  return { track: "cardio", minutes: x.minutes, distance: x.distance, unit: c.unit };
}

function renderHeader() {
  if (!state) return;
  const total = countSets(state);
  const done = countDone(state);
  section.querySelector(".ses-kicker").textContent = state.day.type === "recovery" ? "アクティブレスト(回復日)" : "トレーニング中";
  const { num: dayNum, name: dayName } = dayLabel(state.day);
  section.querySelector(".ses-title").innerHTML =
    (dayNum ? `<span class="ses-day-chip" lang="en">DAY ${dayNum}</span>` : "") + `<span>${escapeHtml(dayName)}</span>`;
  section.querySelector(".ses-progress-text").textContent = `${done}/${total}`;
  section.querySelector(".ses-progress-fill").style.width = `${total ? (done / total) * 100 : 0}%`;
  section.querySelector(".ses-finish").classList.toggle("is-ready", total > 0 && done === total);
  updateElapsed();
}

function updateElapsed() {
  if (!state || !section) return;
  const el = section.querySelector(".ses-elapsed");
  el.textContent = elapsedText(Date.now() - state.startedAt);
}

// フォーカスを保ったままカードを描き直す
function withFocus(fn) {
  const doc = globalThis.document;
  const fk = doc.activeElement?.dataset?.fk;
  fn();
  if (fk) section.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
}

function renderCards() {
  withFocus(() => {
    const next = nextSet();
    section.querySelector(".ses-cards").innerHTML = state.cards.length
      ? state.cards.map((c) => cardHtml(c, next)).join("")
      : `<li class="ses-empty">この日の種目はありません。「種目」ボタンで追加できます。</li>`;
    const recovery = state.day.type === "recovery";
    section.querySelector(".ses-prep-top").innerHTML = prepHtml(recovery ? "体をほぐす" : "ウォームアップ", "flame", state.day.warmup);
    section.querySelector(".ses-prep-bottom").innerHTML = prepHtml(recovery ? "ストレッチ" : "クールダウン", "leaf", state.day.cooldown);
  });
  renderHeader();
}

// 指定したカードと「現在のカード」の表示だけを更新する
function refresh(keys = []) {
  const next = nextSet();
  const want = new Set(keys);
  if (next) want.add(next.key);
  for (const li of section.querySelectorAll(".ses-card.is-current")) want.add(li.dataset.card);
  withFocus(() => {
    for (const key of want) {
      const c = findCard(key);
      const li = section.querySelector(`.ses-card[data-card="${CSS.escape(key)}"]`);
      if (c && li) li.outerHTML = cardHtml(c, next);
    }
  });
  renderHeader();
}

function message(text, kind = "info", { sticky = false } = {}) {
  const el = section?.querySelector(".ses-msg");
  if (!el) return;
  clearTimeout(msgId);
  el.textContent = "";
  el.dataset.kind = kind;
  setTimeout(() => { el.textContent = text; }, 30);
  msgId = sticky ? null : setTimeout(() => { el.textContent = ""; }, kind === "error" ? 9000 : 5000);
}

// 本文(.ses-body)だけをスクロールして el を見える範囲の中央へ。scrollIntoView は後ろのページまで動かすので使わない。
// 休憩タイマーが出ていれば、その上までを見える範囲とする
function reveal(el) {
  const body = section.querySelector(".ses-body");
  const b = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const timer = globalThis.document.getElementById("rest-timer");
  const bottom = timer && !timer.hidden ? Math.min(b.bottom, timer.getBoundingClientRect().top) : b.bottom;
  const room = Math.max(0, bottom - b.top - r.height);
  body.scrollTo({ top: Math.max(0, body.scrollTop + r.top - b.top - room / 2), behavior: reduceMotion() ? "auto" : "smooth" });
}

function focusCheck(key, i) {
  const btn = section.querySelector(`.ses-check[data-card="${CSS.escape(key)}"][data-set="${i}"]`);
  if (!btn) return;
  btn.focus({ preventScroll: true });
  reveal(btn.closest(".ses-set"));
}

// ---------- 操作 ----------

function setValue(c, i, field, value) {
  const sets = c.sets;
  if (field === "weight") c.guess = false; // 重さを自分で選んだら「目安」ではなくなる
  sets[i][field] = value;
  sets[i].touched = true;
  // 後ろの「まだ触っていない・未完了」のセットへ引き継ぐ
  for (let j = i + 1; j < sets.length; j++) {
    if (!sets[j].done && !sets[j].touched) sets[j][field] = value;
  }
  persist();
  refresh([c.key]);
}

// 休憩タイマーを始める(ctx.startRestTimer があればそれを使う)。どのセットの ✓ で始めたかを覚えておき、
// その ✓ を取り消したらタイマーも止める(押し間違いで休憩が動き続けないように)
function startRest(c, i, sec) {
  (typeof ctx.startRestTimer === "function" ? ctx.startRestTimer : startRestTimer)(sec);
  restFrom = { key: c.key, i };
}

function stopRestFrom(c, i) {
  if (!restFrom || restFrom.key !== c.key || restFrom.i !== i) return;
  restFrom = null;
  if (isRunning()) stopRest();
}

function toggleDone(c, i, { auto = false } = {}) {
  const set = c.sets[i];
  // ダブルタップの2回目で、付けたばかりの ✓ を外さない(休憩タイマーも止めない)
  if (set.done && !auto && Date.now() - (set.doneAt ?? 0) < UNCHECK_GUARD_MS) return;
  // 記録も目標も無い重り種目は、目安の重さのまま記録してよいかを1回だけ確かめる(0kg や思い込みの重さを残さない)
  if (!set.done && !auto && c.track === "weight" && c.guess) {
    const now = Date.now();
    if (!(c.guessArmedAt > 0) || now - c.guessArmedAt > 8000) {
      c.guessArmedAt = now;
      message(`${c.name}の重さは目安(${fmtNum(set.weight)}kg)のままです。合っていればもう一度 ✓ を押してください`);
      return;
    }
    if (now - c.guessArmedAt < CONFIRM_GUARD_MS) return;
    c.guess = false;
    delete c.guessArmedAt;
    message("");
  }
  set.done = !set.done;
  set.touched = true;
  if (set.done) set.doneAt = Date.now();
  else delete set.doneAt;
  if (hold && hold.key === c.key && hold.i === i) cancelHold();
  persist();
  if (!set.done) {
    stopRestFrom(c, i);
    refresh([c.key]);
    return;
  }
  vibrate(auto ? [200, 100, 200] : 20);
  if (cardDone(c)) expanded.delete(c.key);
  const next = nextSet();
  if (next) {
    const sec = c.kind === "cardio" ? 0 : parseRestSeconds(c.rest);
    if (sec > 0) startRest(c, i, sec);
  } else {
    message("全セット完了!「記録して終了」で保存しましょう");
  }
  refresh([c.key]);
  if (next) focusCheck(next.key, next.i);
  else section.querySelector(".ses-finish")?.focus({ preventScroll: true });
}

function changeSets(c, delta) {
  if (delta > 0 && c.sets.length < MAX_SETS) {
    const last = c.sets[c.sets.length - 1];
    const copy = { ...last, done: false, touched: false };
    delete copy.doneAt;
    c.sets.push(copy);
  } else if (delta < 0 && c.sets.length > 1 && !c.sets[c.sets.length - 1].done) {
    const removed = c.sets.length - 1;
    if (hold && hold.key === c.key && hold.i === removed) cancelHold();
    c.sets.pop();
  } else {
    return;
  }
  persist();
  refresh([c.key]);
}

function swapCard(c) {
  if (c.sets.some((x) => x.done)) return;
  const profile = ctx.profile ?? loadProfile();
  const logs = ctxLogs();
  const oldName = c.name;
  let fresh = null;
  if (c.kind === "cardio") {
    const alt = alternativeCardio(profile, logs, c.name, new Date(), { day: state.day });
    if (alt) {
      state.day.cardio = alt;
      fresh = cardioCard(alt, logs);
    }
  } else if (c.planIndex != null) {
    const fn = typeof ctx.alternativeExercise === "function" ? ctx.alternativeExercise : alternativeExercise;
    const alt = fn(profile, logs, state.day, c.planIndex);
    if (alt?.name) {
      state.day.exercises[c.planIndex] = alt;
      fresh = liftCard(alt, c.planIndex, logs);
    }
  }
  if (!fresh) {
    message("入れ替えられる種目がありません(器具・レベルの条件)");
    return;
  }
  fresh.key = c.key; // フォーカスと開閉状態を保つ
  state.cards[state.cards.indexOf(c)] = fresh;
  persist();
  refresh([c.key]);
  message(`「${oldName}」を「${fresh.name}」に変更しました`);
}

function removeCard(c) {
  if (!c.added || c.sets.some((x) => x.done)) return;
  if (hold?.key === c.key) cancelHold();
  state.cards = state.cards.filter((x) => x !== c);
  persist();
  renderCards();
  message(`「${c.name}」を削除しました`);
  section.querySelector(".ses-add")?.focus({ preventScroll: true });
}

// ---------- キープ(体幹種目)のカウントダウン ----------

function holdLabel() {
  if (!hold) return "";
  const left = Math.max(0, hold.endAt - Date.now());
  if (hold.phase === "prep") return `準備 ${Math.ceil(left / 1000)}`;
  return formatClock(Math.ceil(left / 1000));
}

// ▶ でキープを始める。休憩タイマーが動いていれば、休憩は終わったものとして閉じる
function startHold(c, i) {
  unlockAudio();
  cancelHold();
  if (isRunning()) stopRest();
  const seconds = c.sets[i].seconds;
  hold = { key: c.key, i, phase: "prep", endAt: Date.now() + PREP_MS, seconds, id: setInterval(tickHold, 200) };
  message(`3秒後にキープ開始(${seconds}秒)`);
  refresh([c.key]);
  tickHold();
}

function cancelHold() {
  if (!hold) return;
  clearInterval(hold.id);
  const key = hold.key;
  hold = null;
  if (state && section && findCard(key)) refresh([key]);
}

function tickHold() {
  if (!hold || !state) return;
  const now = Date.now();
  if (hold.phase === "prep" && now >= hold.endAt) {
    hold.phase = "hold";
    hold.endAt += hold.seconds * 1000;
    if (now - (hold.endAt - hold.seconds * 1000) <= LATE_CUE_MS) {
      playBeep("start");
      vibrate(60);
    }
    message(`キープ開始(${hold.seconds}秒)`);
  }
  if (hold.phase === "hold" && now >= hold.endAt) {
    const { key, i, endAt } = hold;
    clearInterval(hold.id);
    hold = null;
    const c = findCard(key);
    if (!c || !c.sets[i] || c.sets[i].done) {
      if (c) refresh([key]);
      return;
    }
    if (now - endAt <= LATE_CUE_MS) playBeep("end");
    message("キープ終了!");
    toggleDone(c, i, { auto: true });
    return;
  }
  const btn = section.querySelector(`.ses-hold[data-card="${CSS.escape(hold.key)}"][data-set="${hold.i}"]`);
  if (!btn) return;
  btn.classList.toggle("is-prep", hold.phase === "prep");
  btn.querySelector(".ses-hold-text").textContent = holdLabel();
  const total = hold.phase === "prep" ? PREP_MS : hold.seconds * 1000;
  const left = Math.max(0, hold.endAt - now);
  btn.querySelector(".ses-hold-fill").style.width = `${hold.phase === "prep" ? 0 : (1 - left / total) * 100}%`;
  btn.setAttribute("aria-label", hold.phase === "prep" ? "キープを中止(準備中)" : `キープを中止(残り${Math.ceil(left / 1000)}秒)`);
}

// ---------- イベント ----------

function onClick(e) {
  const el = e.target.closest?.("[data-act]");
  if (!el || !section.contains(el) || el.disabled || !state) return;
  const act = el.dataset.act;
  const c = el.dataset.card ? findCard(el.dataset.card) : null;
  const i = el.dataset.set != null ? Number(el.dataset.set) : -1;
  switch (act) {
    case "dec":
    case "inc": {
      if (!c || !c.sets[i]) return;
      const field = el.dataset.field;
      const list = FIELDS[field].list(c);
      setValue(c, i, field, stepIn(list, c.sets[i][field], act === "inc" ? 1 : -1));
      break;
    }
    case "check":
      if (c && c.sets[i]) toggleDone(c, i);
      break;
    case "hold":
      if (!c || !c.sets[i] || c.sets[i].done) return;
      if (hold && hold.key === c.key && hold.i === i) cancelHold();
      else startHold(c, i);
      break;
    case "tip":
      if (!c) return;
      if (tipsOpen.has(c.key)) tipsOpen.delete(c.key);
      else tipsOpen.add(c.key);
      refresh([c.key]);
      break;
    case "expand":
    case "collapse":
      if (!c) return;
      if (act === "expand") expanded.add(c.key);
      else expanded.delete(c.key);
      refresh([c.key]);
      section.querySelector(`[data-fk="${CSS.escape(`${c.key}:${act === "expand" ? "collapse" : "expand"}`)}"]`)?.focus({ preventScroll: true });
      break;
    case "swap":
      if (c) swapCard(c);
      break;
    case "remove-card":
      if (c) removeCard(c);
      break;
    case "add-set":
    case "remove-set":
      if (c) changeSets(c, act === "add-set" ? 1 : -1);
      break;
    case "pause":
      openPauseSheet();
      break;
    case "add-ex":
      openAddSheet();
      break;
    case "finish":
      finish();
      break;
    default:
  }
}

function onChange(e) {
  const el = e.target;
  if (!el.matches?.(".ses-val-select") || !state) return;
  const c = findCard(el.dataset.card);
  const i = Number(el.dataset.set);
  const value = num(el.value);
  if (!c || !c.sets[i] || value == null) return;
  setValue(c, i, el.dataset.field, value);
}

// ---------- シート(中断・種目追加・確認・結果) ----------

function closeSheet() {
  if (!sheet) return;
  const { layer, prevFocus } = sheet;
  sheet = null;
  layer.remove();
  if (section && !section.hidden) section.inert = false;
  if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
}

// actions: [{ label, kind: "primary"|"danger"|"ghost", run(layer), confirm?: "もう一度タップで…", disabled? }]
function openSheet({ title, body = "", actions, onCancel, className = "" }) {
  const doc = globalThis.document;
  closeSheet();
  const layer = doc.createElement("div");
  layer.className = `ses-sheet-layer ${className}`.trim();
  layer.innerHTML =
    `<div class="ses-sheet-backdrop" data-sheet-cancel></div>` +
    `<div class="ses-sheet" role="dialog" aria-modal="true" aria-labelledby="ses-sheet-title">` +
    `<h2 class="ses-sheet-title" id="ses-sheet-title" tabindex="-1">${escapeHtml(title)}</h2>` +
    `<div class="ses-sheet-body">${body}</div>` +
    `<div class="ses-sheet-actions">${actions.map((a, i) =>
      `<button type="button" class="ses-sheet-btn is-${a.kind ?? "ghost"}" data-sheet-act="${i}"${a.disabled ? " disabled" : ""}>${escapeHtml(a.label)}</button>`).join("")}</div>` +
    `</div>`;
  doc.body.appendChild(layer);
  const openedAt = Date.now();
  sheet = { layer, prevFocus: doc.activeElement };
  if (section && !section.hidden) section.inert = true;
  const cancel = () => {
    closeSheet();
    onCancel?.();
  };
  layer.addEventListener("click", (e) => {
    // シートを開いたボタンへのダブルタップの2回目は、背景(閉じる)やボタンに当てない
    if (Date.now() - openedAt < SHEET_GUARD_MS) return;
    if (e.target.closest("[data-sheet-cancel]")) return cancel();
    const btn = e.target.closest("[data-sheet-act]");
    if (!btn || btn.disabled) return;
    const a = actions[Number(btn.dataset.sheetAct)];
    if (a.confirm && (btn.dataset.armed !== "1" || Date.now() - Number(btn.dataset.armedAt) < CONFIRM_GUARD_MS)) {
      // 取り消せない操作は2回タップで確定(ダブルタップの2回目では確定しない)
      if (btn.dataset.armed === "1") return;
      btn.dataset.armed = "1";
      btn.dataset.armedAt = String(Date.now());
      btn.textContent = a.confirm;
      setTimeout(() => {
        if (btn.isConnected) {
          btn.dataset.armed = "";
          btn.textContent = a.label;
        }
      }, 4000);
      return;
    }
    a.run(layer);
  });
  layer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Tab") {
      // フォーカスをシートの中に留める
      const items = [...layer.querySelectorAll("button:not([disabled]), select, input, [tabindex='0']")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  layer.querySelector(".ses-sheet-title").focus({ preventScroll: true });
  return layer;
}

function openPauseSheet() {
  if (!state) return;
  const done = countDone(state);
  const total = countSets(state);
  openSheet({
    title: "トレーニングを中断",
    body: `<p class="ses-sheet-text">${done}/${total}セット完了・経過 ${elapsedText(Date.now() - state.startedAt)}</p>` +
      (done === 0 ? `<p class="ses-sheet-note">完了したセットがないため、保存はできません。</p>` : ""),
    actions: [
      { label: "保存して終了", kind: "primary", disabled: done === 0, run: () => { closeSheet(); save(); } },
      { label: "破棄", kind: "danger", confirm: done > 0 ? "もう一度タップで破棄" : null, run: () => { closeSheet(); discard(); } },
      { label: "続ける", kind: "ghost", run: () => closeSheet() },
    ],
  });
}

function namesHtml(track) {
  return exerciseChoices(track).map((g) =>
    `<optgroup label="${escapeHtml(g.label)}">${g.names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}</optgroup>`
  ).join("");
}

function openAddSheet() {
  if (!state) return;
  const radios = Object.entries(TRACK_LABELS).map(([t, label], i) =>
    `<label class="ses-seg-item"><input type="radio" name="ses-add-track" value="${t}"${i === 0 ? " checked" : ""}><span>${label}</span></label>`).join("");
  const layer = openSheet({
    title: "種目を追加",
    body: `<div class="ses-seg" role="radiogroup" aria-label="記録の種類">${radios}</div>` +
      `<label class="ses-field"><span>種目</span><select class="ses-add-name">${namesHtml("weight")}</select></label>`,
    actions: [
      {
        label: "追加", kind: "primary",
        run: (l) => {
          const track = l.querySelector("input[name=ses-add-track]:checked")?.value ?? "weight";
          const name = l.querySelector(".ses-add-name")?.value;
          closeSheet();
          if (name) addExercise(name, track);
        },
      },
      { label: "キャンセル", kind: "ghost", run: () => closeSheet() },
    ],
  });
  layer.querySelector(".ses-seg").addEventListener("change", (e) => {
    const sel = layer.querySelector(".ses-add-name");
    sel.innerHTML = namesHtml(e.target.value);
  });
}

function addExercise(name, track) {
  const logs = ctxLogs();
  const card = track === "cardio"
    ? cardioCard({ name, isPool: isPoolExercise(name) }, logs, { added: true })
    : liftCard({
      name, track, sets: track === "time" ? 2 : 3,
      reps: track === "time" ? "30〜60秒キープ" : "8〜12回", rest: track === "time" ? "45〜60秒" : "60〜90秒",
    }, null, logs, { added: true });
  // 有酸素はいちばん最後に行うので、筋トレ種目はその前に入れる
  const last = state.cards[state.cards.length - 1];
  if (card.kind === "lift" && last?.kind === "cardio" && !last.added) state.cards.splice(state.cards.length - 1, 0, card);
  else state.cards.push(card);
  persist();
  renderCards();
  message(`「${name}」を追加しました`);
  focusCheck(card.key, 0);
}

function finish() {
  if (!state) return;
  const done = countDone(state);
  const total = countSets(state);
  if (done === 0) {
    message("まだ完了したセットがありません。終わったセットの ✓ を押してください", "error");
    return;
  }
  if (done < total) {
    openSheet({
      title: "記録して終了しますか?",
      body: `<p class="ses-sheet-text">${done}/${total}セット完了。未完了の${total - done}セットは記録されません。</p>`,
      actions: [
        { label: "記録して終了", kind: "primary", run: () => { closeSheet(); save(); } },
        { label: "続ける", kind: "ghost", run: () => closeSheet() },
      ],
    });
    return;
  }
  save();
}

// 記録を保存する(ctx.onSave が false を返したら失敗扱い)。成功なら { log, prs }
async function persistLog(session, context) {
  const log = buildSessionLog(session);
  if (!log) return null;
  const prev = Array.isArray(context.logs) ? context.logs : loadLogs();
  let prs = [];
  try {
    prs = detectPRs(prev, log);
  } catch {
    prs = [];
  }
  let ok;
  try {
    ok = await (typeof context.onSave === "function" ? context.onSave(log) : addLog(log));
  } catch {
    ok = false;
  }
  if (ok === false) return null;
  clearSession();
  return { log, prs };
}

let saving = false;
async function save() {
  if (!state || saving) return;
  saving = true;
  const result = await persistLog(state, ctx);
  saving = false;
  if (!result) {
    message("保存できませんでした。もう一度「記録して終了」を押してください(記録はこの画面に残っています)", "error");
    return;
  }
  cancelHold();
  stopRest();
  state = null;
  showSummary(result);
}

function showSummary({ log, prs }) {
  const sets = log.entries.reduce((n, e) => n + (e.track === "cardio" ? 1 : e.sets), 0);
  const volume = totalVolume(log);
  const stat = (label, value) => `<div class="ses-sum-stat"><dt>${label}</dt><dd>${value}</dd></div>`;
  const prList = prs.length
    ? `<ul class="ses-pr-list">${prs.map((p) =>
      `<li>${uiIcon("trophy")}<span>${escapeHtml(p.name)} ${escapeHtml(p.label ?? "")} <b>${escapeHtml(fmtNum(p.value))}${escapeHtml(p.unit ?? "")}</b>` +
      `${p.prev != null ? `<small>(前回ベスト ${escapeHtml(fmtNum(p.prev))}${escapeHtml(p.unit ?? "")})</small>` : ""}</span></li>`).join("")}</ul>`
    : "";
  openSheet({
    title: "おつかれさまでした!",
    className: "is-summary",
    body: `<dl class="ses-sum-grid">${stat("時間", `${log.durationMin}<small>分</small>`)}${stat("完了セット", `${sets}`)}` +
      `${stat("総挙上量", volume > 0 ? `${escapeHtml(formatNum(volume, 1))}<small>kg</small>` : "—")}${stat("種目", `${log.entries.length}`)}</dl>` +
      (prs.length ? `<p class="ses-sheet-text">自己ベストを更新しました!</p>${prList}` : `<p class="ses-sheet-text">記録を保存しました。</p>`),
    actions: [{ label: "閉じる", kind: "primary", run: () => { closeSheet(); closeOverlay({ saved: true, log, prs }); } }],
    onCancel: () => closeOverlay({ saved: true, log, prs }),
  });
}

function discard() {
  cancelHold();
  stopRest();
  clearSession();
  state = null;
  closeOverlay({ saved: false, discarded: true });
}

// ---------- 開閉 ----------

function onVisibility() {
  if (!state) return;
  if (globalThis.document.visibilityState === "visible") {
    updateElapsed();
    tickHold();
  } else {
    persist();
  }
}

function showOverlay(s, context) {
  const doc = globalThis.document;
  ctx = context ?? {};
  state = s;
  expanded.clear();
  tipsOpen.clear();
  prevCache.clear();
  ensureSection();
  initTimer();
  openerFocus = doc.activeElement;
  openerScroll = globalThis.scrollY ?? 0;
  // 背景の画面を操作・読み上げの対象から外す
  for (const el of doc.body.children) {
    if (el === section || el.id === "rest-timer" || el.inert || el.classList.contains("ses-sheet-layer")) continue;
    if (!/^(HEADER|MAIN|NAV|FOOTER|ASIDE|SECTION|FORM|DIV)$/.test(el.tagName)) continue;
    if (el.matches("[aria-live], [role=status], [role=alert], [class*=toast]")) continue;
    el.inert = true;
    inerted.push(el);
  }
  section.hidden = false;
  section.inert = false;
  doc.body.classList.add("session-open");
  storageFailed = false;
  renderCards();
  // 休憩中にアプリが落ちた・再読み込みした場合は、残りの休憩を続きから表示する
  if (s.rest && !isRunning()) resumeRest(s.rest);
  persist();
  clearInterval(elapsedId);
  elapsedId = setInterval(updateElapsed, 1000);
  doc.addEventListener("visibilitychange", onVisibility);
  globalThis.addEventListener?.("pagehide", persist);
  acquireWakeLock("session");
  section.querySelector(".ses-body").scrollTop = 0;
  const next = nextSet();
  if (next && countDone(state) > 0) focusCheck(next.key, next.i);
  else section.querySelector(".ses-title").focus({ preventScroll: true });
}

function closeOverlay(result) {
  const doc = globalThis.document;
  clearInterval(elapsedId);
  elapsedId = null;
  cancelHold();
  doc.removeEventListener("visibilitychange", onVisibility);
  globalThis.removeEventListener?.("pagehide", persist);
  releaseWakeLock("session");
  if (section) {
    section.hidden = true;
    section.querySelector(".ses-cards").innerHTML = "";
  }
  doc.body.classList.remove("session-open");
  for (const el of inerted.splice(0)) el.inert = false;
  state = null;
  restFrom = null;
  const context = ctx;
  globalThis.scrollTo?.(0, openerScroll);
  if (openerFocus?.isConnected) openerFocus.focus({ preventScroll: true });
  openerFocus = null;
  context.onClose?.(result);
}

const sameDay = (a, b) =>
  !!a && !!b && String(a.title ?? "") === String(b.title ?? "") &&
  (!Number.isInteger(a.index) || !Number.isInteger(b.index ?? b.dayIndex) || a.index === (b.index ?? b.dayIndex));

// 日のメニューからセッションを開始する。記録していない前のセッションがあれば、続けるか破棄するかを選ぶ。
// ctx = { logs, profile, onSave(log), startRestTimer, alternativeExercise, onClose(result) }
//   onSave(log) は保存に失敗したら false を返す(Promise でもよい)。省略時は storage.addLog。
//   alternativeExercise は planner と同じ (profile, logs, day, exIndex) で呼ぶ(省略時は planner のもの)。
//   onClose({ saved, log?, prs?, discarded? }) は画面を閉じたときに呼ぶ。
export function openSession(daySnapshot, context = {}) {
  if (isSessionOpen()) return false;
  removeBanner();
  const stored = validSession(loadSession());
  if (stored) {
    const fresh = Date.now() - stored.startedAt < STALE_MS;
    const doneN = countDone(stored);
    if (fresh && (!daySnapshot || sameDay(stored.day, daySnapshot))) {
      showOverlay(stored, context);
      return true;
    }
    if (doneN > 0) {
      conflictSheet(stored, fresh, daySnapshot, context);
      return true;
    }
    clearSession();
  }
  if (!daySnapshot) return false;
  const logs = Array.isArray(context.logs) ? context.logs : loadLogs();
  showOverlay(createSession(daySnapshot, logs), context);
  return true;
}

function conflictSheet(stored, fresh, daySnapshot, context) {
  const start = () => {
    if (!daySnapshot) return;
    const logs = Array.isArray(context.logs) ? context.logs : loadLogs();
    showOverlay(createSession(daySnapshot, logs), context);
  };
  const actions = [];
  if (fresh) actions.push({ label: "前回の続きを再開", kind: "primary", run: () => { closeSheet(); showOverlay(stored, context); } });
  else {
    actions.push({
      label: "前回分を記録して開始", kind: "primary",
      run: async () => {
        closeSheet();
        const r = await persistLog(stored, context);
        if (r) {
          context.onClose?.({ saved: true, log: r.log, prs: r.prs });
          start();
        }
      },
    });
  }
  if (daySnapshot) {
    actions.push({ label: "破棄して新しく開始", kind: "danger", confirm: "もう一度タップで破棄", run: () => { closeSheet(); clearSession(); start(); } });
  }
  actions.push({ label: "キャンセル", kind: "ghost", run: () => closeSheet() });
  openSheet({
    title: "記録していないトレーニングがあります",
    body: `<p class="ses-sheet-text">${escapeHtml(dayText(stored.day))}・${countDone(stored)}/${countSets(stored)}セット完了(${escapeHtml(startedText(Date.now() - stored.startedAt))})</p>`,
    actions,
  });
}

// ---------- 再開の案内 ----------

function removeBanner() {
  banner?.remove();
  banner = null;
}

// 保存されたセッションがあればメイン画面の上部に案内を出す(12時間以内: 再開/破棄、それより前: 記録する/破棄)。
// 案内を出したら true。完了セットの無い古いセッションは黙って消す。
export function resumeSessionIfAny(context = {}) {
  if (isSessionOpen()) return false;
  const raw = loadSession();
  const stored = validSession(raw);
  if (!stored) {
    if (raw) clearSession();
    removeBanner();
    return false;
  }
  const age = Date.now() - stored.startedAt;
  const fresh = age < STALE_MS;
  const doneN = countDone(stored);
  if (!fresh && doneN === 0) {
    clearSession();
    removeBanner();
    return false;
  }
  const doc = globalThis.document;
  removeBanner();
  banner = doc.createElement("div");
  banner.className = "session-resume";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "途中のトレーニング");
  const when = fresh ? startedText(age) : `${formatShortDate(localDateStr(new Date(stored.startedAt)))}に開始`;
  banner.innerHTML =
    `<span class="session-resume-ico" aria-hidden="true">${uiIcon("timer")}</span>` +
    `<div class="session-resume-body">` +
    `<p class="session-resume-text"><strong>${fresh ? "途中のトレーニングがあります" : "記録していないトレーニングがあります"}</strong>` +
    `<span>${[dayText(stored.day), `${doneN}/${countSets(stored)}セット完了`, when]
      .map((t) => `<span class="ses-meta-part">${escapeHtml(t)}</span>`).join("・")}</span></p>` +
    `<div class="session-resume-actions">` +
    `<button type="button" class="session-resume-btn is-primary" data-resume="${fresh ? "resume" : "save"}">` +
    `${uiIcon(fresh ? "play" : "check")}<span>${fresh ? "再開" : "記録する"}</span></button>` +
    `<button type="button" class="session-resume-btn" data-resume="discard">破棄</button></div></div>`;
  banner.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-resume]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.resume;
    if (act === "resume") {
      removeBanner();
      openSession(null, context);
    } else if (act === "save") {
      btn.disabled = true;
      const r = await persistLog(stored, context);
      if (r) {
        removeBanner();
        context.onClose?.({ saved: true, log: r.log, prs: r.prs });
      } else {
        btn.disabled = false;
      }
    } else if (act === "discard") {
      if (doneN > 0 && (btn.dataset.armed !== "1" || Date.now() - Number(btn.dataset.armedAt) < CONFIRM_GUARD_MS)) {
        if (btn.dataset.armed === "1") return; // ダブルタップの2回目では破棄しない
        btn.dataset.armed = "1";
        btn.dataset.armedAt = String(Date.now());
        btn.textContent = "もう一度タップで破棄";
        setTimeout(() => {
          if (btn.isConnected) {
            btn.dataset.armed = "";
            btn.textContent = "破棄";
          }
        }, 4000);
        return;
      }
      clearSession();
      removeBanner();
    }
  });
  // メイン画面のお知らせ欄(無ければ main の先頭)に出す
  (doc.getElementById("notices") ?? doc.querySelector("main") ?? doc.body).prepend(banner);
  return true;
}
