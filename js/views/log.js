// 記録画面: トレーニングの入力フォームと、これまでの記録の一覧。
// - 入力はすべてタップ(選択式)。種類(筋トレ/体幹・キープ/有酸素)を切り替えると候補の種目が変わり、
//   最近使った種目・メニューの種目はワンタップで追加できる。「一覧から選ぶ」シートは部位で絞り込めて、複数まとめて選べる。
//   一覧に無い種目だけは名前を入力する。入力した名前は次から「最近使った種目」「マイ種目」に出る(I24)。
//   知らない名前はいま選んでいる種類のまま記録する(有酸素で入力した名前が筋トレに変わらない。B27)
// - 追加した種目の初期値は前回の作業セット(ウォームアップではなく最も重いセット。stats.lastWorkingSet。B39)
// - 値の変更では入力欄を作り直さない(タップの途中で選択リストが差し替わらない。B27)
// - 入力途中の内容は下書きとして保存し、再読み込み・再起動しても残る(I02)
// - 一覧は月ごとの見出しで 10件ずつ表示し、タップで内容を開く(I10)。開いた記録から
//   編集(保存すると同じ記録を更新)・今日もこれをやる(今日の日付でフォームへ)・削除(元に戻せる)ができる(I08 I09)
// - 自己ベストを更新した記録には印を付け(I05)、旧形式の記録には「旧形式」と表示して推定1RM を出さない(B22)
import {
  exerciseChoices, allExerciseNames, getExerciseTrack, getExerciseInfo, isPoolExercise, estimate1RM,
  WEIGHT_CHOICES, SUB_MUSCLES, MUSCLE_LABELS,
} from "../planner.js?v=14";
import { lastWorkingSet, prHistory, detectPRs, E1RM_MAX_REPS } from "../stats.js?v=14";
import {
  escapeHtml, formatJaDate, formatShortDate, localDateStr, addDays, isDateStr, numRange, uid, formatNum, roundTo,
} from "../util.js?v=14";
import { EQUIPMENT_SVG, uiIcon } from "../icons.js?v=14";

const TYPES = [
  { id: "weight", label: "筋トレ", icon: "dumbbell" },
  { id: "time", label: "体幹<wbr>・キープ", icon: "clock" },
  { id: "cardio", label: "有酸素", icon: "pulse" },
];
const TYPE_NAME = { weight: "筋トレ", time: "体幹・キープ", cardio: "有酸素" };
const TRACKS = new Set(Object.keys(TYPE_NAME));
// 重さを選ぶ種目(自重・バンドの種目は「自重」が初期値)
const LOADED = new Set(["barbell", "smith", "dumbbell", "kettlebell", "cable", "machine"]);
// 記録も今のメニューも無いときの候補
const STAPLES = {
  weight: ["腕立て伏せ", "ベンチプレス", "バーベルスクワット", "デッドリフト", "ラットプルダウン", "ダンベルカール"],
  time: [],
  cardio: ["ウォーキング(早歩き)", "ランニング", "水泳(クロール)", "水泳(平泳ぎ)", "エアロバイク"],
};
const DAY_PREFIX = /^Day\s*\d+\s*[::]\s*/;

// 選択肢(記録済みの値が無ければ、その値の選択肢を足して丸めない)
const SETS = numRange(1, 10);
const REPS = [...numRange(1, 50), ...numRange(55, 100, 5)];
const SECONDS = [...numRange(5, 60, 5), ...numRange(70, 300, 10), ...numRange(330, 600, 30)];
const MINUTES = numRange(1, 180);
const POOL_METERS = numRange(25, 5000, 25);
const KILOMETERS = [...numRange(0.1, 10, 0.1), ...numRange(10.5, 50, 0.5)];

const OTHER_DAYS = 60;   // 「別の日」で選べる日数
const PAGE = 10;         // 一覧に最初に出す件数
const MORE = 20;         // 「もっと見る」で増やす件数
const QUICK_MAX = 8;     // ワンタップ候補の数

let ctx = null;
let body = null;
let form = null;         // 入力中の内容(下書きとして保存する)
let limit = PAGE;
const openLogs = new Set(); // 一覧で開いている記録の id
let celebrate = null;       // 直前の保存で更新した自己ベスト { logId, prs }
let known = null;

// ---------- 小さなヘルパー ----------

const isKnown = (name) => (known ??= new Set(allExerciseNames())).has(name);
// データベースにある名前はその記録方法、無い名前は選んでいる種類のまま
const trackFor = (name, fallback) => (isKnown(name) ? getExerciseTrack(name) : fallback);
const unitFor = (name) => (isPoolExercise(name) ? "m" : "km");
// 重りを使う種目か(データベースに無い名前は重さを選んでもらう)
const needsWeight = (name) => !isKnown(name) || LOADED.has(getExerciseInfo(name)?.load);
const fmt = (v) => formatNum(v, 2);
const dayName = (title) => String(title ?? "").replace(DAY_PREFIX, "");
// "メニュー 1日目・全身A"
function planDayText(pd) {
  const name = dayName(pd.title) || pd.title;
  return Number.isInteger(pd.index) ? `メニュー ${pd.index + 1}日目・${name}` : `メニュー ${name}`;
}

function midNumber(text) {
  const nums = String(text ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length === 0) return null;
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

function withValue(values, v) {
  if (!Number.isFinite(v) || values.some((x) => Math.abs(x - v) < 1e-9)) return values;
  return [...values, v].sort((a, b) => a - b);
}

// 距離の単位をそろえる(プールは m、それ以外は km)
function convertDistance(d, from, to) {
  if (d == null) return null;
  if (!from || from === to) return d;
  return to === "m" ? Math.max(25, Math.round((d * 1000) / 25) * 25) : roundTo(d / 1000, 1);
}

function focusKey(key) {
  if (!key) return false;
  const el = body.querySelector(`[data-key="${CSS.escape(key)}"]`);
  el?.focus({ preventScroll: true });
  return Boolean(el);
}

const activeKey = () => {
  const a = document.activeElement;
  return a && body.contains(a) ? a.dataset.key ?? null : null;
};

function scrollToEl(el) {
  el?.scrollIntoView({ behavior: ctx.motion() ? "smooth" : "auto", block: "start" });
}

// ---------- 記録の表示用テキスト ----------

// セットごとの詳細 "60kg×10,10 / 62.5kg×8"(同じ重さはまとめる)
function detailText(e) {
  const d = Array.isArray(e.setDetails) ? e.setDetails : [];
  if (d.length < 2) return "";
  if (e.track === "time") return `${d.map((s) => fmt(s.seconds ?? 0)).join(", ")}秒`;
  const groups = [];
  for (const s of d) {
    const w = s.weight ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.w === w) last.reps.push(s.reps ?? "-");
    else groups.push({ w, reps: [s.reps ?? "-"] });
  }
  if (groups.length === 1 && groups[0].reps.every((r) => r === groups[0].reps[0])) return "";
  return groups.map((g) => `${g.w > 0 ? `${fmt(g.w)}kg` : "自重"}×${g.reps.join(",")}`).join(" / ");
}

// 1種目の内容 "60kg × 10回 × 3セット"
function valueText(e) {
  if (e.track === "time") return `${e.seconds != null ? fmt(e.seconds) : "-"}秒 × ${e.sets}セット`;
  if (e.track === "cardio") {
    const parts = [e.minutes != null ? `${fmt(e.minutes)}分` : null, e.distance != null ? `${fmt(e.distance)}${e.unit ?? ""}` : null];
    return parts.filter(Boolean).join("・") || "-";
  }
  // 旧形式(プランクを回数で記録した等)は記録した数字をそのまま出す
  const w = e.shapeMismatch ? "" : e.weight > 0 ? `${fmt(e.weight)}kg × ` : "自重 × ";
  return `${w}${e.reps ?? "-"}回 × ${e.sets}セット`;
}

// 推定1RM(重量のある 12回以下のセットのみ。旧形式は出さない)
function ormText(e) {
  if (e.track !== "weight" || e.shapeMismatch || !(e.weight > 0) || !(e.reps >= 1 && e.reps <= E1RM_MAX_REPS)) return "";
  const v = estimate1RM(e.weight, e.reps);
  return v ? `推定1RM ${fmt(v)}kg` : "";
}

// "前回 9/26 60kg×10回×3セット"
const compactValue = (e) => valueText(e).replace(/ × /g, "×");
const prevText = (last) => (last ? `前回 ${formatShortDate(last.date)} ${compactValue(last)}` : "");
// 同じ内容の HTML。狭い画面では日付と数字の間で改行し、数字の途中では切らない
const prevHtml = (last) =>
  `前回 ${escapeHtml(formatShortDate(last.date))} <span class="sub-val">${escapeHtml(compactValue(last))}</span>`;

// ---------- 入力フォームの状態 ----------

function freshForm(type = "weight") {
  return { mode: "new", editingId: null, editingDate: null, date: localDateStr(), dateTouched: false, type, rows: [], warned: false };
}

const sig = (r) => [r.track, r.weight, r.sets, r.reps, r.seconds, r.minutes, r.distance, r.unit].join("|");

// 今のメニューにある同じ種目(初期値の手がかり)
function planInfo(name) {
  for (const day of ctx.getPlan()?.plan.days ?? []) {
    const ex = day.exercises?.find((x) => x.name === name);
    if (ex) {
      return {
        sets: Number(ex.sets) || null,
        weight: ex.target?.weight ?? null,
        reps: ex.target?.reps ?? midNumber(ex.reps),
        seconds: ex.target?.seconds ?? midNumber(ex.reps),
      };
    }
    if (day.cardio?.name === name) {
      return { minutes: day.cardio.target?.minutes ?? day.cardio.minutes ?? null, distance: day.cardio.distanceM ?? null };
    }
  }
  return null;
}

// 新しく追加する種目の行。前回の作業セット → 今のメニュー → 標準 の順に初期値を決める
function newRow(name, track, logs) {
  const lastAny = lastWorkingSet(logs, name);
  const last = lastAny?.track === track ? lastAny : null;
  const plan = planInfo(name) ?? {};
  const r = { key: uid(), name, track, weight: null, sets: 3, reps: 10, seconds: null, minutes: null, distance: null, unit: null, base: null };
  if (track === "weight") {
    r.weight = last ? last.weight ?? 0 : plan.weight ?? (needsWeight(name) ? null : 0);
    r.sets = last?.sets ?? plan.sets ?? 3;
    r.reps = last?.reps ?? plan.reps ?? 10;
  } else if (track === "time") {
    r.seconds = last?.seconds ?? plan.seconds ?? 30;
    r.sets = last?.sets ?? plan.sets ?? 3;
    r.reps = null;
  } else {
    r.unit = unitFor(name);
    r.sets = 1;
    r.reps = null;
    r.minutes = last?.minutes ?? plan.minutes ?? 20;
    r.distance = last ? convertDistance(last.distance, last.unit, r.unit) : r.unit === "m" ? plan.distance ?? null : null;
  }
  r.orig = sig(r);
  return r;
}

// 保存済みの種目 → 行(編集では元の記録を base に残し、付加情報やセット詳細を保つ)
function rowFromEntry(e, keepBase) {
  const r = {
    key: uid(), name: e.name, track: e.track, weight: e.track === "weight" ? e.weight ?? 0 : null, sets: e.sets ?? 1,
    reps: e.reps ?? null, seconds: e.seconds ?? null, minutes: e.minutes ?? null, distance: e.distance ?? null,
    unit: e.track === "cardio" ? e.unit ?? unitFor(e.name) : null, base: keepBase ? e : null,
  };
  r.orig = sig(r);
  return r;
}

function rowEntry(r) {
  let e;
  if (r.track === "weight") e = { name: r.name, track: "weight", weight: r.weight ?? 0, sets: r.sets, reps: r.reps };
  else if (r.track === "time") e = { name: r.name, track: "time", seconds: r.seconds, sets: r.sets };
  else e = { name: r.name, track: "cardio", minutes: r.minutes, distance: r.distance, unit: r.distance != null ? r.unit : null };
  if (!r.base) return e;
  const out = { ...r.base, ...e };
  // 数字を変えたらセットごとの詳細は合わなくなるので外す
  if (sig(r) !== r.orig) delete out.setDetails;
  return out;
}

function persist() {
  if (form.rows.length === 0 && form.mode === "new") {
    ctx.storage.clearDraft();
    return;
  }
  const rows = form.rows.map(({ key, ...rest }) => rest);
  ctx.storage.saveDraft({
    v: 1, mode: form.mode, editingId: form.editingId, editingDate: form.editingDate,
    date: form.date, dateTouched: form.dateTouched, type: form.type, rows,
  });
}

function validRow(r) {
  return r && typeof r === "object" && typeof r.name === "string" && r.name.trim() !== "" && TRACKS.has(r.track);
}

// 下書きから復元する(編集中だった記録が消えていたら新しい記録として続ける)
function restoreDraft(logs) {
  const d = ctx.storage.loadDraft();
  if (!d || d.v !== 1 || !Array.isArray(d.rows)) return null;
  const rows = d.rows.filter(validRow).map((r) => ({ ...r, key: uid(), orig: typeof r.orig === "string" ? r.orig : sig(r) }));
  const f = freshForm(TRACKS.has(d.type) ? d.type : "weight");
  const editing = d.mode === "edit" && logs.some((l) => l.id === d.editingId);
  if (editing) {
    f.mode = "edit";
    f.editingId = d.editingId;
    f.editingDate = isDateStr(d.editingDate) ? d.editingDate : d.date;
  } else {
    for (const r of rows) r.base = null;
  }
  if (d.dateTouched && isDateStr(d.date)) {
    f.date = d.date;
    f.dateTouched = true;
  }
  f.rows = rows;
  if (rows.length === 0 && !editing) return null;
  return f;
}

function resetForm() {
  form = freshForm(form?.type ?? "weight");
  ctx.storage.clearDraft();
}

// ---------- 候補の種目 ----------

// 記録に出てくる名前(新しい順)。track を指定するとその種類だけ
function loggedNames(logs, track) {
  const seen = new Set();
  const out = [];
  for (const l of logs) {
    for (const e of l.entries) {
      if (e.shapeMismatch || (track && e.track !== track) || seen.has(e.name)) continue;
      seen.add(e.name);
      out.push(e.name);
    }
  }
  return out;
}

function planNames(track) {
  const out = [];
  for (const day of ctx.getPlan()?.plan.days ?? []) {
    for (const ex of day.exercises ?? []) if (ex.track === track && !out.includes(ex.name)) out.push(ex.name);
    if (track === "cardio" && day.cardio && !out.includes(day.cardio.name)) out.push(day.cardio.name);
  }
  return out;
}

function quickNames(track, logs) {
  const recent = loggedNames(logs, track).slice(0, QUICK_MAX);
  if (recent.length) return { label: "最近使った種目", names: recent };
  const plan = planNames(track).slice(0, QUICK_MAX);
  if (plan.length) return { label: "今のメニューの種目", names: plan };
  const staples = (STAPLES[track].length ? STAPLES[track] : exerciseChoices(track).flatMap((g) => g.names))
    .filter(isKnown).slice(0, QUICK_MAX);
  return { label: "よく使われる種目", names: staples };
}

// 一覧から選ぶシートのグループ
function pickerGroups(track, logs) {
  const groups = [];
  const recent = loggedNames(logs, track).slice(0, QUICK_MAX);
  if (recent.length) groups.push({ id: "recent", label: "最近使った種目", names: recent });
  const mine = loggedNames(logs, track).filter((n) => !isKnown(n) && !recent.includes(n));
  if (mine.length) groups.push({ id: "mine", label: "マイ種目", names: mine });
  if (track === "cardio") {
    const all = exerciseChoices("cardio").flatMap((g) => g.names);
    groups.push({ id: "pool", label: "プール(25m単位)", names: all.filter(isPoolExercise) });
    groups.push({ id: "land", label: "ラン・バイクなど", names: all.filter((n) => !isPoolExercise(n)) });
  } else {
    exerciseChoices(track).forEach((g, i) => groups.push({ id: `db${i}`, label: g.label, names: g.names }));
  }
  return groups.filter((g) => g.names.length > 0);
}

function exerciseIcon(name, track, cls) {
  const keys = (getExerciseInfo(name)?.equipment ?? []).filter((k) => EQUIPMENT_SVG[k]);
  const key = keys.find((k) => k !== "bench") ?? keys[0];
  if (key) return `<span class="${cls}" aria-hidden="true">${EQUIPMENT_SVG[key]}</span>`;
  const icon = track === "cardio" ? (isPoolExercise(name) ? "wave" : "pulse") : track === "time" ? "clock" : "body";
  return `<span class="${cls} is-generic" aria-hidden="true">${uiIcon(icon)}</span>`;
}

// ---------- 入力フォームの描画 ----------

function dateHtml() {
  const today = localDateStr();
  const yest = addDays(today, -1);
  const which = form.date === today ? "today" : form.date === yest ? "yesterday" : "other";
  const opt = (v, main, sub) =>
    `<label class="seg-opt"><input type="radio" name="log-date" value="${v}" data-key="date-${v}"${which === v ? " checked" : ""}>` +
    `<span class="seg-main">${main}</span><span class="seg-sub${v === "other" ? " date-other-sub" : ""}">${sub}</span></label>`;
  const dates = [];
  for (let n = 2; n <= OTHER_DAYS; n++) dates.push(addDays(today, -n));
  if (!dates.includes(form.date) && form.date !== today && form.date !== yest) dates.push(form.date);
  dates.sort((a, b) => (a < b ? 1 : -1));
  const selected = which === "other" ? form.date : dates[0];
  return `<fieldset class="field-group compose-date"><legend class="field-legend">日付</legend>` +
    `<div class="seg seg-3">` +
    opt("today", "今日", escapeHtml(formatJaDate(today))) +
    opt("yesterday", "昨日", escapeHtml(formatJaDate(yest))) +
    opt("other", "別の日", which === "other" ? escapeHtml(formatJaDate(form.date)) : "選ぶ") +
    `</div>` +
    `<label class="field date-other"${which === "other" ? "" : " hidden"}><span class="field-label">日付を選ぶ</span>` +
    `<select class="date-select" data-key="date-select">` +
    dates.map((d) => `<option value="${d}"${d === selected ? " selected" : ""}>${escapeHtml(formatJaDate(d, { withYear: d.slice(0, 4) !== today.slice(0, 4) }))}</option>`).join("") +
    `</select></label></fieldset>`;
}

function selectHtml(r, field, label, aria, values, value, fmtFn, empty = null) {
  const list = withValue(values, value);
  const blank = empty ?? (value == null ? "—" : null);
  const opts = (blank ? `<option value=""${value == null ? " selected" : ""}>${blank}</option>` : "") +
    list.map((v) => `<option value="${v}"${v === value ? " selected" : ""}>${escapeHtml(fmtFn(v))}</option>`).join("");
  const unset = field === "weight" && value == null ? " is-unset" : "";
  return `<label class="rec-field"><span class="rec-lab" aria-hidden="true">${label}</span>` +
    `<select class="f-${field}${unset}" data-row="${r.key}" data-field="${field}" data-key="f-${r.key}-${field}" aria-label="${aria}">${opts}</select></label>`;
}

function fieldsHtml(r) {
  const nm = escapeHtml(r.name);
  if (r.track === "time") {
    return selectHtml(r, "seconds", "時間(秒)", `${nm}のキープ時間(秒)`, SECONDS, r.seconds, String) +
      selectHtml(r, "sets", "セット", `${nm}のセット数`, SETS, r.sets, String);
  }
  if (r.track === "cardio") {
    const unit = r.unit === "m" ? "m" : "km";
    return selectHtml(r, "minutes", "時間(分)", `${nm}の時間(分)`, MINUTES, r.minutes, String) +
      selectHtml(r, "distance", `距離(${unit})`, `${nm}の距離(${unit})`, unit === "m" ? POOL_METERS : KILOMETERS, r.distance, fmt, "なし");
  }
  return selectHtml(r, "weight", "重量(kg)", `${nm}の重量(kg)`, WEIGHT_CHOICES, r.weight, (v) => (v === 0 ? "自重" : fmt(v)), r.weight == null ? "未選択" : null) +
    selectHtml(r, "sets", "セット", `${nm}のセット数`, SETS, r.sets, String) +
    selectHtml(r, "reps", "回数", `${nm}の回数`, REPS, r.reps, String);
}

function entryHtml(r, i, logs) {
  const nm = escapeHtml(r.name);
  const legacy = r.base?.shapeMismatch;
  const last = r.base ? null : lastWorkingSet(logs, r.name);
  const sub = legacy
    ? `<span class="tag">旧形式</span><span>以前の形式の記録です</span>`
    : last ? prevHtml(last) : r.base ? "" : "初めての記録";
  return `<li class="entry" data-row="${r.key}"><div role="group" aria-label="${i + 1}件目 ${nm}">` +
    `<div class="entry-head">${exerciseIcon(r.name, r.track, "entry-ico")}` +
    `<div class="entry-title"><p class="entry-name">${nm}</p>${sub ? `<p class="entry-sub">${sub}</p>` : ""}</div>` +
    `<button type="button" class="icon-btn entry-remove" data-act="remove-row" data-row="${r.key}" data-key="rm-${r.key}" aria-label="${nm}を外す">${uiIcon("close")}</button>` +
    `</div><div class="rec-fields entry-fields">${fieldsHtml(r)}</div></div></li>`;
}

// ワンタップ候補。フォームに入っている種目は ✓ で示す(もう一度押すと、重さ違いの行をもう1つ足せる)
function picksHtml(logs) {
  const { label, names } = quickNames(form.type, logs);
  if (!names.length) return "";
  const added = new Set(form.rows.map((r) => r.name));
  return `<p class="picks-label" id="picks-label">${label}</p><div class="picks" role="group" aria-labelledby="picks-label">` +
    names.map((n) => {
      const nm = escapeHtml(n);
      const has = added.has(n);
      return `<button type="button" class="chip pick-chip${has ? " is-added" : ""}" data-act="quick-add" data-name="${nm}" data-key="qa-${nm}"` +
        ` aria-label="${has ? `${nm}をもう1つ追加(追加済み)` : `${nm}を追加`}">` +
        `${uiIcon(has ? "check" : "plus")}<span class="pick-chip-text">${nm}</span></button>`;
    }).join("") + `</div>`;
}

function addHtml(logs) {
  const n = form.rows.length;
  const opts = TYPES.map((t) =>
    `<label class="seg-opt"><input type="radio" name="log-type" value="${t.id}" data-key="type-${t.id}"${t.id === form.type ? " checked" : ""}>` +
    `<span class="seg-main">${uiIcon(t.icon)}<span>${t.label}</span></span></label>`).join("");
  return `<fieldset class="field-group compose-add"><legend class="field-legend">${n ? "種目を追加" : "種目を選ぶ"}</legend>` +
    `<div class="seg seg-3 type-seg" role="radiogroup" aria-label="種類">${opts}</div>` +
    `<div class="quick-picks">${picksHtml(logs)}</div>` +
    `<button type="button" class="btn btn-secondary btn-block pick-open" data-act="open-picker" data-key="open-picker">` +
    `${uiIcon("plus")}<span class="pick-open-label">一覧から選ぶ</span></button></fieldset>`;
}

function footHtml() {
  const n = form.rows.length;
  if (n === 0) return "";
  const label = form.mode === "edit" ? `更新する(${n}種目)` : `記録する(${n}種目)`;
  return `<div class="compose-foot"><p class="rec-warn compose-warn" role="alert" hidden></p>` +
    `<button type="button" class="btn btn-primary btn-lg btn-block compose-save" data-act="save" data-key="save">${uiIcon("check")}<span class="save-label">${label}</span></button></div>`;
}

function composeHtml(logs) {
  const editing = form.mode === "edit";
  const head = editing
    ? `<div class="compose-head"><div class="compose-titles"><p class="eyebrow"><span class="eyebrow-en" lang="en">EDIT</span>` +
      `<span>${escapeHtml(formatJaDate(form.editingDate))}の記録</span></p>` +
      `<h2 id="compose-title" class="card-title" tabindex="-1">記録を編集</h2></div>` +
      `<button type="button" class="btn btn-secondary btn-sm" data-act="cancel-edit" data-key="cancel-edit">キャンセル</button></div>`
    : `<div class="compose-head"><h2 id="compose-title" class="card-title" tabindex="-1">トレーニングを記録</h2>` +
      (form.rows.length ? `<button type="button" class="link-btn compose-clear" data-act="clear" data-key="clear">入力を消す</button>` : "") + `</div>`;
  const others = logs.filter((l) => l.id !== form.editingId);
  const list = form.rows.length
    ? `<ol class="entry-list" aria-label="記録する種目">${form.rows.map((r, i) => entryHtml(r, i, others)).join("")}</ol>`
    : "";
  return head + dateHtml() + list + addHtml(logs) + footHtml();
}

function renderCompose({ focus = null } = {}) {
  const el = body.querySelector("#log-compose");
  const key = focus ?? activeKey();
  el.classList.toggle("is-editing", form.mode === "edit");
  el.innerHTML = composeHtml(ctx.storage.loadLogs());
  if (!focusKey(key) && focus) body.querySelector("#compose-title")?.focus({ preventScroll: true });
}

function refreshPicks() {
  const box = body.querySelector("#log-compose .quick-picks");
  if (!box) return;
  const key = activeKey();
  box.innerHTML = picksHtml(ctx.storage.loadLogs());
  focusKey(key);
}

// ---------- 自己ベストのお祝い ----------

function prCardHtml() {
  if (!celebrate) return "";
  const items = celebrate.prs.map((p) =>
    `<li><span class="pr-name">${escapeHtml(p.name)}</span><span class="pr-kind">${escapeHtml(p.label)}</span>` +
    `<span class="pr-val"><span class="pr-prev">${escapeHtml(fmt(p.prev))}</span>${uiIcon("chevronRight", "pr-arrow")}` +
    `<b>${escapeHtml(fmt(p.value))}</b>${escapeHtml(p.unit)}<small>(+${escapeHtml(fmt(p.diff))})</small></span></li>`).join("");
  return `<section class="pr-card" aria-labelledby="pr-title">` +
    `<div class="pr-head"><span class="pr-ico">${uiIcon("trophy")}</span>` +
    `<div class="pr-titles"><p class="eyebrow"><span class="eyebrow-en" lang="en">NEW RECORD</span></p>` +
    `<h2 id="pr-title" class="pr-title">自己ベスト更新!</h2></div>` +
    `<button type="button" class="icon-btn pr-close" data-act="close-pr" data-key="close-pr" aria-label="自己ベストのお知らせを閉じる">${uiIcon("close")}</button></div>` +
    `<ul class="pr-list">${items}</ul></section>`;
}

function renderPr() {
  const box = body.querySelector("#log-pr");
  box.innerHTML = prCardHtml();
  if (celebrate && ctx.motion()) box.firstElementChild?.classList.add("is-new");
}

// ---------- 記録の一覧 ----------

// 1行目: メニューの日の名前、無ければ種目名を並べる
function logTitle(l) {
  if (l.planDay?.title) return dayName(l.planDay.title) || l.planDay.title;
  return l.entries.map((e) => e.name).join("・");
}

// 2行目: 1種目ならその内容、複数なら 種目数 · セット数 · 有酸素の時間(メニューの日は種目名も)
function logLine(l) {
  if (l.entries.length === 1 && !l.planDay?.title) return compactValue(l.entries[0]);
  const sets = l.entries.reduce((s, e) => s + (e.track === "cardio" ? 0 : e.sets ?? 0), 0);
  const cardio = l.entries.reduce((s, e) => s + (e.track === "cardio" ? e.minutes ?? 0 : 0), 0);
  return [
    `${l.entries.length}種目`,
    sets > 0 ? `${sets}セット` : "",
    cardio > 0 ? `有酸素${fmt(cardio)}分` : "",
    l.planDay?.title ? l.entries.map((e) => e.name).join("・") : "",
  ].filter(Boolean).join(" · ");
}

function entryLineHtml(e, prs) {
  const tags = [
    prs?.length ? `<span class="tag tag--pr">${uiIcon("trophy")}${escapeHtml(prs[0].label)}更新</span>` : "",
    e.shapeMismatch ? `<span class="tag tag--legacy">旧形式</span>` : "",
  ].join("");
  const sub = [detailText(e), ormText(e)].filter(Boolean).join(" · ");
  return `<li class="le"><span class="le-name">${escapeHtml(e.name)}${tags}</span>` +
    `<span class="le-num">${escapeHtml(valueText(e))}</span>` +
    (sub ? `<span class="le-sub">${escapeHtml(sub)}</span>` : "") + `</li>`;
}

function logBodyHtml(l, prs) {
  const byName = new Map();
  for (const p of prs ?? []) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  }
  const date = escapeHtml(formatJaDate(l.date));
  const id = escapeHtml(l.id);
  const meta = [
    l.planDay?.title ? escapeHtml(planDayText(l.planDay)) : "",
    l.durationMin ? `所要 ${escapeHtml(fmt(l.durationMin))}分` : "",
  ].filter(Boolean);
  const legacy = l.entries.some((e) => e.shapeMismatch)
    ? `<p class="log-note">「旧形式」は以前のバージョンの形式で記録した種目です。数字はそのまま残し、グラフ・自己ベストには使いません。</p>`
    : "";
  return `<ul class="le-list">${l.entries.map((e) => entryLineHtml(e, byName.get(e.name))).join("")}</ul>` +
    (meta.length ? `<p class="log-meta">${meta.join(" · ")}</p>` : "") + legacy +
    `<div class="log-actions">` +
    `<button type="button" class="btn btn-outline btn-sm act-repeat" data-act="repeat" data-id="${id}" data-key="repeat-${id}" aria-label="${date}の内容を今日もやる">${uiIcon("repeat")}今日もこれをやる</button>` +
    `<button type="button" class="btn btn-secondary btn-sm" data-act="edit" data-id="${id}" data-key="edit-${id}" aria-label="${date}の記録を編集">${uiIcon("edit")}編集</button>` +
    `<button type="button" class="btn btn-danger btn-sm" data-act="delete" data-id="${id}" data-key="delete-${id}" aria-label="${date}の記録を削除">${uiIcon("trash")}削除</button>` +
    `</div>`;
}

function logItemHtml(l, prs) {
  const open = openLogs.has(l.id);
  const id = escapeHtml(l.id);
  const [, m, d] = l.date.split("-").map(Number);
  const dow = formatJaDate(l.date).replace(/^.*(\(.\))$/, "$1");
  const pr = prs?.length ? `<span class="log-pr">${uiIcon("trophy")}<span class="sr-only">自己ベスト更新</span></span>` : "";
  const legacy = l.entries.some((e) => e.shapeMismatch) ? `<span class="tag tag--legacy">旧形式</span>` : "";
  return `<li class="log-item${open ? " is-open" : ""}" id="log-${id}">` +
    `<button type="button" class="log-head" data-act="toggle" data-id="${id}" data-key="toggle-${id}" aria-expanded="${open}" aria-controls="log-body-${id}">` +
    `<span class="log-date"><span class="log-md">${m}/${d}</span><span class="log-dow">${escapeHtml(dow)}</span></span>` +
    `<span class="log-main"><span class="log-title"><span class="log-title-text">${escapeHtml(logTitle(l))}</span>${legacy}</span>` +
    `<span class="log-line">${escapeHtml(logLine(l))}</span></span>` +
    `${pr}${uiIcon("chevronDown", "log-chev")}</button>` +
    `<div class="log-body" id="log-body-${id}"${open ? "" : " hidden"}>${logBodyHtml(l, prs)}</div></li>`;
}

function historyHtml(logs) {
  if (logs.length === 0) {
    return `<div class="section-head"><h2 id="history-title" class="section-title" tabindex="-1">これまでの記録</h2></div>` +
      `<div class="empty-state empty-state--compact">` +
      `<span class="empty-ico">${uiIcon("clipboard")}</span>` +
      `<p class="empty-title">まだ記録がありません</p>` +
      `<p class="empty-text">上のフォームで種目を選ぶか、メニュー画面の「記録」から、その日の内容をワンタップで記録できます。</p>` +
      `<button type="button" class="btn btn-secondary" data-act="goto-menu" data-key="goto-menu">メニューを見る</button></div>`;
  }
  const prMap = prHistory(logs);
  const months = new Map();
  for (const l of logs) {
    const k = l.date.slice(0, 7);
    const m = months.get(k) ?? { days: new Set(), count: 0 };
    m.days.add(l.date);
    m.count++;
    months.set(k, m);
  }
  const visible = logs.slice(0, limit);
  let html = `<div class="section-head"><h2 id="history-title" class="section-title" tabindex="-1">これまでの記録</h2>` +
    `<span class="section-meta">${logs.length}件</span></div>`;
  let month = null;
  for (const l of visible) {
    const k = l.date.slice(0, 7);
    if (k !== month) {
      if (month) html += `</ol>`;
      month = k;
      const m = months.get(k);
      html += `<h3 class="month-head"><span class="month-name">${Number(k.slice(0, 4))}年${Number(k.slice(5))}月</span>` +
        `<span class="month-meta">トレーニング ${m.days.size}日${m.count > m.days.size ? `(${m.count}件)` : ""}</span></h3><ol class="log-list">`;
    }
    html += logItemHtml(l, prMap.get(l.id));
  }
  html += `</ol>`;
  const rest = logs.length - visible.length;
  if (rest > 0) {
    html += `<button type="button" class="btn btn-secondary btn-block log-more" data-act="more" data-key="more">もっと見る(残り${rest}件)</button>`;
  }
  return html;
}

function renderHistory({ focus = null } = {}) {
  const el = body.querySelector("#log-history");
  const key = focus ?? activeKey();
  el.innerHTML = historyHtml(ctx.storage.loadLogs());
  focusKey(key);
}

// ---------- 操作: フォーム ----------

function addRows(names, trackOf) {
  const logs = ctx.storage.loadLogs();
  for (const name of names) form.rows.push(newRow(name, trackOf(name), logs));
  form.warned = false;
  persist();
}

function quickAdd(name) {
  addRows([name], (n) => trackFor(n, form.type));
  renderCompose();
  ctx.announce(`${name}を追加しました(${form.rows.length}種目)`);
}

function removeRow(key) {
  const i = form.rows.findIndex((r) => r.key === key);
  if (i < 0) return;
  const [r] = form.rows.splice(i, 1);
  persist();
  const next = form.rows[i] ?? form.rows[i - 1];
  renderCompose({ focus: next ? `rm-${next.key}` : "open-picker" });
  ctx.announce(`${r.name}を外しました`);
}

function setDateChoice(which) {
  const today = localDateStr();
  const other = body.querySelector("#log-compose .date-other");
  const select = other?.querySelector("select");
  if (which === "today") form.date = today;
  else if (which === "yesterday") form.date = addDays(today, -1);
  else form.date = select?.value ?? addDays(today, -2);
  form.dateTouched = which !== "today";
  if (other) other.hidden = which !== "other";
  const sub = body.querySelector("#log-compose .date-other-sub");
  if (sub) sub.textContent = which === "other" ? formatJaDate(form.date) : "選ぶ";
  persist();
}

function onFieldChange(sel) {
  const r = form.rows.find((x) => x.key === sel.dataset.row);
  if (!r) return;
  r[sel.dataset.field] = sel.value === "" ? null : Number(sel.value);
  if (sel.dataset.field === "weight") sel.classList.toggle("is-unset", sel.value === "");
  clearWarn();
  persist();
}

function clearWarn() {
  if (!form.warned) return;
  form.warned = false;
  const warn = body.querySelector("#log-compose .compose-warn");
  if (warn) warn.hidden = true;
  paintSave();
}

function paintSave() {
  const label = body.querySelector("#log-compose .save-label");
  if (!label) return;
  const n = form.rows.length;
  label.textContent = form.warned ? "このまま記録する" : form.mode === "edit" ? `更新する(${n}種目)` : `記録する(${n}種目)`;
}

function save() {
  const unset = form.rows.filter((r) => r.track === "weight" && r.weight == null).length;
  if (unset > 0 && !form.warned) {
    form.warned = true;
    const warn = body.querySelector("#log-compose .compose-warn");
    warn.textContent = `重量が未選択の種目が${unset}つあります。このまま記録すると「自重」として保存され、重量のグラフには入りません。`;
    warn.hidden = false;
    paintSave();
    return;
  }
  const entries = form.rows.map(rowEntry);
  if (form.mode === "edit") updateExisting(entries);
  else addNew(entries);
}

function addNew(entries) {
  const date = form.date;
  const res = ctx.saveLog({ id: uid(), date, entries }, { ownPR: true });
  if (!res.ok) return;
  celebrate = res.prs.length ? { logId: res.id, prs: res.prs } : null;
  resetForm();
  renderPr();
  renderCompose({ focus: "compose-title" });
  if (celebrate) scrollToEl(body.querySelector("#log-pr"));
}

function updateExisting(entries) {
  const logs = ctx.storage.loadLogs();
  const before = logs.find((l) => l.id === form.editingId);
  if (!before) {
    addNew(entries);
    return;
  }
  const date = form.date;
  const prs = detectPRs(logs, { ...before, date, entries });
  if (!ctx.storage.updateLog(before.id, { date, entries })) return;
  celebrate = prs.length ? { logId: before.id, prs } : null;
  resetForm();
  openLogs.add(before.id);
  renderPr();
  renderCompose();
  ctx.refresh("logs");
  const head = body.querySelector(`[data-key="toggle-${CSS.escape(before.id)}"]`);
  if (head) {
    head.focus({ preventScroll: true });
    scrollToEl(head.closest(".log-item"));
  }
  ctx.toast(`${formatJaDate(date)}の記録を更新しました`, {
    tone: prs.length ? "pr" : "ok",
    action: "元に戻す",
    onAction: () => {
      if (!ctx.storage.addLog(before)) return;
      if (celebrate?.logId === before.id) celebrate = null;
      renderPr();
      ctx.refresh("logs");
      ctx.toast("更新を取り消しました", { tone: "info" });
    },
  });
}

async function loadLog(id, mode) {
  const logs = ctx.storage.loadLogs();
  const log = logs.find((l) => l.id === id);
  if (!log) return;
  const same = form.mode === "edit" && form.editingId === id;
  if (form.rows.length && !same) {
    const ok = await ctx.confirm({
      title: "入力中の内容を置き換えますか?",
      message: `フォームに入力中の${form.rows.length}種目は消えて、${formatJaDate(log.date)}の内容に置き換わります。`,
      ok: "置き換える",
    });
    if (!ok) return;
  }
  const type = TRACKS.has(log.entries[0]?.track) ? log.entries[0].track : form.type;
  form = freshForm(type);
  if (mode === "edit") {
    form.mode = "edit";
    form.editingId = log.id;
    form.editingDate = log.date;
    form.date = log.date;
    form.dateTouched = true;
    form.rows = log.entries.map((e) => rowFromEntry(e, true));
  } else {
    // 旧形式の種目は、本来の記録方法で前回値から作り直す
    form.rows = log.entries.map((e) => (e.shapeMismatch ? newRow(e.name, e.shapeMismatch, logs) : rowFromEntry(e, false)));
  }
  persist();
  renderCompose({ focus: "compose-title" });
  scrollToEl(body.querySelector("#log-compose"));
  if (mode === "edit") {
    ctx.announce(`${formatJaDate(log.date)}の記録をフォームに読み込みました。変更して「更新する」を押してください`);
  } else {
    ctx.toast(`${formatJaDate(log.date)}の内容を今日の記録として入力しました。確認して「記録する」を押してください`, { tone: "info" });
  }
}

function cancelEdit() {
  const id = form.editingId;
  resetForm();
  renderCompose({ focus: "compose-title" });
  if (id && focusKey(`toggle-${id}`)) scrollToEl(body.querySelector(`[data-key="toggle-${CSS.escape(id)}"]`)?.closest(".log-item"));
  ctx.announce("編集をやめました");
}

function clearForm() {
  const rows = form.rows;
  const before = structuredClone({ ...form, rows: rows.map(({ key, ...r }) => r) });
  resetForm();
  form.type = before.type;
  renderCompose({ focus: "compose-title" });
  ctx.toast(`入力中の${rows.length}種目を消しました`, {
    tone: "info",
    action: "元に戻す",
    onAction: () => {
      form = { ...before, rows: before.rows.map((r) => ({ ...r, key: uid() })) };
      persist();
      renderCompose({ focus: "compose-title" });
    },
  });
}

// ---------- 操作: 一覧 ----------

function toggleLog(btn) {
  const id = btn.dataset.id;
  const open = !openLogs.has(id);
  if (open) openLogs.add(id);
  else openLogs.delete(id);
  btn.setAttribute("aria-expanded", String(open));
  btn.closest(".log-item")?.classList.toggle("is-open", open);
  const panel = document.getElementById(btn.getAttribute("aria-controls"));
  if (panel) panel.hidden = !open;
}

function removeLog(id) {
  const logs = ctx.storage.loadLogs();
  const i = logs.findIndex((l) => l.id === id);
  const removed = ctx.storage.deleteLog(id);
  if (!removed) return;
  openLogs.delete(id);
  if (celebrate?.logId === id) {
    celebrate = null;
    renderPr();
  }
  if (form.mode === "edit" && form.editingId === id) {
    resetForm();
    renderCompose();
  }
  const neighbour = logs[i + 1] ?? logs[i - 1];
  ctx.refresh("logs");
  if (!(neighbour && focusKey(`toggle-${neighbour.id}`))) body.querySelector("#history-title")?.focus({ preventScroll: true });
  ctx.toast(`${formatJaDate(removed.date)}の記録を削除しました`, {
    tone: "info",
    action: "元に戻す",
    onAction: () => {
      if (!ctx.storage.addLog(removed)) return;
      openLogs.add(removed.id);
      ctx.refresh("logs");
      focusKey(`toggle-${removed.id}`);
      ctx.toast("記録を元に戻しました", { tone: "ok" });
    },
  });
}

function showMore() {
  const logs = ctx.storage.loadLogs();
  const first = logs[limit];
  limit += MORE;
  renderHistory({ focus: first ? `toggle-${first.id}` : null });
}

// ---------- 一覧から選ぶシート ----------

function openPicker() {
  const type = form.type;
  const logs = ctx.storage.loadLogs();
  const groups = pickerGroups(type, logs);
  const picked = new Map(); // name → track(選んだ順)
  const logged = new Set(loggedNames(logs));
  const inForm = new Set(form.rows.map((r) => r.name));

  const itemHtml = (name, track) => {
    const nm = escapeHtml(name);
    const last = logged.has(name) ? lastWorkingSet(logs, name) : null;
    const info = getExerciseInfo(name);
    const sub = last?.track === track ? prevText(last)
      : track === "cardio" && isPoolExercise(name) ? "25m単位で記録"
      : SUB_MUSCLES[info?.sub]?.label ?? MUSCLE_LABELS[info?.muscle] ?? (isKnown(name) ? "" : "マイ種目");
    return `<li><button type="button" class="pick-item" data-name="${nm}" data-track="${track}" aria-pressed="false">` +
      `${exerciseIcon(name, track, "pick-ico")}<span class="pick-text"><span class="pick-name">${nm}` +
      (inForm.has(name) ? `<span class="tag tag--added">追加済み</span>` : "") + `</span>` +
      (sub ? `<span class="pick-sub">${escapeHtml(sub)}</span>` : "") +
      `</span><span class="pick-check" aria-hidden="true">${uiIcon("check")}</span></button></li>`;
  };
  const groupHtml = (g) =>
    `<section class="picker-group" data-group="${g.id}" aria-labelledby="pg-${g.id}">` +
    `<h3 class="picker-group-title" id="pg-${g.id}">${escapeHtml(g.label)}</h3>` +
    `<ul class="picker-list">${g.names.map((n) => itemHtml(n, trackFor(n, type))).join("")}</ul></section>`;
  const filters = groups.length >= 3
    ? `<div class="chips picker-filter" role="group" aria-label="絞り込み">` +
      `<button type="button" class="chip" data-filter="all" aria-pressed="true">すべて</button>` +
      groups.map((g) => `<button type="button" class="chip" data-filter="${g.id}" aria-pressed="false">${escapeHtml(g.label.replace(/\(.+\)$/, ""))}</button>`).join("") +
      `</div>`
    : "";
  const customs = [...logged].filter((n) => !isKnown(n));

  const sheetBody = document.createElement("div");
  sheetBody.className = "picker";
  sheetBody.innerHTML = filters +
    `<div class="picker-groups">${groups.map(groupHtml).join("")}</div>` +
    `<div class="picker-custom"><label class="field-label" for="picker-custom-name">一覧に無い種目</label>` +
    `<div class="custom-row"><input type="text" id="picker-custom-name" class="text-input" list="picker-custom-list" maxlength="40" ` +
    `autocomplete="off" enterkeyhint="done" placeholder="種目名を入力"><button type="button" class="btn btn-secondary custom-add">追加</button></div>` +
    `<datalist id="picker-custom-list">${customs.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}</datalist>` +
    `<p class="custom-note">${escapeHtml(TYPE_NAME[type])}として記録します(一覧にある名前なら、その種目の記録方法になります)。</p></div>`;
  const foot = document.createElement("div");
  foot.innerHTML = `<button type="button" class="btn btn-primary btn-lg btn-block picker-add" disabled>種目を選んでください</button>`;
  const addBtn = foot.querySelector(".picker-add");

  const paint = () => {
    for (const b of sheetBody.querySelectorAll(".pick-item")) b.setAttribute("aria-pressed", String(picked.has(b.dataset.name)));
    addBtn.disabled = picked.size === 0;
    addBtn.textContent = picked.size ? `${picked.size}種目を追加` : "種目を選んでください";
  };
  const toggle = (name, track) => {
    if (picked.has(name)) picked.delete(name);
    else picked.set(name, track);
    paint();
  };
  const addCustom = () => {
    const input = sheetBody.querySelector(".text-input");
    const name = input.value.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) {
      input.focus();
      return;
    }
    const track = trackFor(name, type);
    let item = [...sheetBody.querySelectorAll(".pick-item")].find((b) => b.dataset.name === name);
    if (!item) {
      let group = sheetBody.querySelector('[data-group="typed"]');
      if (!group) {
        sheetBody.querySelector(".picker-groups").insertAdjacentHTML("afterbegin",
          `<section class="picker-group" data-group="typed" aria-labelledby="pg-typed"><h3 class="picker-group-title" id="pg-typed">入力した種目</h3><ul class="picker-list"></ul></section>`);
        group = sheetBody.querySelector('[data-group="typed"]');
      }
      group.hidden = false;
      group.querySelector(".picker-list").insertAdjacentHTML("beforeend", itemHtml(name, track));
      item = [...group.querySelectorAll(".pick-item")].pop();
    }
    if (!picked.has(name)) picked.set(name, track);
    input.value = "";
    paint();
    item.scrollIntoView({ block: "nearest" });
    ctx.announce(`${name}を選びました`);
  };

  sheetBody.addEventListener("click", (e) => {
    const item = e.target.closest(".pick-item");
    if (item) {
      toggle(item.dataset.name, item.dataset.track);
      return;
    }
    const f = e.target.closest("[data-filter]");
    if (f) {
      for (const b of sheetBody.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b === f));
      for (const g of sheetBody.querySelectorAll(".picker-group")) {
        g.hidden = f.dataset.filter !== "all" && g.dataset.group !== f.dataset.filter && g.dataset.group !== "typed";
      }
      return;
    }
    if (e.target.closest(".custom-add")) addCustom();
  });
  sheetBody.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".text-input") && !e.isComposing) {
      e.preventDefault();
      addCustom();
    }
  });
  addBtn.addEventListener("click", () => {
    const entries = [...picked];
    addRows(entries.map(([n]) => n), (n) => picked.get(n));
    sheet.close();
    renderCompose();
    ctx.announce(`${entries.length}種目を追加しました`);
  });

  const sheet = ctx.openSheet({
    title: `種目を選ぶ(${TYPE_NAME[type]})`,
    body: sheetBody,
    footer: foot,
    onClose: () => requestAnimationFrame(() => focusKey("open-picker")),
  });
}

// ---------- イベント ----------

function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || !body.contains(btn)) return;
  const id = btn.dataset.id;
  switch (btn.dataset.act) {
    case "quick-add": quickAdd(btn.dataset.name); break;
    case "open-picker": openPicker(); break;
    case "remove-row": removeRow(btn.dataset.row); break;
    case "save": save(); break;
    case "cancel-edit": cancelEdit(); break;
    case "clear": clearForm(); break;
    case "close-pr":
      celebrate = null;
      renderPr();
      body.querySelector("#compose-title")?.focus({ preventScroll: true });
      break;
    case "toggle": toggleLog(btn); break;
    case "edit": loadLog(id, "edit"); break;
    case "repeat": loadLog(id, "copy"); break;
    case "delete": removeLog(id); break;
    case "more": showMore(); break;
    case "goto-menu": ctx.navigate("menu"); break;
    default: break;
  }
}

function onChange(e) {
  const t = e.target;
  if (t.name === "log-date") setDateChoice(t.value);
  else if (t.matches(".date-select")) {
    form.date = t.value;
    form.dateTouched = true;
    const sub = body.querySelector("#log-compose .date-other-sub");
    if (sub) sub.textContent = formatJaDate(form.date);
    persist();
  } else if (t.name === "log-type") {
    form.type = t.value;
    persist();
    refreshPicks();
  } else if (t.dataset.field) {
    onFieldChange(t);
  }
}

// ---------- ビューの約束(js/app.js 参照) ----------

export function mount(section, c) {
  ctx = c;
  body = section.querySelector(".view-body");
  const logs = ctx.storage.loadLogs();
  form = restoreDraft(logs) ?? freshForm();
  body.innerHTML = `<div class="log-layout"><div class="log-col">` +
    `<div id="log-pr" class="log-pr"></div>` +
    `<section id="log-compose" class="card compose" aria-labelledby="compose-title"></section></div>` +
    `<section id="log-history" class="history" aria-labelledby="history-title"></section></div>`;
  body.addEventListener("click", onClick);
  body.addEventListener("change", onChange);
  renderCompose();
  renderHistory();
}

export function update(reason) {
  const logs = ctx.storage.loadLogs();
  if (celebrate && !logs.some((l) => l.id === celebrate.logId)) {
    celebrate = null;
    renderPr();
  }
  if (reason === "import") {
    limit = PAGE;
    openLogs.clear();
    if (form.mode === "edit" && !logs.some((l) => l.id === form.editingId)) resetForm();
    renderCompose();
    renderHistory();
  } else if (reason === "logs") {
    if (form.mode === "edit" && !logs.some((l) => l.id === form.editingId)) {
      resetForm();
      renderCompose();
    } else {
      refreshPicks();
    }
    renderHistory();
  } else if (reason === "day") {
    if (form.mode === "new" && !form.dateTouched) form.date = localDateStr();
    renderCompose();
  } else if (reason === "plan") {
    refreshPicks();
  }
}

// 他の画面から「この記録を開く」で来たとき(detail.logId)
export function show(detail) {
  const id = detail?.logId;
  if (!id) return;
  const logs = ctx.storage.loadLogs();
  const i = logs.findIndex((l) => l.id === id);
  if (i < 0) return;
  if (i >= limit) limit = i + 1;
  openLogs.add(id);
  renderHistory({ focus: `toggle-${id}` });
  body.querySelector(`[data-key="toggle-${CSS.escape(id)}"]`)?.closest(".log-item")?.scrollIntoView({ block: "center" });
}
