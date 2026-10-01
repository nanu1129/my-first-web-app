// メニュー画面: 今日のメニュー(TODAY)・1週間のメニュー(日ごとの種目カード)・種目の差し替え/やり方/休憩タイマー・
// メニューの相談(調整)・その日の記録シート(ワンタップで記録へ転記)。
// メニューは ctx.getPlan()/setPlan() で保存し、再読み込み・再起動後もそのまま表示する(I02)。
// 描き直しても、開いている「やり方」・折りたたみの開閉とフォーカスは保つ(B16)。
import {
  adjustPlanVolume, canAdjustVolume, shortenPlan, alternativeExercise, alternativeCardio, hasAlternative,
  generatePlan, estimateMinutes, parseRestSeconds, getExerciseInfo, isPoolExercise, weeklySets,
  WEIGHT_CHOICES, MUSCLE_LABELS, SUB_MUSCLES, GOALS,
} from "../planner.js?v=14";
import { lastWorkingSet } from "../stats.js?v=14";
import { escapeHtml, formatJaDate, localDateStr, addDays, mondayOf, numRange } from "../util.js?v=14";
import { uiIcon } from "../icons.js?v=14";

const DAY_PREFIX = /^Day\s*\d+\s*[::]\s*/;
const TIER_LABEL = { main: "メイン", secondary: "サブ" };
// 重さを選ぶ種目(自重・バンドの種目は「自重」が初期値)
const LOADED = new Set(["barbell", "smith", "dumbbell", "kettlebell", "cable", "machine"]);
const PROFILE_KEYS = ["weight", "height", "age", "gender", "goal", "level", "frequency"];
const CONFIRM_GUARD_MS = 500; // 確認の直後の2回目のタップ(ダブルタップ)では確定しない

// 記録シートの選択肢
const SETS = numRange(1, 10);
const REPS = numRange(1, 50);
const SECONDS = [...numRange(5, 60, 5), ...numRange(70, 300, 10)];
const MINUTES = numRange(1, 180);
const POOL_METERS = numRange(25, 5000, 25);
const KILOMETERS = numRange(0.5, 42, 0.5);

const LIMIT_MSG = {
  harder: "これ以上セット数を増やせません(種目・部位ごとの上限に達しています)。",
  easier: "これ以上セット数を減らせません(各種目2セットが下限です)。",
  shorter: "すでに時短版です(これ以上は短くなりません)。元の長さに戻すには「最初の提案に戻す」を押してください。",
};

let ctx = null;
let body = null;
let selected = null;        // 表示中の日の番号(null = 次にやる日に合わせる)
let followNext = true;      // 日を自分で選ぶまでは「次にやる日」を表示し続ける
const openTips = new Set(); // 開いている「やり方」("日-種目")
const openPrep = new Set(); // 開いている折りたたみ("日-warmup" など)

// ---------- 小さなヘルパー ----------

const dayNum = (i) => `DAY ${i + 1}`;
const dayName = (day) => String(day?.title ?? "").replace(DAY_PREFIX, "") || "メニュー";
const profileOf = (rec) => rec.profile ?? ctx.storage.loadProfile();
const recordable = (day) => (day.exercises?.length ?? 0) > 0 || day.cardio != null;

// "8〜12回" "30〜60秒キープ" 等から代表値(範囲の中央)
function midNumber(text) {
  const nums = String(text ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length === 0) return null;
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

// "6〜10回" → ["6〜10", "回"](数字の部分を太字にするため)
function splitReps(text) {
  const m = /^(\d+(?:\.\d+)?(?:\s*[〜~～\-–]\s*\d+(?:\.\d+)?)?)(.*)$/.exec(String(text ?? ""));
  return m ? [m[1], m[2]] : ["", String(text ?? "")];
}

// 範囲の「〜」は数字用の書体に無いので、小さく添える
const rangeHtml = (num) => escapeHtml(num).replace(/\s*[〜~～\-–]\s*/, `<span class="tl">〜</span>`);

const sameList = (a = [], b = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
function sameProfile(a, b) {
  return PROFILE_KEYS.every((k) => a[k] === b[k]) && sameList(a.focus, b.focus) && sameList(a.equipment, b.equipment);
}

// 「時間を短く」でまだ変わるか(時短版にした後で「もっときつく」を押すと、また短くできる)
function canShorten(plan) {
  const copy = structuredClone(plan);
  shortenPlan(copy);
  return JSON.stringify(copy.days) !== JSON.stringify(plan.days);
}

function avgMinutes(plan) {
  const mins = plan.days.filter((d) => d.exercises?.length).map((d) => d.estMinutes || estimateMinutes(d));
  return mins.length ? Math.round(mins.reduce((s, m) => s + m, 0) / mins.length) : 0;
}

// 今週(月曜〜今日)の記録から、メニューのどの日が済んだかを調べる
function weekStatus(plan, logs) {
  const today = localDateStr();
  const monday = mondayOf(today);
  const done = new Map(); // 日の番号 → 実施日
  let todayDone = null;
  for (const log of logs) {
    const pd = log.planDay;
    if (!pd || log.date < monday || log.date > today) continue;
    if (plan.days[pd.index]?.title !== pd.title) continue;
    if (!done.has(pd.index) || done.get(pd.index) < log.date) done.set(pd.index, log.date);
    if (log.date === today) todayDone = pd.index;
  }
  const order = plan.days.map((_, i) => i).filter((i) => recordable(plan.days[i]));
  const next = order.find((i) => !done.has(i)) ?? null;
  return { done, next, todayDone, total: order.length };
}

// ---------- 描画 ----------

function render() {
  const rec = ctx.getPlan();
  if (!rec) {
    body.innerHTML = emptyHtml(ctx.storage.loadProfile());
    return;
  }
  const status = weekStatus(rec.plan, ctx.storage.loadLogs());
  if (followNext || selected == null || selected >= rec.plan.days.length) {
    selected = status.next ?? status.todayDone ?? 0;
  }
  body.innerHTML =
    hintHtml(rec) +
    `<section id="menu-today" class="today-card" aria-labelledby="today-title">${todayHtml(rec, status)}</section>` +
    `<section class="week" aria-labelledby="week-title">` +
    `<div id="week-head" class="week-head">${weekHeadHtml(rec)}</div>` +
    `<div class="day-tabs" role="tablist" aria-label="表示する日">${tabsHtml(rec.plan.days, status)}</div>` +
    `<div id="menu-day" class="day-panel" role="tabpanel" aria-labelledby="day-tab-${selected}">${dayHtml(rec, selected, status)}</div>` +
    `</section>` +
    notesHtml(rec) +
    `<section id="menu-consult" class="card consult" aria-labelledby="consult-title">${consultHtml(rec)}</section>` +
    adviceHtml(rec.plan) +
    `<p class="fine-print">メニューは一般的なフィットネス情報にもとづく目安です。痛みや体調の不安があるときは無理をせず、医師に相談してください。</p>`;
}

// 描き直し(フォーカスしていた操作を、描き直した後の同じ操作へ戻す)
function rerender() {
  const active = document.activeElement;
  const key = active && body.contains(active) ? active.dataset.key : null;
  render();
  if (key) body.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
}

function emptyHtml(profile) {
  const [title, text, act, label] = profile
    ? ["メニューがまだありません", "保存済みのプロフィールから、1週間のメニューを作成します。", "create", "メニューを作成"]
    : ["あなた専用の1週間メニューを作りましょう", "体格・目的・使える器具を選ぶだけ。すべてタップで入力できます。", "goto-settings", "プロフィールを入力する"];
  return `<div class="empty-state">` +
    `<span class="empty-ico">${uiIcon("dumbbell")}</span>` +
    `<h2 class="empty-title">${title}</h2><p class="empty-text">${text}</p>` +
    `<button type="button" class="btn btn-primary btn-lg" data-act="${act}" data-key="empty-cta">${label}</button>` +
    `</div>`;
}

function hintHtml(rec) {
  const now = ctx.storage.loadProfile();
  if (!now || !rec.profile || sameProfile(now, rec.profile)) return "";
  return `<div class="notice notice--hint" role="note">${uiIcon("infoCircle", "notice-ico")}<div class="notice-body">` +
    `<p class="notice-text">プロフィールが変更されています。今のメニューは変更前の内容で作られています。</p>` +
    `<button type="button" class="link-btn" data-act="regen-profile" data-key="hint-regen">新しいプロフィールで作り直す</button>` +
    `</div></div>`;
}

function weekProgressHtml(days, st) {
  const segs = days.map((d, i) => {
    const cls = st.done.has(i) ? " is-done" : i === st.next ? " is-next" : !recordable(d) ? " is-rest" : "";
    return `<li class="wp-seg${cls}"></li>`;
  }).join("");
  const label = `今週 ${st.done.size}/${st.total}日 完了`;
  return `<div class="week-progress"><ol class="wp-bar" aria-hidden="true">${segs}</ol>` +
    `<span class="wp-text">${label}</span></div>`;
}

// 「·」で区切った短い情報の並び。項目の途中では折り返さない(.meta-line)
const metaItemsHtml = (items) =>
  items.filter(Boolean).map((t) => `<span>${escapeHtml(t)}</span>`).join(`<span class="sep" aria-hidden="true"> · </span>`);

function dayMetaHtml(day) {
  return metaItemsHtml([
    day.exercises?.length ? `${day.exercises.length}種目` : null,
    day.estMinutes ? `約${day.estMinutes}分` : null,
    day.focusSummary || null,
  ]);
}

function todayHtml(rec, st) {
  const days = rec.plan.days;
  const head = `<p class="eyebrow"><span class="eyebrow-en" lang="en">TODAY</span>` +
    `<span>${escapeHtml(formatJaDate(localDateStr()))}</span></p>`;
  const progress = weekProgressHtml(days, st);

  if (st.todayDone != null) {
    const next = st.next != null
      ? `次回は ${dayNum(st.next)} ${escapeHtml(dayName(days[st.next]))} です。`
      : "今週のメニューはすべて完了です。";
    return head +
      `<h2 id="today-title" class="today-title" tabindex="-1"><span class="done-mark">${uiIcon("check")}</span>今日のトレーニングは完了!</h2>` +
      `<p class="today-meta">${dayNum(st.todayDone)} ${escapeHtml(dayName(days[st.todayDone]))} を記録しました。${next}</p>` +
      progress +
      (st.next != null
        ? `<div class="today-actions"><button type="button" class="btn btn-secondary" data-act="view-day" data-day="${st.next}" data-key="today-next">次回の内容を見る</button></div>`
        : "");
  }

  if (st.next == null) {
    return head +
      `<h2 id="today-title" class="today-title" tabindex="-1">今週のメニューはすべて完了!</h2>` +
      `<p class="today-meta">お疲れさまでした。記録を反映して作り直すと、重さや回数の目標が更新されます。</p>` +
      progress +
      `<div class="today-actions"><button type="button" class="btn btn-primary" data-act="regen-logs" data-key="today-regen">` +
      `${uiIcon("refresh")}記録を反映して作り直す</button></div>`;
  }

  const i = st.next;
  const day = days[i];
  const label = `${dayNum(i)} ${dayName(day)}`;
  const names = day.exercises.map((e) => e.name);
  if (day.cardio) names.push(day.cardio.name);
  const start = day.exercises.length
    ? `<button type="button" class="btn btn-primary btn-lg" data-act="start" data-day="${i}" data-key="today-start" ` +
      `aria-label="${escapeHtml(label)}をワークアウトモードで開始">${uiIcon("play")}開始</button>`
    : "";
  return head +
    `<h2 id="today-title" class="today-title" tabindex="-1"><span class="day-chip" lang="en">${dayNum(i)}</span><span>${escapeHtml(dayName(day))}</span></h2>` +
    `<p class="today-meta meta-line">${dayMetaHtml(day)}</p>` +
    `<p class="today-list">${metaItemsHtml(names)}</p>` +
    `<div class="today-actions">${start}` +
    `<button type="button" class="btn btn-outline btn-lg" data-act="record" data-day="${i}" data-key="today-record" ` +
    `aria-label="${escapeHtml(label)}をやったので記録">${uiIcon("check")}記録</button></div>` +
    progress;
}

// 1週間のメニューの見出し: 分割法・目的・強化部位・BMI を1行に(種目がすぐ下に来るよう簡潔に)
function weekHeadHtml(rec) {
  const plan = rec.plan;
  const p = rec.profile;
  const badges = [rec.modified ? "調整済み" : null, plan.shortened && !canShorten(plan) ? "時短版" : null]
    .filter(Boolean).map((b) => `<span class="badge">${b}</span>`).join("");
  const items = [
    plan.splitName,
    p ? `${GOALS[p.goal] ?? ""}・週${p.frequency}回` : null,
    plan.focusLabels?.length ? `★ ${plan.focusLabels.join("・")}` : null,
    plan.bmi?.value ? `BMI ${plan.bmi.value}(${plan.bmi.category})` : null,
  ];
  return `<div class="section-head"><h2 id="week-title" class="section-title">1週間のメニュー</h2>` +
    (badges ? `<span class="badges">${badges}</span>` : "") + `</div>` +
    `<p class="plan-line meta-line">${metaItemsHtml(items)}</p>` +
    volumeHtml(plan);
}

// 週のセット数(部位ごと)。入れ替え・調整のたびに今のメニューから数え直す(I17)
function volumeHtml(plan) {
  const totals = weeklySets(plan);
  const byGroup = new Map();
  for (const [key, sub] of Object.entries(SUB_MUSCLES)) {
    if (!(totals[key] > 0)) continue;
    byGroup.set(sub.group, (byGroup.get(sub.group) ?? 0) + totals[key]);
  }
  if (byGroup.size === 0) return "";
  const chips = [...byGroup].map(([g, n]) =>
    `<li class="vol-chip"><span>${escapeHtml(MUSCLE_LABELS[g] ?? g)}</span><b class="num">${n}</b></li>`).join("");
  return `<div class="vol-row"><span class="vol-k" id="vol-title">週のセット数</span>` +
    `<ul class="vol-list" aria-labelledby="vol-title">${chips}</ul></div>`;
}

// このメニューのポイント(回数と重さ・1週間の組み方・記録の反映)。普段は閉じておく
function notesHtml(rec) {
  const plan = rec.plan;
  const notes = [
    plan.repScheme ? ["回数と重さ", plan.repScheme] : null,
    plan.weekNote ? ["1週間の組み方", plan.weekNote] : null,
    plan.historySummary?.length ? ["記録の反映", plan.historySummary.join(" / ")] : null,
  ].filter(Boolean);
  const stamp = `${formatJaDate(localDateStr(new Date(rec.savedAt || Date.now())))}に作成`;
  return `<details id="menu-notes" class="fold card plan-notes" data-prep="notes"${openPrep.has("notes") ? " open" : ""}>` +
    `<summary>${uiIcon("bulb", "fold-ico")}<span class="fold-label">このメニューの<wbr>ポイント</span>` +
    `<span class="fold-count">${notes.length}</span>${uiIcon("chevronDown", "fold-chev")}</summary>` +
    `<dl class="note-list">${notes.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` +
    `<p class="plan-stamp">${escapeHtml(stamp)}</p></details>`;
}

function tabsHtml(days, st) {
  return days.map((d, i) => {
    const sel = i === selected;
    const done = st.done.has(i);
    const mark = done
      ? `<span class="dt-mark is-done">${uiIcon("check")}</span>`
      : i === st.next ? `<span class="dt-mark is-next"></span>` : "";
    const state = done ? "(今週完了)" : i === st.next ? "(次にやる日)" : "";
    return `<button type="button" role="tab" id="day-tab-${i}" class="day-tab" aria-selected="${sel}" aria-controls="menu-day" ` +
      `tabindex="${sel ? 0 : -1}" data-act="select-day" data-day="${i}" data-key="daytab-${i}">` +
      `<span class="dt-num" lang="en">${dayNum(i)}</span><span class="dt-name">${escapeHtml(dayName(d))}</span>${mark}` +
      `<span class="sr-only">${state}</span></button>`;
  }).join("");
}

function dayHeadHtml(day, i, st) {
  const doneDate = st.done.get(i);
  // 日の名前はすぐ上のタブに出ているので、見出しは読み上げ用にして、見た目は内容の要約だけにする。
  // 今日のカード(TODAY)と同じ日なら、要約はそちらに出ているので繰り返さない
  const meta = i === st.next && st.todayDone == null ? "" : `<p class="day-meta meta-line">${dayMetaHtml(day)}</p>`;
  if (!meta && !doneDate) return `<div class="day-head is-empty"><h3 class="sr-only">${dayNum(i)} ${escapeHtml(dayName(day))}</h3></div>`;
  return `<div class="day-head">` +
    `<h3 class="sr-only">${dayNum(i)} ${escapeHtml(dayName(day))}</h3>` +
    meta +
    (doneDate ? `<span class="badge badge--done">${uiIcon("check")}${escapeHtml(formatJaDate(doneDate))} 完了</span>` : "") +
    `</div>`;
}

function dayHtml(rec, i, st) {
  const day = rec.plan.days[i];
  if (!day) return "";
  const label = `${dayNum(i)} ${dayName(day)}`;
  let html = dayHeadHtml(day, i, st);
  if (!day.exercises?.length) {
    html += `<p class="day-note">筋トレはお休みの日です。軽い有酸素とストレッチで血流を促し、回復を早めましょう。</p>`;
  }
  html += foldHtml(i, "warmup", "flame", "ウォームアップ", day.warmup);
  if (day.exercises?.length) {
    const profile = profileOf(rec);
    html += `<ol class="ex-list">${day.exercises.map((ex, j) => exHtml(profile, day, i, j, ex)).join("")}</ol>`;
  }
  if (day.cardio) html += cardioHtml(i, day.cardio, (day.exercises?.length ?? 0) + 1);
  html += foldHtml(i, "cooldown", "wind", "クールダウン・ストレッチ", day.cooldown);
  if (recordable(day)) {
    html += `<div class="day-actions">` +
      (day.exercises?.length
        ? `<button type="button" class="btn btn-primary" data-act="start" data-day="${i}" data-key="day-start-${i}" ` +
          `aria-label="${escapeHtml(label)}をワークアウトモードで開始">${uiIcon("play")}この日を開始</button>`
        : "") +
      `<button type="button" class="btn btn-outline" data-act="record" data-day="${i}" data-key="day-record-${i}" ` +
      `aria-label="${escapeHtml(label)}をやったので記録">${uiIcon("check")}この日を記録</button></div>`;
  }
  return html;
}

function foldHtml(d, kind, icon, label, items) {
  if (!items?.length) return "";
  const key = `${d}-${kind}`;
  return `<details class="fold prep" data-prep="${key}"${openPrep.has(key) ? " open" : ""}>` +
    `<summary>${uiIcon(icon, "fold-ico")}<span class="fold-label">${label}</span>` +
    `<span class="fold-count">${items.length}</span>${uiIcon("chevronDown", "fold-chev")}</summary>` +
    `<ul class="fold-list">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></details>`;
}

// 前回記録と今日の目標(ダブルプログレッション)。note は "前回(9/25): 60kg×10回×3セット → 目標 …"
function targetHtml(note, target) {
  const text = String(note ?? "");
  if (!text && !target?.text) return "";
  const [prevPart, goalPart] = text.split(" → ");
  const goalText = target?.text ?? (goalPart ?? "").replace(/^目標\s*/, "");
  const prev = (prevPart ?? "").replace(/^前回\((.+?)\):\s*/, "前回 $1 ");
  // 「90kg×8回(同じ重量で回数を伸ばす)」の補足は別の行に(行末に1文字だけ残らないように)
  const m = /^(.+?)(\(.+\))$/.exec(goalText);
  const goal = m ? m[1] : goalText;
  const hint = m ? `<span class="tg-hint">${escapeHtml(m[2])}</span>` : "";
  return `<p class="ex-target">${uiIcon("trend", "tg-ico")}` +
    (goal ? `<span class="tg-goal"><span class="tg-k">目標</span>${escapeHtml(goal)}${hint}</span>` : "") +
    (prev ? `<span class="tg-prev">${escapeHtml(prev)}</span>` : "") +
    `</p>`;
}

function exHtml(profile, day, d, j, ex) {
  const nm = escapeHtml(ex.name);
  const key = `${d}-${j}`;
  const tipOpen = Boolean(ex.tip) && openTips.has(key);
  const sec = parseRestSeconds(ex.rest);
  const [num, unit] = splitReps(ex.reps);
  const part = SUB_MUSCLES[ex.sub]?.label ?? MUSCLE_LABELS[ex.muscle] ?? "";
  const tags = [
    part ? `<span class="tag">${escapeHtml(part)}</span>` : "",
    TIER_LABEL[ex.tier] ? `<span class="tag tag--${ex.tier}">${TIER_LABEL[ex.tier]}</span>` : "",
    ex.focused ? `<span class="tag tag--focus">★ 強化</span>` : "",
  ].join("");
  const canSwap = hasAlternative(profile, day, j);
  const info = ex.tip
    ? `<button type="button" class="icon-btn info-btn" data-act="tip" data-day="${d}" data-ex="${j}" data-key="info-${key}" ` +
      `aria-expanded="${tipOpen}" aria-controls="tip-${key}" aria-label="${nm}のやり方">${uiIcon("info")}</button>`
    : "";
  const swap = `<button type="button" class="icon-btn swap-btn" data-act="swap" data-day="${d}" data-ex="${j}" data-key="swap-${key}" ` +
    `aria-label="${nm}を別の種目に替える"${canSwap ? "" : ` aria-disabled="true"`}>${uiIcon("swap")}</button>`;
  const rest = sec
    ? `<button type="button" class="rest-btn" data-act="rest" data-sec="${sec}" data-key="rest-${key}" ` +
      `aria-label="${nm}の休憩タイマー ${sec}秒を開始">${uiIcon("timer")}<span>${escapeHtml(ex.rest)}</span></button>`
    : `<span class="rx-rest">休憩 ${escapeHtml(ex.rest ?? "")}</span>`;
  return `<li class="ex${ex.focused ? " is-focus" : ""}" id="ex-${key}">` +
    `<div class="ex-head">` +
    `<span class="ex-num" aria-hidden="true">${String(j + 1).padStart(2, "0")}</span>` +
    `<div class="ex-title"><h4 class="ex-name">${nm}</h4><p class="ex-tags">${tags}</p></div>` +
    `<div class="ex-actions">${info}${swap}</div></div>` +
    `<div class="ex-rx"><span class="rx"><b class="rx-n">${escapeHtml(ex.sets)}</b>セット</span>` +
    `<span class="rx-x" aria-hidden="true">×</span>` +
    `<span class="rx"><b class="rx-n">${rangeHtml(num)}</b>${escapeHtml(unit)}</span>${rest}</div>` +
    targetHtml(ex.note, ex.target) +
    (ex.tip ? `<div class="ex-tip" id="tip-${key}"${tipOpen ? "" : " hidden"}>${uiIcon("bulb", "tip-ico")}<p>${escapeHtml(ex.tip)}</p></div>` : "") +
    `</li>`;
}

// 有酸素も筋トレの種目カードと同じ骨組み(番号+名前 / タグ / 数字の行 / 目標)で描く
function cardioHtml(d, c, n) {
  const pool = c.isPool ?? isPoolExercise(c.name);
  const nm = escapeHtml(c.name);
  const tags = `<span class="tag tag--cardio">有酸素</span>` + (c.optional ? `<span class="tag">任意</span>` : "");
  const metrics = [
    pool && c.distanceM ? `<span class="rx"><b class="rx-n">${escapeHtml(c.distanceM)}</b>m</span>` : "",
    c.minutes ? `<span class="rx"><b class="rx-n">${escapeHtml(c.minutes)}</b>分</span>` : "",
  ].filter(Boolean).join(`<span class="rx-x" aria-hidden="true">·</span>`);
  return `<div class="ex ex--cardio" id="cardio-${d}">` +
    `<div class="ex-head">` +
    `<span class="ex-num" aria-hidden="true">${String(n).padStart(2, "0")}</span>` +
    `<div class="ex-title"><h4 class="ex-name">${nm}</h4><p class="ex-tags">${tags}</p></div>` +
    `<div class="ex-actions"><button type="button" class="icon-btn swap-btn" data-act="swap-cardio" data-day="${d}" data-key="cswap-${d}" ` +
    `aria-label="${nm}を別の有酸素に替える">${uiIcon("swap")}</button></div></div>` +
    (metrics ? `<div class="ex-rx">${metrics}</div>` : "") +
    (c.duration ? `<p class="ex-desc">${uiIcon(pool ? "wave" : "pulse", "desc-ico")}<span>${escapeHtml(c.duration)}</span></p>` : "") +
    targetHtml(c.note, c.target) +
    `</div>`;
}

function consultHtml(rec) {
  const plan = rec.plan;
  const shortTarget = plan.meta?.goal === "strength" ? 50 : 45;
  const btn = (op, icon, label, enabled, caption) =>
    `<button type="button" class="consult-btn" data-act="consult" data-op="${op}" data-key="consult-${op}"` +
    `${enabled ? "" : ` aria-disabled="true"`}>${uiIcon(icon, "consult-ico")}` +
    `<span class="consult-label">${label}</span><span class="consult-cap">${caption}</span></button>`;
  const harder = canAdjustVolume(plan, 1);
  const easier = canAdjustVolume(plan, -1);
  const shorter = canShorten(plan);
  return `<div class="section-head"><h2 id="consult-title" class="section-title">メニューを調整</h2></div>` +
    `<div class="consult-grid">` +
    btn("harder", "bolt", "もっときつく", harder, harder ? "セット数を増やす" : "上限です") +
    btn("easier", "moon", "もっと楽に", easier, easier ? "セット数を減らす" : "下限です") +
    btn("shorter", "clock", "時間を短く", shorter, shorter ? `1日${shortTarget}分以内に` : "時短版です") +
    btn("reset", "undo", "最初の提案に戻す", true, "最新の記録で<wbr>作り直す") +
    `</div>` +
    `<p class="consult-hint">${uiIcon("swap", "hint-ico")}種目ごとの入れ替えボタンで、同じ部位の別の種目に差し替えられます。</p>`;
}

function adviceHtml(plan) {
  const a = plan.advice;
  if (!a) return "";
  const open = openPrep.has("advice") ? " open" : "";
  return `<details class="fold card advice" data-prep="advice"${open}>` +
    `<summary>${uiIcon("leaf", "fold-ico")}<span class="fold-label">栄養・生活アドバイス</span>${uiIcon("chevronDown", "fold-chev")}</summary>` +
    `<dl class="note-list"><div><dt>タンパク質</dt><dd>${escapeHtml(a.protein)}</dd></div>` +
    `<div><dt>カロリー</dt><dd>${escapeHtml(a.calories)}</dd></div></dl>` +
    `<ul class="fold-list">${(a.tips ?? []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></details>`;
}

// ---------- 部分的な描き直し ----------

function flash(el) {
  if (!el || !ctx.motion()) return;
  el.classList.remove("is-flash");
  void el.offsetWidth; // 連続で押してもアニメーションをやり直す
  el.classList.add("is-flash");
  el.addEventListener("animationend", () => el.classList.remove("is-flash"), { once: true });
}

function refreshSummary(rec) {
  const st = weekStatus(rec.plan, ctx.storage.loadLogs());
  const today = body.querySelector("#menu-today");
  if (today && !today.contains(document.activeElement)) today.innerHTML = todayHtml(rec, st);
  const head = body.querySelector("#menu-day .day-head");
  if (head) head.outerHTML = dayHeadHtml(rec.plan.days[selected], selected, st);
  const weekHead = body.querySelector("#week-head");
  if (weekHead) weekHead.innerHTML = weekHeadHtml(rec);
  const consult = body.querySelector("#menu-consult");
  if (consult && !consult.contains(document.activeElement)) consult.innerHTML = consultHtml(rec);
}

function selectDay(i, { focusTab = false, scroll = false } = {}) {
  const rec = ctx.getPlan();
  if (!rec?.plan.days[i]) return;
  followNext = false;
  selected = i;
  for (const tab of body.querySelectorAll(".day-tab")) {
    const on = Number(tab.dataset.day) === i;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on) {
      tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: ctx.motion() ? "smooth" : "auto" });
      if (focusTab) tab.focus({ preventScroll: true });
    }
  }
  const panel = body.querySelector("#menu-day");
  panel.setAttribute("aria-labelledby", `day-tab-${i}`);
  panel.innerHTML = dayHtml(rec, i, weekStatus(rec.plan, ctx.storage.loadLogs()));
  if (scroll) body.querySelector(".week")?.scrollIntoView({ behavior: ctx.motion() ? "smooth" : "auto", block: "start" });
}

// ---------- 操作 ----------

function toggleTip(btn) {
  const key = `${btn.dataset.day}-${btn.dataset.ex}`;
  const tip = body.querySelector(`#tip-${key}`);
  if (!tip) return;
  tip.hidden = !tip.hidden;
  btn.setAttribute("aria-expanded", String(!tip.hidden));
  if (tip.hidden) openTips.delete(key);
  else openTips.add(key);
}

function undoToast(message, before, undoneMessage) {
  ctx.toast(message, {
    tone: "ok",
    action: "元に戻す",
    onAction: () => {
      ctx.setPlan(before);
      rerender();
      ctx.toast(undoneMessage, { tone: "info" });
    },
  });
}

function swapExercise(d, j, btn) {
  const rec = ctx.getPlan();
  const day = rec?.plan.days[d];
  const cur = day?.exercises[j];
  if (!cur) return;
  const alt = alternativeExercise(profileOf(rec), ctx.storage.loadLogs(), day, j);
  if (!alt) {
    ctx.toast(`${cur.name} と入れ替えられる種目がありません(使える器具・レベルの範囲内)。`, { tone: "info" });
    return;
  }
  const before = structuredClone(rec);
  const hadFocus = btn === document.activeElement;
  day.exercises[j] = alt;
  day.estMinutes = estimateMinutes(day);
  rec.modified = true;
  ctx.setPlan(rec);
  const li = body.querySelector(`#ex-${d}-${j}`);
  if (li) {
    li.outerHTML = exHtml(profileOf(rec), day, d, j, alt);
    // 同じ日の他の種目も、入れ替え候補の有無が変わることがある
    for (const k of day.exercises.keys()) {
      const b = body.querySelector(`[data-key="swap-${d}-${k}"]`);
      if (!b || k === j) continue;
      if (hasAlternative(profileOf(rec), day, k)) b.removeAttribute("aria-disabled");
      else b.setAttribute("aria-disabled", "true");
    }
  }
  refreshSummary(rec);
  if (hadFocus) body.querySelector(`[data-key="swap-${d}-${j}"]`)?.focus({ preventScroll: true });
  flash(body.querySelector(`#ex-${d}-${j}`));
  undoToast(`${cur.name} → ${alt.name} に替えました`, before, `${cur.name} に戻しました`);
}

function swapCardio(d, btn) {
  const rec = ctx.getPlan();
  const day = rec?.plan.days[d];
  if (!day?.cardio) return;
  const alt = alternativeCardio(profileOf(rec), ctx.storage.loadLogs(), day.cardio.name, new Date(), { day });
  if (!alt) {
    ctx.toast("ほかに選べる有酸素種目がありません(使える器具・施設の範囲内)。", { tone: "info" });
    return;
  }
  const before = structuredClone(rec);
  const prevName = day.cardio.name;
  const hadFocus = btn === document.activeElement;
  day.cardio = alt;
  day.estMinutes = estimateMinutes(day);
  rec.modified = true;
  ctx.setPlan(rec);
  const box = body.querySelector(`#cardio-${d}`);
  if (box) box.outerHTML = cardioHtml(d, alt, day.exercises.length + 1);
  refreshSummary(rec);
  if (hadFocus) body.querySelector(`[data-key="cswap-${d}"]`)?.focus({ preventScroll: true });
  flash(body.querySelector(`#cardio-${d}`));
  undoToast(`${prevName} → ${alt.name} に替えました`, before, `${prevName} に戻しました`);
}

function consult(op, btn) {
  const rec = ctx.getPlan();
  if (!rec) return;
  if (btn.getAttribute("aria-disabled") === "true") {
    ctx.toast(LIMIT_MSG[op], { tone: "info" });
    return;
  }
  const before = structuredClone(rec);
  let message;
  if (op === "harder" || op === "easier") {
    const n = adjustPlanVolume(rec.plan, op === "harder" ? 1 : -1);
    if (n === 0) {
      ctx.toast(LIMIT_MSG[op], { tone: "info" });
      return;
    }
    message = `${n}種目のセット数を1つ${op === "harder" ? "増やし" : "減らし"}ました`;
  } else if (op === "shorter") {
    const from = avgMinutes(rec.plan);
    shortenPlan(rec.plan);
    openTips.clear(); // 種目が減ると番号がずれる
    message = `時短版にしました(1日 平均 約${from}分 → 約${avgMinutes(rec.plan)}分)`;
  } else {
    rec.plan = generatePlan(profileOf(rec), ctx.storage.loadLogs());
    rec.savedAt = Date.now();
    openTips.clear();
    message = "最初の提案に戻しました(最新の記録を反映)";
  }
  rec.modified = op !== "reset";
  ctx.setPlan(rec);
  rerender();
  flash(body.querySelector("#menu-day"));
  undoToast(message, before, "調整を取り消しました");
}

async function regenerate(useCurrentProfile) {
  const rec = ctx.getPlan();
  if (!rec) return;
  const profile = useCurrentProfile ? ctx.storage.loadProfile() : profileOf(rec);
  if (!profile) return;
  if (rec.modified) {
    const ok = await ctx.confirm({
      title: "メニューを作り直しますか?",
      message: "差し替えや調整をした内容は、新しいメニューに置き換わります(直後なら「元に戻す」で戻せます)。",
      ok: "作り直す",
    });
    if (!ok) return;
  }
  const before = structuredClone(rec);
  const next = ctx.createPlan(profile);
  ctx.toast(`${next.plan.days.length}日分のメニューを作り直しました`, {
    tone: "ok",
    action: "元に戻す",
    onAction: () => {
      ctx.setPlan(before);
      ctx.refresh("plan");
      ctx.toast("元のメニューに戻しました", { tone: "info" });
    },
  });
}

function createFromProfile() {
  const profile = ctx.storage.loadProfile();
  if (!profile) {
    ctx.navigate("settings");
    return;
  }
  const rec = ctx.createPlan(profile);
  ctx.toast(`1週間のメニューを作成しました(${rec.plan.days.length}日分)`, { tone: "ok" });
  body.querySelector("#today-title")?.focus({ preventScroll: true });
}

function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || !body.contains(btn)) return;
  const d = Number(btn.dataset.day);
  const j = Number(btn.dataset.ex);
  switch (btn.dataset.act) {
    case "start": ctx.startWorkout(d); break;
    case "record": openRecordSheet(d, btn.dataset.key); break;
    case "select-day": selectDay(d); break;
    case "view-day": selectDay(d, { scroll: true }); break;
    case "tip": toggleTip(btn); break;
    case "swap":
      if (btn.getAttribute("aria-disabled") === "true") {
        ctx.toast("この種目と入れ替えられる種目がありません(使える器具・レベルの範囲内)。", { tone: "info" });
      } else {
        swapExercise(d, j, btn);
      }
      break;
    case "swap-cardio": swapCardio(d, btn); break;
    case "rest": ctx.startRestTimer(Number(btn.dataset.sec)); break;
    case "consult": consult(btn.dataset.op, btn); break;
    case "regen-profile": regenerate(true); break;
    case "regen-logs": regenerate(false); break;
    case "goto-settings": ctx.navigate("settings"); break;
    case "create": createFromProfile(); break;
    default: break;
  }
}

// 日のタブは左右キー・Home・End で移動できる(WAI-ARIA のタブの作法)
function onKeydown(e) {
  const tab = e.target.closest?.(".day-tab");
  if (!tab) return;
  const tabs = [...body.querySelectorAll(".day-tab")];
  const i = tabs.indexOf(tab);
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (to == null) return;
  e.preventDefault();
  const n = (to + tabs.length) % tabs.length;
  selectDay(Number(tabs[n].dataset.day), { focusTab: true });
}

// <details> の開閉を覚えておく(toggle は伝播しないので捕捉フェーズで受ける)
function onToggle(e) {
  const key = e.target.dataset?.prep;
  if (!key) return;
  if (e.target.open) openPrep.add(key);
  else openPrep.delete(key);
}

// ---------- 記録シート(その日の内容をワンタップで記録へ) ----------

// 選択肢に無い値(前回の 22kg など)は、丸めずにその値の選択肢を足す(B30)
function withValue(values, v) {
  if (!Number.isFinite(v) || values.includes(v)) return values;
  return [...values, v].sort((a, b) => a - b);
}

function selectHtml(cls, aria, label, values, value, fmt, empty = null) {
  const opts = (empty ? `<option value=""${value == null ? " selected" : ""}>${empty}</option>` : "") +
    withValue(values, value).map((v) => `<option value="${v}"${v === value ? " selected" : ""}>${fmt(v)}</option>`).join("");
  const unset = empty && value == null && cls === "f-weight" ? " is-unset" : "";
  return `<label class="rec-field"><span class="rec-lab" aria-hidden="true">${label}</span>` +
    `<select class="${cls}${unset}" aria-label="${aria}">${opts}</select></label>`;
}

function isLoaded(name) {
  return LOADED.has(getExerciseInfo(name)?.load);
}

// その日の内容 → 記録シートの行(初期値は 今日の目標 → 前回の記録 → メニューの回数 の順に採用)
function recordRows(day, logs) {
  const rows = day.exercises.map((ex) => {
    const last = lastWorkingSet(logs, ex.name);
    const t = ex.target ?? {};
    const sets = Number(ex.sets) || 3;
    if (ex.track === "time") {
      return { name: ex.name, track: "time", sets, seconds: t.seconds ?? last?.seconds ?? midNumber(ex.reps) ?? 30 };
    }
    const lastWeight = last?.track === "weight" ? last.weight : null;
    const weight = t.weight ?? lastWeight ?? (isLoaded(ex.name) ? null : 0);
    return { name: ex.name, track: "weight", sets, weight, reps: t.reps ?? midNumber(ex.reps) ?? 10 };
  });
  if (day.cardio) {
    const c = day.cardio;
    const pool = c.isPool ?? isPoolExercise(c.name);
    rows.push({
      name: c.name,
      track: "cardio",
      // 任意の軽い泳ぎは処方どおり(前回より伸ばす目標は使わない)
      minutes: (c.optional ? null : c.target?.minutes) ?? c.minutes ?? midNumber(c.duration) ?? 20,
      distance: pool ? ((c.optional ? null : c.target?.distance) ?? c.distanceM ?? null) : (c.optional ? null : c.target?.distance ?? null),
      unit: pool ? "m" : "km",
      optional: c.optional === true,
    });
  }
  return rows;
}

function recRowHtml(r, k) {
  const nm = escapeHtml(r.name);
  let fields;
  if (r.track === "time") {
    fields = selectHtml("f-sec", `${nm}のキープ時間(秒)`, "時間(秒)", SECONDS, r.seconds, String) +
      selectHtml("f-sets", `${nm}のセット数`, "セット", SETS, r.sets, String);
  } else if (r.track === "cardio") {
    const unit = r.unit === "m" ? "m" : "km";
    fields = selectHtml("f-min", `${nm}の時間(分)`, "時間(分)", MINUTES, r.minutes, String) +
      selectHtml("f-dist", `${nm}の距離(${unit})`, `距離(${unit})`, unit === "m" ? POOL_METERS : KILOMETERS, r.distance, String, "なし");
  } else {
    fields = selectHtml("f-weight", `${nm}の重量(kg)`, "重量(kg)", WEIGHT_CHOICES, r.weight, (v) => (v === 0 ? "自重" : String(v)), r.weight == null ? "選ぶ" : null) +
      selectHtml("f-sets", `${nm}のセット数`, "セット", SETS, r.sets, String) +
      selectHtml("f-reps", `${nm}の回数`, "回数", REPS, r.reps, String);
  }
  const on = !r.optional;
  const cols = r.track === "weight" ? " rec-fields--w" : "";
  return `<li class="rec-row${on ? "" : " is-off"}" data-k="${k}">` +
    `<div class="rec-row-head"><button type="button" class="rec-check" aria-pressed="${on}" aria-label="${nm}を記録に含める">${uiIcon("check")}</button>` +
    `<span class="rec-name">${nm}</span>${r.optional ? `<span class="tag">任意</span>` : ""}</div>` +
    `<div class="rec-fields${cols}">${fields}</div></li>`;
}

function entryFromRow(rowEl, r) {
  const val = (cls) => {
    const s = rowEl.querySelector(cls);
    return s && s.value !== "" ? Number(s.value) : null;
  };
  if (r.track === "time") return { name: r.name, track: "time", seconds: val(".f-sec"), sets: val(".f-sets") };
  if (r.track === "cardio") {
    const distance = val(".f-dist");
    return { name: r.name, track: "cardio", minutes: val(".f-min"), distance, unit: distance != null ? r.unit : null };
  }
  return { name: r.name, track: "weight", weight: val(".f-weight") ?? 0, sets: val(".f-sets"), reps: val(".f-reps") };
}

function openRecordSheet(d, triggerKey) {
  const rec = ctx.getPlan();
  const day = rec?.plan.days[d];
  if (!day) return;
  const rows = recordRows(day, ctx.storage.loadLogs());
  const today = localDateStr();
  const dates = [0, 1, 2].map((n) => addDays(today, -n));
  const dateLabels = ["今日", "昨日", "2日前"];
  let date = today;
  let warned = false;
  let warnedAt = 0;

  const sheetBody = document.createElement("div");
  sheetBody.className = "rec";
  sheetBody.innerHTML =
    `<fieldset class="field-group rec-date"><legend class="field-legend">日付</legend><div class="seg seg-3">` +
    dates.map((dt, n) => `<label class="seg-opt"><input type="radio" name="rec-date" value="${dt}"${n === 0 ? " checked" : ""}>` +
      `<span class="seg-main">${dateLabels[n]}</span><span class="seg-sub">${escapeHtml(formatJaDate(dt))}</span></label>`).join("") +
    `</div></fieldset>` +
    `<p class="rec-help">やらなかった種目はチェックを外してください。重さや回数はタップで変更できます。</p>` +
    `<ol class="rec-list">${rows.map((r, k) => recRowHtml(r, k)).join("")}</ol>`;
  const foot = document.createElement("div");
  foot.className = "rec-foot";
  foot.innerHTML = `<p class="rec-warn" role="alert" hidden></p>` +
    `<button type="button" class="btn btn-primary btn-lg btn-block rec-save"></button>`;
  const saveBtn = foot.querySelector(".rec-save");
  const warnEl = foot.querySelector(".rec-warn");

  const included = () => [...sheetBody.querySelectorAll(".rec-row")]
    .filter((row) => row.querySelector(".rec-check").getAttribute("aria-pressed") === "true");
  const paint = () => {
    const n = included().length;
    saveBtn.textContent = `${warned ? "このまま記録する" : "記録する"}(${n}種目)`;
    saveBtn.disabled = n === 0;
  };
  const clearWarn = () => {
    warned = false;
    warnEl.hidden = true;
  };
  for (const row of sheetBody.querySelectorAll(".rec-row.is-off")) {
    for (const s of row.querySelectorAll("select")) s.disabled = true;
  }

  sheetBody.addEventListener("click", (e) => {
    const chk = e.target.closest(".rec-check");
    if (!chk) return;
    const on = chk.getAttribute("aria-pressed") !== "true";
    chk.setAttribute("aria-pressed", String(on));
    const row = chk.closest(".rec-row");
    row.classList.toggle("is-off", !on);
    for (const s of row.querySelectorAll("select")) s.disabled = !on;
    clearWarn();
    paint();
  });
  sheetBody.addEventListener("change", (e) => {
    if (e.target.name === "rec-date") date = e.target.value;
    if (e.target.matches(".f-weight")) e.target.classList.toggle("is-unset", e.target.value === "");
    clearWarn();
    paint();
  });
  saveBtn.addEventListener("click", () => {
    const chosen = included();
    const unset = chosen.filter((row) => row.querySelector(".f-weight")?.value === "").length;
    if (unset > 0 && !warned) {
      warned = true;
      warnedAt = Date.now();
      warnEl.textContent = `重量を選んでいない種目が${unset}つあります。このまま記録すると重量なし(0kg)で保存され、重量のグラフや次回の目標の重さには使われません。`;
      warnEl.hidden = false;
      paint();
      return;
    }
    // 確認を出した直後の2回目のタップ(ダブルタップ)では保存しない
    if (warned && Date.now() - warnedAt < CONFIRM_GUARD_MS) return;
    const entries = chosen.map((row) => entryFromRow(row, rows[Number(row.dataset.k)]));
    const res = ctx.saveLog({ date, entries, planDay: { index: d, title: day.title } });
    if (res.ok) sheet.close();
  });
  paint();

  const sheet = ctx.openSheet({
    title: `${dayNum(d)} ${dayName(day)} を記録`,
    body: sheetBody,
    footer: foot,
    // 記録後は画面が描き直されるので、同じ役割のボタンへフォーカスを戻す
    // 記録して「今日は完了」に変わり元のボタンが無くなったときは、今日のカードの見出しへ
    onClose: () => {
      if (!triggerKey) return;
      requestAnimationFrame(() => {
        const target = body.querySelector(`[data-key="${triggerKey}"]`) ?? body.querySelector("#today-title");
        target?.focus({ preventScroll: true });
      });
    },
  });
}

// ---------- ビューの約束(js/app.js 参照) ----------

export function mount(section, c) {
  ctx = c;
  body = section.querySelector(".view-body");
  body.addEventListener("click", onClick);
  body.addEventListener("keydown", onKeydown);
  body.addEventListener("toggle", onToggle, true);
  render();
}

export function update(reason) {
  if (reason === "plan" || reason === "import") {
    selected = null;
    followNext = true;
    openTips.clear();
    openPrep.clear();
  }
  rerender();
}
