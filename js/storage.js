// localStorage へのアクセスをすべてここに集約する(他のモジュールは localStorage に触れない)。
// - 読み込みは必ず検証・正規化してから返す(壊れたデータで画面が止まらない)
// - 書き込みは検証してから行い、容量不足などの失敗は false を返して onError で知らせる
// - 読めなかった元データは消さずに「<キー>_corrupt」へ一度だけ退避する
// - 旧バージョンの記録形式(文字列の数値・track なし・km 表記のプール距離など)を移行する
import {
  getExerciseTrack, getDistanceUnit, allExerciseNames, EQUIPMENT, MUSCLE_LABELS, GOALS, LEVELS,
} from "./planner.js?v=14";
import { toDateStr, localDateStr, daysBetween, uid } from "./util.js?v=14";

export const SCHEMA_VERSION = 2;
export const BACKUP_APP_ID = "ai-workout-planner";

// 既存ユーザーとの互換のためキー名は変えない
export const KEYS = {
  logs: "workout_logs",
  profile: "workout_profile",
  bodyweight: "bodyweight_logs",
  plan: "workout_plan",
  draft: "workout_log_draft",
  session: "workout_active_session",
  meta: "workout_meta",
  importUndo: "workout_import_undo", // 直前の読み込みを取り消すための控え
};
// 旧バージョン(Claude API 連携時代)の残骸。同一オリジンの他ページから読めるので起動時に消す
const LEGACY_KEYS = ["anthropic_api_key", "force_builtin"];
const CORRUPT_SUFFIX = "_corrupt";
// バックアップ・取り消しの対象になる「ユーザーデータ」のキー
const DATA_KEYS = ["logs", "bodyweight", "profile", "plan"];

export const MESSAGES = {
  quota: "保存できませんでした(端末の保存容量が不足しているか、保存が制限されています)。「データを書き出す」でバックアップしてから、古い記録を整理してください。",
  corrupt: "保存データの一部が読み込めませんでした。元のデータは端末内に退避してあります。「データを書き出す」でファイルに保存できます。",
  unavailable: "この端末(ブラウザ)ではデータを保存できません。プライベートブラウズを解除するか、設定で保存を許可してください。",
  invalid: "記録の内容が正しくないため保存できませんでした。",
};

// ---------- 低レベルのアクセス ----------

let injectedStorage = null;
let memoryFallback = null;
let onErrorCb = null;
const reported = new Set();     // 同じ破損を何度も通知しない
const corruptKeys = new Set();  // 読み込みに失敗したキー(書き出しに生データを添える)
const initializedFor = new WeakSet();

function backend() {
  if (injectedStorage) return injectedStorage;
  try {
    const ls = globalThis.localStorage;
    if (ls) return ls;
  } catch { /* SecurityError: 保存がブロックされている */ }
  if (!memoryFallback) {
    const map = new Map();
    memoryFallback = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
    report(MESSAGES.unavailable, "unavailable");
  }
  return memoryFallback;
}

let lastReport = { message: "", at: 0 };
function report(message, onceKey = null) {
  if (onceKey) {
    if (reported.has(onceKey)) return;
    reported.add(onceKey);
  }
  // 連続したタップで同じエラーが何度も出ないようにする
  const now = Date.now();
  if (lastReport.message === message && now - lastReport.at < 5000) return;
  lastReport = { message, at: now };
  try { onErrorCb?.(message); } catch { /* 通知側の不具合で保存処理を止めない */ }
}

function readRaw(key) {
  try { return backend().getItem(key); } catch { return null; }
}

// 書き込み。loud=true なら失敗を onError で知らせる
function writeRaw(key, str, loud = false) {
  try {
    backend().setItem(key, str);
    return true;
  } catch {
    if (loud) report(MESSAGES.quota);
    return false;
  }
}

function removeRaw(key) {
  try { backend().removeItem(key); return true; } catch { return false; }
}

// 読めなかった生データを「<キー>_corrupt」へ一度だけ退避する。退避済みなら true
function quarantine(key, raw) {
  if (raw == null) return true;
  const ck = key + CORRUPT_SUFFIX;
  if (readRaw(ck) != null) return true;
  return writeRaw(ck, raw);
}

function markCorrupt(key, raw) {
  corruptKeys.add(key);
  quarantine(key, raw);
  report(MESSAGES.corrupt, "corrupt:" + key);
}

const MISSING = Symbol("missing");
const BROKEN = Symbol("broken");

// JSON を読む。critical=true(記録・体重・プロフィール)は壊れていれば退避して通知する。
// それ以外(下書き・メニュー・メタ情報)は作り直せるので黙って無視する。
function readJSON(key, critical) {
  const raw = readRaw(key);
  if (raw == null) return { raw, value: MISSING };
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    if (critical) markCorrupt(key, raw);
    return { raw, value: BROKEN };
  }
}

// JSON で保存する。読めなかったキーは、元データを退避できるまで上書きしない
function writeJSON(key, value, loud = true) {
  if (corruptKeys.has(key) && !quarantine(key, readRaw(key))) {
    if (loud) report(MESSAGES.quota);
    return false;
  }
  let str;
  try { str = JSON.stringify(value); } catch { if (loud) report(MESSAGES.invalid); return false; }
  const ok = writeRaw(key, str, loud);
  if (ok) corruptKeys.delete(key);
  return ok;
}

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// ---------- 正規化(旧形式の移行を含む。純粋関数) ----------

const TRACKS = new Set(["weight", "time", "cardio"]);
const UNITS = new Set(["m", "km"]);
const GENDERS = ["男性", "女性", "その他・回答しない"];
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
let knownNames = null;
const isKnownExercise = (name) => (knownNames ??= new Set(allExerciseNames())).has(name);
const isPool = (name) => getDistanceUnit(name) === "m";

// 数値化("60" → 60。空文字・不正値・負の値は null)
function num(v) {
  let n = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim() !== "") n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const posInt = (v) => {
  const n = num(v);
  return n != null && n >= 1 ? Math.round(n) : null;
};
const posNum = (v) => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};
const has = (e, k) => e[k] != null && e[k] !== "";

// 記録された「形」から track を推定する(旧形式の track なし対策)。
// 値の入っている欄を優先し、欄が何も無いときだけ種目データベースに従う。
function inferTrack(e, name) {
  if (TRACKS.has(e.track)) return e.track;
  if (has(e, "minutes") || has(e, "distance")) return "cardio";
  if (has(e, "seconds")) return "time";
  if (has(e, "weight") || has(e, "reps") || has(e, "sets")) return "weight";
  return getExerciseTrack(name);
}

function normalizeSetDetails(list, track) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const s of list) {
    if (!isPlainObject(s)) continue;
    if (track === "time") {
      const seconds = num(s.seconds);
      if (seconds != null) out.push({ ...s, seconds });
    } else if (track === "weight") {
      const reps = posInt(s.reps);
      if (reps != null) out.push({ ...s, weight: num(s.weight) ?? 0, reps });
    }
  }
  return out.length > 0 ? out : null;
}

// 1種目分の記録を正規化する(名前の無いもの・オブジェクトでないものは null)。
// 旧形式の値はそのまま残し、種目データベースと形が食い違うもの(例: 旧版で「回数」として
// 記録したプランクやランニング)には shapeMismatch: <本来の track> を付ける。
// shapeMismatch 付きの記録は一覧には表示してよいが、グラフ・1RM・自己ベスト・前回値には使わない。
export function normalizeEntry(e) {
  if (!isPlainObject(e)) return null;
  if (typeof e.name !== "string" && typeof e.name !== "number") return null;
  const name = String(e.name).trim().slice(0, 100);
  if (!name) return null;
  const track = inferTrack(e, name);
  const out = {
    ...e, name, track,
    weight: null, sets: posInt(e.sets) ?? 1, reps: null,
    seconds: null, minutes: null, distance: null, unit: null,
  };
  const details = normalizeSetDetails(e.setDetails, track);
  if (details) out.setDetails = details;
  else delete out.setDetails;

  if (track === "weight") {
    out.weight = num(e.weight) ?? 0; // 空欄・0 は自重
    out.reps = posInt(e.reps);
    if (details) {
      // セット詳細しか無いときは、最も重いセットを要約値にする
      if (!has(e, "weight") && !has(e, "reps")) {
        const top = details.reduce((a, b) =>
          (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
        out.weight = top.weight;
        out.reps = top.reps;
      }
      if (!has(e, "sets")) out.sets = details.length;
    }
  } else if (track === "time") {
    out.seconds = num(e.seconds);
    if (details) {
      if (out.seconds == null) out.seconds = Math.max(...details.map((s) => s.seconds));
      if (!has(e, "sets")) out.sets = details.length;
    }
  } else {
    out.minutes = num(e.minutes);
    out.distance = posNum(e.distance);
    const given = UNITS.has(e.unit) ? e.unit : null;
    if (isPool(name)) {
      // 旧版はプールの距離も km で保存していた(1.2 = 1200m)。25 未満の値だけを km とみなして m に直す
      if (out.distance != null && given !== "m" && out.distance < 25) {
        out.distance = Math.round(out.distance * 1000);
        out.unit = "m";
      } else {
        out.unit = given ?? "m";
      }
    } else {
      out.unit = given ?? "km";
    }
  }

  const dbTrack = isKnownExercise(name) ? getExerciseTrack(name) : null;
  if (dbTrack && dbTrack !== track) out.shapeMismatch = dbTrack;
  else delete out.shapeMismatch;
  return out;
}

// 1回分の記録を正規化する。日付が不正・種目が1つも無いものは log: null
function normalizeLog(l) {
  if (!isPlainObject(l)) return { log: null, droppedEntries: 0 };
  const date = toDateStr(l.date);
  if (!date || !Array.isArray(l.entries)) {
    return { log: null, droppedEntries: Array.isArray(l.entries) ? l.entries.length : 0 };
  }
  const entries = l.entries.map(normalizeEntry).filter(Boolean);
  const droppedEntries = l.entries.length - entries.length;
  if (entries.length === 0) return { log: null, droppedEntries };
  const out = { ...l, date, entries };
  const id = typeof l.id === "number" && Number.isFinite(l.id) ? String(l.id) : l.id;
  if (typeof id === "string" && ID_RE.test(id)) out.id = id;
  else delete out.id;
  const pd = l.planDay;
  if (isPlainObject(pd) && Number.isInteger(pd.index) && pd.index >= 0 && typeof pd.title === "string") {
    out.planDay = { index: pd.index, title: pd.title.slice(0, 100) };
  } else {
    delete out.planDay;
  }
  for (const k of ["startedAt", "createdAt", "updatedAt"]) {
    if (!(typeof l[k] === "number" && Number.isFinite(l[k]))) delete out[k];
  }
  const dur = num(l.durationMin);
  if (dur != null) out.durationMin = dur;
  else delete out.durationMin;
  return { log: out, droppedEntries };
}

// 同じ日付の中での並び順(新しいものほど大きい)
function orderKey(l, index) {
  if (l.startedAt != null) return l.startedAt;
  if (/^\d{10,}$/.test(l.id)) return Number(l.id); // 旧版の id = 保存時刻(ミリ秒)
  if (l.createdAt != null) return l.createdAt;
  return index;
}

// 記録一覧を正規化する(新しい順)。id が無い・重複するものには決まった規則で id を振る
// (読み込むたびに同じ id になるので、削除や編集が確実に対象を指せる)。
export function normalizeLogs(raw) {
  const result = { logs: [], dropped: { logs: 0, entries: 0 } };
  if (!Array.isArray(raw)) return result;
  const seen = new Set();
  const keyed = [];
  raw.forEach((item, index) => {
    const { log, droppedEntries } = normalizeLog(item);
    result.dropped.entries += droppedEntries;
    if (!log) {
      result.dropped.logs++;
      return;
    }
    if (!log.id || seen.has(log.id)) {
      const base = `${log.date.replace(/-/g, "")}-${index}`;
      let id = base;
      for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
      log.id = id;
    }
    seen.add(log.id);
    keyed.push({ log, key: orderKey(log, index) });
  });
  keyed.sort((a, b) => (a.log.date === b.log.date ? b.key - a.key : a.log.date < b.log.date ? 1 : -1));
  result.logs = keyed.map((k) => k.log);
  return result;
}

// 体重記録: [{date, weight:number}] 古い順。同じ日付は後のものを採用
export function normalizeBodyweight(raw) {
  const result = { list: [], invalid: 0, duplicates: 0 };
  if (!Array.isArray(raw)) return result;
  const byDate = new Map();
  for (const b of raw) {
    const date = isPlainObject(b) ? toDateStr(b.date) : null;
    const weight = date ? num(b.weight) : null;
    if (!date || weight == null || weight < 20 || weight > 300) {
      result.invalid++;
      continue;
    }
    if (byDate.has(date)) result.duplicates++;
    byDate.set(date, { ...b, date, weight: Math.round(weight * 10) / 10 });
  }
  result.list = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return result;
}

const DEFAULT_PROFILE = {
  weight: 65, height: 170, age: 30, gender: "その他・回答しない", goal: "hypertrophy", level: "beginner", frequency: 3,
};

// プロフィール: 選択肢にない値は既定値に、部位・器具は既知のものだけ残す
export function normalizeProfile(p) {
  if (!isPlainObject(p)) return null;
  const inRange = (v, lo, hi, def) => {
    const n = num(v);
    return n != null && n >= lo && n <= hi ? n : def;
  };
  const pick = (v, allowed, def) => (allowed.includes(v) ? v : def);
  const subset = (v, allowed) =>
    (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && allowed.includes(x)))] : []);
  return {
    ...p,
    weight: inRange(p.weight, 20, 300, DEFAULT_PROFILE.weight),
    height: inRange(p.height, 100, 250, DEFAULT_PROFILE.height),
    age: Math.round(inRange(p.age, 5, 120, DEFAULT_PROFILE.age)),
    gender: pick(p.gender, GENDERS, DEFAULT_PROFILE.gender),
    goal: pick(p.goal, Object.keys(GOALS), DEFAULT_PROFILE.goal),
    level: pick(p.level, Object.keys(LEVELS), DEFAULT_PROFILE.level),
    frequency: Math.round(inRange(p.frequency, 1, 7, DEFAULT_PROFILE.frequency)),
    focus: subset(p.focus, Object.keys(MUSCLE_LABELS).filter((m) => m !== "cardio")),
    equipment: subset(p.equipment, Object.keys(EQUIPMENT)),
  };
}

// 保存済みメニュー: {v:1, savedAt, profile, plan, modified}
function normalizePlanRecord(obj) {
  if (!isPlainObject(obj) || obj.v !== 1) return null;
  const plan = obj.plan;
  if (!isPlainObject(plan) || !Array.isArray(plan.days)) return null;
  return {
    v: 1,
    savedAt: typeof obj.savedAt === "number" && Number.isFinite(obj.savedAt) ? obj.savedAt : 0,
    profile: normalizeProfile(obj.profile),
    plan,
    modified: obj.modified === true,
  };
}

// 保存用の並び(古い順)。旧版と同じ向きにしておくと、同じ日付内の順序が保存のたびに変わらない
const toStored = (logs) => [...logs].reverse();

// ---------- 初期化 ----------

// 起動時に一度だけ呼ぶ。旧キーの削除と形式の移行を行う。
// onError(日本語メッセージ) は容量不足・データ破損・保存不可のときに呼ばれる。
// 返り値: { available, removedLegacyKey, migrated, corrupt: [壊れていたキー] }
export function initStorage({ onError, storage } = {}) {
  if (typeof onError === "function") onErrorCb = onError;
  if (storage && storage !== injectedStorage) {
    injectedStorage = storage;
    reported.clear();
    corruptKeys.clear();
    lastReport = { message: "", at: 0 };
  }
  const store = backend();
  const status = { available: store !== memoryFallback, removedLegacyKey: false, migrated: false, corrupt: [] };
  if (!initializedFor.has(store)) {
    initializedFor.add(store);
    // B11: 旧 API キーを削除。削除したことは利用者が閉じるまで知らせられるよう meta に残す
    status.removedLegacyKey = readRaw(LEGACY_KEYS[0]) != null;
    for (const k of LEGACY_KEYS) removeRaw(k);

    const meta = getMeta();
    if (meta.schema < SCHEMA_VERSION) status.migrated = migrate();
    if (meta.schema < SCHEMA_VERSION || readRaw(KEYS.meta) == null || status.removedLegacyKey) {
      setMetaQuiet({ schema: SCHEMA_VERSION, ...(status.removedLegacyKey ? { legacyKeyNotice: true } : {}) });
    }
  }
  status.corrupt = [...corruptKeys];
  return status;
}

// 旧形式の記録・体重を新形式で保存し直す。捨てる項目がある場合は元データを退避してから書く
function migrate() {
  let changed = false;
  const targets = [
    [KEYS.logs, (v) => {
      const r = normalizeLogs(v);
      return { str: JSON.stringify(toStored(r.logs)), dropped: r.dropped.logs + r.dropped.entries };
    }],
    [KEYS.bodyweight, (v) => {
      const r = normalizeBodyweight(v);
      return { str: JSON.stringify(r.list), dropped: r.invalid };
    }],
  ];
  for (const [key, convert] of targets) {
    const { raw, value } = readJSON(key, true);
    if (value === MISSING || value === BROKEN) continue;
    if (!Array.isArray(value)) { markCorrupt(key, raw); continue; }
    const { str, dropped } = convert(value);
    if (str === raw) continue;
    if (dropped > 0) {
      markCorrupt(key, raw);
      if (readRaw(key + CORRUPT_SUFFIX) == null) continue; // 退避できなければ元のまま(読み込み時に正規化される)
    }
    if (writeRaw(key, str)) {
      changed = true;
      corruptKeys.delete(key);
    }
  }
  return changed;
}

// ---------- 記録 ----------

// 正規化済み・新しい順。壊れていても例外にせず、読めた分だけ返す
export function loadLogs() {
  const { raw, value } = readJSON(KEYS.logs, true);
  if (value === MISSING || value === BROKEN) return [];
  if (!Array.isArray(value)) {
    markCorrupt(KEYS.logs, raw);
    return [];
  }
  const { logs, dropped } = normalizeLogs(value);
  if (dropped.logs + dropped.entries > 0) markCorrupt(KEYS.logs, raw);
  return logs;
}

// 検証してから保存する。不正な記録が混ざっていれば何も書かずに false
export function saveLogs(logs) {
  if (!Array.isArray(logs)) { report(MESSAGES.invalid); return false; }
  const { logs: clean, dropped } = normalizeLogs(logs);
  if (dropped.logs + dropped.entries > 0) { report(MESSAGES.invalid); return false; }
  return writeJSON(KEYS.logs, toStored(clean));
}

// 1件追加する。id が無ければ振る。同じ id があれば置き換える(削除の取り消しにも使える)。
// 種目が1つも無い記録は保存しない(false)。
export function addLog(log) {
  if (!isPlainObject(log)) { report(MESSAGES.invalid); return false; }
  // 作成時刻は同じ日付内の並び順に使う(旧版の数値 id=保存時刻 がある記録はそちらが優先される)
  const candidate = { ...log, id: log.id != null ? String(log.id) : uid(), createdAt: log.createdAt ?? Date.now() };
  const { log: clean } = normalizeLog(candidate);
  if (!clean || !clean.id) { report(MESSAGES.invalid); return false; }
  const logs = loadLogs().filter((l) => l.id !== clean.id);
  logs.push(clean);
  return saveLogs(logs);
}

export function updateLog(id, patch) {
  const key = String(id);
  const logs = loadLogs();
  const i = logs.findIndex((l) => l.id === key);
  if (i < 0 || !isPlainObject(patch)) return false;
  const { log: clean } = normalizeLog({ ...logs[i], ...patch, id: key, updatedAt: Date.now() });
  if (!clean) { report(MESSAGES.invalid); return false; }
  logs[i] = clean;
  return saveLogs(logs);
}

// 削除した記録を返す(元に戻すときは addLog(返り値))。見つからない・保存失敗なら null
export function deleteLog(id) {
  const key = String(id);
  const logs = loadLogs();
  const removed = logs.find((l) => l.id === key);
  if (!removed) return null;
  return saveLogs(logs.filter((l) => l.id !== key)) ? removed : null;
}

// 種目名の付け替え(自由入力の「ベンチ」を「ベンチプレス」にまとめる等)。元の名前は originalName に残す
export function renameExercise(from, to) {
  const src = String(from ?? "").trim();
  const dst = String(to ?? "").trim();
  if (!src || !dst || src === dst) return { ok: false, count: 0, undo: () => false };
  const before = readRaw(KEYS.logs);
  let count = 0;
  const logs = loadLogs().map((l) => ({
    ...l,
    entries: l.entries.map((e) => {
      if (e.name !== src) return e;
      count++;
      return { ...e, name: dst, originalName: e.originalName ?? src };
    }),
  }));
  if (count === 0) return { ok: true, count, undo: () => true };
  if (!saveLogs(logs)) return { ok: false, count: 0, undo: () => false };
  const undo = () => (before == null ? removeRaw(KEYS.logs) : writeRaw(KEYS.logs, before, true));
  return { ok: true, count, undo };
}

// ---------- プロフィール・体重 ----------

export function loadProfile() {
  const { value } = readJSON(KEYS.profile, true);
  return value === MISSING || value === BROKEN ? null : normalizeProfile(value);
}

export function saveProfile(p) {
  const clean = normalizeProfile(p);
  if (!clean) { report(MESSAGES.invalid); return false; }
  return writeJSON(KEYS.profile, clean);
}

// [{date, weight}] 古い順
export function loadBodyweight() {
  const { raw, value } = readJSON(KEYS.bodyweight, true);
  if (value === MISSING || value === BROKEN) return [];
  if (!Array.isArray(value)) { markCorrupt(KEYS.bodyweight, raw); return []; }
  const { list, invalid } = normalizeBodyweight(value);
  if (invalid > 0) markCorrupt(KEYS.bodyweight, raw);
  return list;
}

// 同じ日付が複数あれば後のものを採用して保存する
export function saveBodyweight(list) {
  if (!Array.isArray(list)) { report(MESSAGES.invalid); return false; }
  const { list: clean, invalid } = normalizeBodyweight(list);
  if (invalid > 0) { report(MESSAGES.invalid); return false; }
  return writeJSON(KEYS.bodyweight, clean);
}

// ---------- 保存済みメニュー・入力途中の下書き・実施中のセッション ----------

export function loadPlan() {
  const { value } = readJSON(KEYS.plan, false);
  return value === MISSING || value === BROKEN ? null : normalizePlanRecord(value);
}

// obj: {plan, profile?, modified?, savedAt?}
export function savePlan(obj) {
  const rec = normalizePlanRecord({
    v: 1,
    savedAt: obj?.savedAt ?? Date.now(),
    profile: obj?.profile ?? null,
    plan: obj?.plan,
    modified: obj?.modified === true,
  });
  if (!rec) { report(MESSAGES.invalid); return false; }
  return writeJSON(KEYS.plan, rec);
}

export function clearPlan() {
  return removeRaw(KEYS.plan);
}

const loadObject = (key) => {
  const { value } = readJSON(key, false);
  return isPlainObject(value) ? value : null;
};

// 記録フォームの下書き(任意のオブジェクト。savedAt が付く)
export function loadDraft() {
  return loadObject(KEYS.draft);
}

export function saveDraft(d) {
  return isPlainObject(d) && writeJSON(KEYS.draft, { ...d, savedAt: Date.now() }, false);
}

export function clearDraft() {
  return removeRaw(KEYS.draft);
}

// 実施中のセッション(任意のオブジェクト。savedAt が付く)。容量不足は通知する
export function loadSession() {
  return loadObject(KEYS.session);
}

export function saveSession(s) {
  return isPlainObject(s) && writeJSON(KEYS.session, { ...s, savedAt: Date.now() });
}

export function clearSession() {
  return removeRaw(KEYS.session);
}

// ---------- メタ情報 ----------

// { schema, lastBackupAt?, lastBackupLogCount?, lastImportUndo?: {at, mode}, legacyKeyNotice? }
export function getMeta() {
  const meta = { ...loadObject(KEYS.meta) };
  if (!Number.isInteger(meta.schema) || meta.schema < 1) {
    // メタ情報が無い = 移行処理を知らない旧版のデータ、または新規利用
    meta.schema = readRaw(KEYS.logs) != null || readRaw(KEYS.bodyweight) != null ? 1 : SCHEMA_VERSION;
  }
  return meta;
}

function mergedMeta(patch) {
  const next = { ...getMeta(), ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
  return next;
}

// patch の値に undefined を渡すとその項目を消す
export function setMeta(patch) {
  return isPlainObject(patch) && writeJSON(KEYS.meta, mergedMeta(patch));
}

function setMetaQuiet(patch) {
  return writeJSON(KEYS.meta, mergedMeta(patch), false);
}

// ---------- バックアップ ----------

export function backupFileName(now = new Date()) {
  return `workout-backup-${localDateStr(now)}.json`;
}

// 書き出し用のデータ。壊れて読めなかった生データも raw に添えるので、例外で止まることはない
export function buildBackup() {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const data = {
    app: BACKUP_APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    logs: safe(() => toStored(loadLogs()), []),
    bodyweight: safe(loadBodyweight, []),
    profile: safe(loadProfile, null),
    plan: safe(loadPlan, null),
  };
  const raw = {};
  for (const name of DATA_KEYS) {
    const key = KEYS[name];
    const saved = readRaw(key + CORRUPT_SUFFIX);
    if (saved != null) raw[key + CORRUPT_SUFFIX] = saved;
    if (corruptKeys.has(key)) {
      const cur = readRaw(key);
      if (cur != null) raw[key] = cur;
    }
  }
  if (Object.keys(raw).length > 0) data.raw = raw;
  return data;
}

// 書き出しが済んだことを記録する(「最終バックアップ: N日前」の表示用)
export function markBackup(now = new Date()) {
  return setMeta({ lastBackupAt: now.toISOString(), lastBackupLogCount: loadLogs().length });
}

// バックアップの状況と、そろそろ書き出しを促すべきか
export function backupStatus(now = new Date()) {
  const meta = getMeta();
  const logCount = loadLogs().length;
  const at = typeof meta.lastBackupAt === "string" ? new Date(meta.lastBackupAt) : null;
  const valid = at != null && !Number.isNaN(at.getTime());
  const daysSince = valid ? daysBetween(localDateStr(at), localDateStr(now)) : null;
  const newLogs = valid ? Math.max(0, logCount - (meta.lastBackupLogCount ?? 0)) : logCount;
  const shouldNudge = logCount >= 5 && (!valid || newLogs >= 20 || (daysSince >= 14 && newLogs >= 1));
  return { lastBackupAt: valid ? meta.lastBackupAt : null, daysSince, logCount, newLogs, shouldNudge };
}

const invalidBackup = (msg) => ({ ok: false, errors: [msg], warnings: [], data: null });

// バックアップ(JSON 文字列または読み込んだオブジェクト)を検証する。何も書き込まない(B02)。
// 返り値 data は applyBackup にそのまま渡せる正規化済みデータ。
export function validateBackup(input) {
  let obj = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch {
      return invalidBackup("JSONファイルとして読み込めませんでした。ファイルが壊れていないか確認してください。");
    }
  }
  if (!isPlainObject(obj) || obj.app !== BACKUP_APP_ID || !Array.isArray(obj.logs)) {
    return invalidBackup("このファイルはワークアウト記録のバックアップではありません。");
  }
  const schema = obj.schema ?? obj.schemaVersion ?? 1;
  if (!Number.isInteger(schema) || schema < 1) {
    return invalidBackup("バックアップの形式を判別できませんでした。");
  }
  if (schema > SCHEMA_VERSION) {
    return invalidBackup("新しいバージョンのアプリで作られたバックアップです。アプリを更新してから読み込んでください。");
  }
  const { logs, dropped } = normalizeLogs(obj.logs);
  const bw = normalizeBodyweight(Array.isArray(obj.bodyweight) ? obj.bodyweight : []);
  const profile = obj.profile == null ? null : normalizeProfile(obj.profile);
  const plan = obj.plan == null ? null : normalizePlanRecord(obj.plan);
  if (obj.logs.length > 0 && logs.length === 0 && bw.list.length === 0) {
    return invalidBackup("有効な記録が1件も見つかりませんでした。ファイルが壊れている可能性があります。");
  }
  const warnings = [];
  if (dropped.logs > 0) warnings.push(`内容が正しくない記録 ${dropped.logs}件はスキップします。`);
  if (dropped.entries > 0) warnings.push(`内容が正しくない種目 ${dropped.entries}件はスキップします。`);
  if (bw.invalid > 0) warnings.push(`内容が正しくない体重の記録 ${bw.invalid}件はスキップします。`);
  if (obj.profile != null && !profile) warnings.push("プロフィールは読み込めなかったため、現在の設定のままにします。");
  if (obj.plan != null && !plan) warnings.push("保存されたメニューは読み込めなかったため、スキップします。");
  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      logs,
      bodyweight: bw.list,
      profile,
      plan,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : null,
      counts: {
        logs: logs.length,
        bodyweight: bw.list.length,
        droppedLogs: dropped.logs,
        droppedEntries: dropped.entries,
        droppedBodyweight: bw.invalid,
      },
    },
  };
}

function snapshot() {
  const snap = {};
  for (const name of DATA_KEYS) snap[name] = readRaw(KEYS[name]);
  return snap;
}

function restoreSnapshot(snap) {
  let ok = true;
  for (const name of DATA_KEYS) {
    const v = snap[name];
    if (v == null) removeRaw(KEYS[name]);
    else if (!writeRaw(KEYS[name], v)) ok = false;
  }
  for (const name of DATA_KEYS) corruptKeys.delete(KEYS[name]);
  return ok;
}

// 同じ内容の記録か(id が違っても日付・種目が同じなら重複とみなす)
const logSignature = (l) =>
  JSON.stringify([l.date, l.entries.map((e) => [e.name, e.track, e.weight, e.sets, e.reps, e.seconds, e.minutes, e.distance])]);

// validateBackup().data を反映する。mode: "replace"(置き換え)/ "merge"(統合)。
// 反映前の状態を控えておき、undo() で完全に元へ戻せる。途中で保存に失敗したら自動で元に戻す。
// 返り値: { ok, undo, added, updated, skipped, total, error? }
export function applyBackup(data, mode = "replace") {
  const fail = (error) => ({ ok: false, error, undo: () => false, added: 0, updated: 0, skipped: 0, total: 0 });
  if (!isPlainObject(data) || !Array.isArray(data.logs)) return fail(MESSAGES.invalid);
  const incoming = normalizeLogs(data.logs).logs;
  const incomingBw = normalizeBodyweight(Array.isArray(data.bodyweight) ? data.bodyweight : []).list;
  const incomingProfile = data.profile == null ? null : normalizeProfile(data.profile);
  const incomingPlan = data.plan == null ? null : normalizePlanRecord(data.plan);

  const before = snapshot();
  let logs;
  let bodyweight;
  let profile = null;
  let plan = null;
  let added = 0;
  let updated = 0;
  let skipped = 0;

  if (mode === "merge") {
    const local = loadLogs();
    const byId = new Map(local.map((l) => [l.id, l]));
    const sigs = new Set(local.map(logSignature));
    for (const l of incoming) {
      const cur = byId.get(l.id);
      if (cur) {
        if ((l.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
          byId.set(l.id, l);
          updated++;
        } else {
          skipped++;
        }
      } else if (sigs.has(logSignature(l))) {
        skipped++;
      } else {
        byId.set(l.id, l);
        sigs.add(logSignature(l));
        added++;
      }
    }
    logs = [...byId.values()];
    const bwByDate = new Map(incomingBw.map((b) => [b.date, b]));
    for (const b of loadBodyweight()) bwByDate.set(b.date, b); // 同じ日付は端末側を優先
    bodyweight = [...bwByDate.values()];
    if (!loadProfile() && incomingProfile) profile = incomingProfile;
    if (!loadPlan() && incomingPlan) plan = incomingPlan;
  } else {
    logs = incoming;
    bodyweight = incomingBw;
    profile = incomingProfile;
    plan = incomingPlan;
    added = incoming.length;
  }

  const sortedLogs = normalizeLogs(logs).logs;
  const writes = [
    () => writeRaw(KEYS.logs, JSON.stringify(toStored(sortedLogs))),
    () => writeRaw(KEYS.bodyweight, JSON.stringify(normalizeBodyweight(bodyweight).list)),
    () => (profile ? writeRaw(KEYS.profile, JSON.stringify(profile)) : true),
    () => (plan ? writeRaw(KEYS.plan, JSON.stringify(plan)) : true),
  ];
  for (const w of writes) {
    if (!w()) {
      restoreSnapshot(before);
      return fail(MESSAGES.quota);
    }
  }
  for (const name of DATA_KEYS) corruptKeys.delete(KEYS[name]);

  // 再読み込み後も取り消せるように控えを残す(容量不足で残せなくても、返り値の undo は使える)
  const at = new Date().toISOString();
  if (writeRaw(KEYS.importUndo, JSON.stringify(before))) setMetaQuiet({ lastImportUndo: { at, mode } });
  else {
    removeRaw(KEYS.importUndo);
    setMetaQuiet({ lastImportUndo: undefined });
  }
  const undo = () => {
    const ok = restoreSnapshot(before);
    if (ok) {
      removeRaw(KEYS.importUndo);
      setMetaQuiet({ lastImportUndo: undefined });
    }
    return ok;
  };
  return { ok: true, undo, added, updated, skipped, total: sortedLogs.length };
}

// 再読み込みした後で「直前の読み込みを取り消す」。控えが無ければ false
export function undoLastImport() {
  const snap = loadObject(KEYS.importUndo);
  if (!snap) return false;
  const ok = restoreSnapshot(snap);
  if (ok) {
    removeRaw(KEYS.importUndo);
    setMetaQuiet({ lastImportUndo: undefined });
  }
  return ok;
}

// 端末のストレージ削除対象から外してもらう(対応ブラウザのみ・失敗しても問題なし)
export async function requestPersistentStorage() {
  try {
    const s = globalThis.navigator?.storage;
    if (!s?.persist) return false;
    if (s.persisted && (await s.persisted())) return true;
    return (await s.persist()) === true;
  } catch {
    return false;
  }
}
