// 進捗画面: まとめの数字・カレンダー・種目ごとの推移グラフ・自己ベスト・体重・バッジ・種目名の整理。
// - まとめは 合計日数 / 今週 / 継続週数(最長) / 前回からの日数 の4つのタイル(I13)
// - カレンダーは表(曜日の列見出し付き)。各日に日付の読み上げ名があり、記録のある日はボタンで内容を表示する(B33)
// - 推移グラフは最近記録した種目を初期表示し(I44)、種目の種類に合わせて 最大重量/推定1RM/回数/秒/時間/距離 を切り替える(I15)。
//   グラフはコンテナの実際の幅で描き(文字が実寸になる。I14)、読み上げ用の要約と自己ベストの印が付く(B26 B35 I05)
// - 体重は記録が無い人にも常に表示し、前回の値(無ければプロフィールの体重)から ±0.1kg で選べる(B28)
// - バッジは獲得状態と条件・進み具合を文字で表示する(色だけに頼らない。B34)
import {
  summarize, badges, calendar, trackedExercises, metricSeries, metricUnit, METRIC_LABELS, personalBests,
  bodyweightSeries, monthlySummary, unknownExerciseNames,
} from "../stats.js?v=14";
import { lineChartSVG } from "../charts.js?v=14";
import { exercisesByMuscle } from "../planner.js?v=14";
import {
  escapeHtml, formatJaDate, formatShortDate, localDateStr, addDays, daysBetween, numRange, formatNum, roundTo, clamp,
} from "../util.js?v=14";
import { uiIcon } from "../icons.js?v=14";

const WEEKS = 8;
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const KIND_GROUPS = [
  ["weight", "筋トレ(重量)"],
  ["reps", "自重(回数)"],
  ["time", "体幹・キープ(秒)"],
  ["cardio", "有酸素"],
];
const BADGE_ICON = {
  first: "sprout", ten: "flame", fifty: "dumbbell", hundred: "trophy",
  streak4: "calendar", streak12: "crown", pr1: "medal", pr10: "star",
};
const BESTS_SHOWN = 5;
const BW_HISTORY = 10;
const BW_SPAN = 15;      // 体重の選択肢は基準値 ±15kg(0.1kg 刻み)
const RECENT_DAYS = 7;   // 自己ベストの「最近更新」

let ctx = null;
let body = null;
let chartName = null;                      // グラフに表示中の種目
const metricOf = {};                       // 種目の種類ごとに選んだ指標
let calSelected = null;                    // カレンダーで選んだ日
let bestsOpen = false;
let bwChoice = "today";
let bwValue = null;
let observer = null;
const chartData = {};                      // data-chart → { points, opts }

// ---------- 小さなヘルパー ----------

const fmt = (v, d = 1) => formatNum(v, d);

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

// "9月28日(月)"
function longDate(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日${formatJaDate(date).replace(/^[^(]*/, "")}`;
}

const sectionHead = (id, title, meta = "") =>
  `<div class="section-head"><h2 id="${id}" class="section-title">${title}</h2>` +
  (meta ? `<span class="section-meta">${meta}</span>` : "") + `</div>`;

// ---------- まとめ(I13) ----------

function summaryHtml(s) {
  const tile = (label, value, unit, sub, cls = "") =>
    `<div class="stat${cls}"><dt class="stat-label">${label}</dt>` +
    `<dd class="stat-value">${value}${unit ? `<span class="stat-unit">${unit}</span>` : ""}</dd>` +
    (sub ? `<dd class="stat-sub">${sub}</dd>` : "") + `</div>`;
  const n = (v) => `<span class="num">${v}</span>`;
  const since = s.daysSinceLast === 0
    ? tile("前回から", `<span class="num-ja">今日</span>`, "", "記録済み")
    : tile("前回から", n(s.daysSinceLast), "日", escapeHtml(formatJaDate(s.lastDate)));
  return `<section id="pg-summary" class="pg-wide" aria-labelledby="summary-title">` +
    `<h2 id="summary-title" class="sr-only">まとめ</h2><dl class="stats stats--4">` +
    tile("合計", n(s.total), "日", s.logCount > s.total ? `記録 ${s.logCount}回` : "トレーニング日数") +
    tile("今週", n(s.thisWeek), "日", "月曜から") +
    tile("継続", n(s.weekStreak), "週", `最長 ${s.bestStreak}週`) +
    since + `</dl></section>`;
}

// ---------- カレンダー(B33) ----------

function calendarHtml(logs) {
  const grid = calendar(logs, WEEKS);
  const today = localDateStr();
  const month = today.slice(0, 7);
  const monthDays = new Set(logs.filter((l) => l.date.slice(0, 7) === month).map((l) => l.date)).size;
  const rows = grid.map((week, w) => `<tr>${week.map((c, d) => {
    const first = (w === 0 && d === 0) || c.day === 1;
    const text = first ? `${Number(c.date.slice(5, 7))}/${c.day}` : String(c.day);
    const cls = `cal-cell${c.count > 0 ? " is-done" : ""}${c.count > 1 ? " is-multi" : ""}${c.today ? " is-today" : ""}${first ? " is-month" : ""}`;
    const label = `${longDate(c.date)} ${c.count > 0 ? `記録${c.count}件` : "記録なし"}${c.today ? "(今日)" : ""}`;
    const current = c.today ? ` aria-current="date"` : "";
    if (c.future) return `<td><span class="cal-cell is-future" aria-hidden="true"></span></td>`;
    if (c.count > 0) {
      return `<td><button type="button" class="${cls}" data-act="cal-day" data-date="${c.date}" data-key="cal-${c.date}"` +
        ` aria-pressed="${calSelected === c.date}" aria-label="${label}"${current}><span class="cal-num">${text}</span></button></td>`;
    }
    return `<td><span class="${cls}"${current}><span class="cal-num" aria-hidden="true">${text}</span>` +
      `<span class="sr-only">${label}</span></span></td>`;
  }).join("")}</tr>`).join("");
  return `<section id="pg-cal" class="card cal-card" aria-labelledby="cal-title">` +
    sectionHead("cal-title", "カレンダー", `今月 ${monthDays}日`) +
    `<table class="cal"><caption class="sr-only">直近${WEEKS}週間のトレーニング(月曜始まり)。記録のある日を押すと内容を表示します</caption>` +
    `<thead><tr>${WEEKDAYS.map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` +
    `<ul class="cal-legend" aria-hidden="true"><li><i class="lg lg-rest"></i>記録なし</li><li><i class="lg lg-done"></i>記録あり</li>` +
    `<li><i class="lg lg-multi"></i>2回以上</li><li><i class="lg lg-today"></i>今日</li></ul>` +
    `<div class="cal-detail" aria-live="polite">${calDetailHtml(logs)}</div></section>`;
}

function calDetailHtml(logs) {
  if (!calSelected) return `<p class="cal-hint">記録のある日を押すと、その日の内容が表示されます。</p>`;
  const day = logs.filter((l) => l.date === calSelected);
  if (!day.length) return "";
  const items = day.map((l) => {
    const names = l.entries.map((e) => e.name);
    const title = l.planDay?.title ? String(l.planDay.title).replace(/^Day\s*\d+\s*[::]\s*/, "") : `${names.length}種目`;
    return `<li class="cal-log"><div class="cal-log-main"><p class="cal-log-title">${escapeHtml(title)}</p>` +
      `<p class="cal-log-names">${escapeHtml(names.join("・"))}</p></div>` +
      `<button type="button" class="btn btn-secondary btn-sm" data-act="open-log" data-id="${escapeHtml(l.id)}" data-key="open-${escapeHtml(l.id)}"` +
      ` aria-label="${escapeHtml(formatJaDate(l.date))}の記録を記録画面で開く">記録を開く${uiIcon("chevronRight")}</button></li>`;
  }).join("");
  return `<div class="cal-detail-card"><p class="cal-detail-date">${escapeHtml(formatJaDate(calSelected))}</p><ul class="cal-logs">${items}</ul></div>`;
}

// ---------- 種目の推移グラフ(I15 I44 B26 B35) ----------

function chartHtml(logs) {
  const tracked = trackedExercises(logs);
  const head = sectionHead("chart-title", "種目の推移", tracked.length ? `${tracked.length}種目` : "");
  if (!tracked.length) {
    chartData.ex = null;
    return `<section id="pg-chart" class="card chart-card" aria-labelledby="chart-title">${head}` +
      `<p class="chart-empty">重さ・回数・秒・距離を記録すると、種目ごとの推移がグラフで表示されます。</p></section>`;
  }
  const t = tracked.find((x) => x.name === chartName) ?? tracked[0];
  chartName = t.name;
  const metric = t.metrics.includes(metricOf[t.kind]) ? metricOf[t.kind] : t.metrics[0];
  const options = KIND_GROUPS.map(([kind, label]) => {
    const names = tracked.filter((x) => x.kind === kind);
    if (!names.length) return "";
    return `<optgroup label="${label}">${names.map((x) =>
      `<option value="${escapeHtml(x.name)}"${x.name === t.name ? " selected" : ""}>${escapeHtml(x.name)}</option>`).join("")}</optgroup>`;
  }).join("");
  const metrics = t.metrics.length > 1
    ? `<div class="seg chart-metric" style="--n:${t.metrics.length}" role="radiogroup" aria-label="グラフの指標">` +
      t.metrics.map((m) => `<label class="seg-opt"><input type="radio" name="chart-metric" value="${m}" data-key="metric-${m}"${m === metric ? " checked" : ""}>` +
        `<span class="seg-main">${METRIC_LABELS[m]}</span></label>`).join("") + `</div>`
    : "";
  const points = metricSeries(logs, t.name, metric);
  const unit = metricUnit(t.name, metric);
  const label = METRIC_LABELS[metric];
  chartData.ex = {
    points,
    opts: { unit, title: `${t.name}の${label}`, minSpan: unit === "kg" ? 2 : null, emptyText: "この指標の記録はまだありません" },
  };
  const values = points.map((p) => p.value);
  const last = points[points.length - 1];
  const prs = points.filter((p) => p.pr).length;
  const stats = points.length
    ? `<dl class="chart-stats">` +
      `<div><dt>最新</dt><dd><b class="num">${escapeHtml(fmt(last.value, 2))}</b>${escapeHtml(unit)}<small>${escapeHtml(formatShortDate(last.date))}</small></dd></div>` +
      `<div><dt>最高</dt><dd><b class="num">${escapeHtml(fmt(Math.max(...values), 2))}</b>${escapeHtml(unit)}</dd></div>` +
      `<div><dt>記録</dt><dd><b class="num">${points.length}</b>日</dd></div></dl>`
    : "";
  const notes = [
    points.length === 1 ? "2日以上記録すると、推移が線で表示されます。" : "",
    prs ? `<span class="pr-dot" aria-hidden="true"></span>自己ベストを更新した日` : "",
    metric === "orm" ? "推定1RM は 12回以下のセットから計算しています。" : "",
  ].filter(Boolean);
  const month = t.kind === "cardio" ? monthlySummary(logs, t.name) : null;
  const monthCard = month
    ? `<p class="chart-month">${uiIcon(t.distanceUnit === "m" ? "wave" : "pulse")}<span>${month.month}月の${escapeHtml(t.name)}: ` +
      [month.distance != null ? `${escapeHtml(fmt(month.distance, 2))}${escapeHtml(month.unit)}` : "", month.minutes ? `${escapeHtml(fmt(month.minutes))}分` : "", `${month.sessions}回`]
        .filter(Boolean).join("・") + `</span></p>`
    : "";
  return `<section id="pg-chart" class="card chart-card" aria-labelledby="chart-title">${head}` +
    `<label class="field chart-field"><span class="field-label">種目</span><select class="chart-ex" data-key="chart-ex" aria-label="グラフに表示する種目">${options}</select></label>` +
    metrics + stats +
    `<div class="chart-box" data-chart="ex"></div>` +
    (notes.length ? `<p class="chart-note">${notes.join("<br>")}</p>` : "") + monthCard + `</section>`;
}

function drawChart(box) {
  const data = chartData[box.dataset.chart];
  if (!data) return;
  const w = Math.floor(box.clientWidth);
  if (w <= 0 || Math.abs(w - Number(box.dataset.w ?? 0)) < 8) return;
  box.dataset.w = String(w);
  box.innerHTML = lineChartSVG(data.points, { ...data.opts, width: w });
}

// グラフは表示されている幅で描く(非表示の間は幅 0 なので、表示されたときに描く)
function observeCharts() {
  if (!observer && typeof ResizeObserver === "function") {
    observer = new ResizeObserver((entries) => { for (const en of entries) drawChart(en.target); });
  }
  observer?.disconnect();
  for (const box of body.querySelectorAll("[data-chart]")) {
    drawChart(box);
    observer?.observe(box);
  }
}

// ---------- 種目名の整理(I44) ----------

function namesHtml(logs) {
  const keep = new Set(ctx.storage.getMeta().keepNames ?? []);
  const list = unknownExerciseNames(logs).filter((u) => u.suggestion && !keep.has(u.name));
  if (!list.length) return "";
  const groups = exercisesByMuscle();
  const rows = list.map((u, i) => {
    const opts = groups.map((g) => `<optgroup label="${escapeHtml(g.label)}">${g.names.map((n) =>
      `<option value="${escapeHtml(n)}"${n === u.suggestion ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</optgroup>`).join("");
    const nm = escapeHtml(u.name);
    return `<li class="alias-row"><p class="alias-from"><span class="alias-name">「${nm}」</span><span class="alias-count">${u.count}件</span></p>` +
      `<label class="field"><span class="field-label">まとめる先</span><select class="alias-to" data-from="${nm}" data-key="alias-${i}" aria-label="「${nm}」をまとめる先の種目">${opts}</select></label>` +
      `<div class="alias-actions"><button type="button" class="btn btn-primary btn-sm" data-act="merge" data-from="${nm}" data-key="merge-${i}">まとめる</button>` +
      `<button type="button" class="btn btn-ghost btn-sm" data-act="keep-name" data-from="${nm}" data-key="keep-${i}">このまま</button></div></li>`;
  }).join("");
  return `<section id="pg-names" class="card names-card" aria-labelledby="names-title">` +
    sectionHead("names-title", "種目名の整理", `${list.length}件`) +
    `<p class="card-note names-lead">入力した名前を一覧の種目名にまとめると、グラフ・自己ベスト・メニューの前回値がつながります。元の名前も記録に残ります。</p>` +
    `<ul class="alias-list">${rows}</ul></section>`;
}

// ---------- 自己ベスト(I05) ----------

function bestsHtml(logs) {
  const list = personalBests(logs);
  if (!list.length) return "";
  const today = localDateStr();
  const shown = bestsOpen ? list : list.slice(0, BESTS_SHOWN);
  const rows = shown.map((b) => {
    const nm = escapeHtml(b.name);
    const others = Object.values(b.bests).filter((x) => x.kind !== b.best.kind)
      .map((x) => `${x.label} ${fmt(x.value, 2)}${x.unit}`);
    const recent = daysBetween(b.updated, today) <= RECENT_DAYS;
    return `<li><button type="button" class="pb-row" data-act="chart" data-name="${nm}" data-key="pb-${nm}" aria-label="${nm}の推移をグラフで見る">` +
      `<span class="pb-ico">${uiIcon("trophy")}</span>` +
      `<span class="pb-main"><span class="pb-name">${nm}${recent ? `<span class="tag tag--pr">最近更新</span>` : ""}</span>` +
      `<span class="pb-sub">${escapeHtml([...others, `${formatShortDate(b.best.date)} 達成`].join(" · "))}</span></span>` +
      `<span class="pb-val"><span class="pb-kind">${escapeHtml(b.best.label)}</span><span><b class="num">${escapeHtml(fmt(b.best.value, 2))}</b>${escapeHtml(b.best.unit)}</span></span>` +
      `</button></li>`;
  }).join("");
  const more = list.length > BESTS_SHOWN
    ? `<button type="button" class="btn btn-ghost btn-block" data-act="bests-toggle" data-key="bests-toggle" aria-expanded="${bestsOpen}">` +
      `${bestsOpen ? "少なく表示" : `すべて表示(${list.length}種目)`}</button>`
    : "";
  return `<section id="pg-best" class="card bests-card" aria-labelledby="best-title">` +
    sectionHead("best-title", "自己ベスト", `${list.length}種目`) +
    `<ol class="pb-list">${rows}</ol>${more}</section>`;
}

// ---------- 体重(B28) ----------

function bwCenter(series) {
  if (bwValue != null) return bwValue;
  const last = series[series.length - 1];
  return last?.value ?? ctx.storage.loadProfile()?.weight ?? 65;
}

function bwOptionsHtml(value) {
  const base = Math.round(value);
  const list = numRange(clamp(base - BW_SPAN, 20, 280), clamp(base + BW_SPAN, 40, 300), 0.1);
  const values = list.some((v) => Math.abs(v - value) < 1e-9) ? list : [...list, value].sort((a, b) => a - b);
  return values.map((v) => `<option value="${v}"${Math.abs(v - value) < 1e-9 ? " selected" : ""}>${v.toFixed(1)}</option>`).join("");
}

function bwHtml(bw) {
  const series = bodyweightSeries(bw);
  const value = roundTo(bwCenter(series), 1);
  bwValue = value;
  const last = series[series.length - 1];
  const today = localDateStr();
  const opt = (v, main, date) =>
    `<label class="seg-opt"><input type="radio" name="bw-date" value="${v}" data-key="bw-${v}"${bwChoice === v ? " checked" : ""}>` +
    `<span class="seg-main">${main}</span><span class="seg-sub">${escapeHtml(formatJaDate(date))}</span></label>`;
  chartData.bw = series.length
    ? { points: series, opts: { unit: "kg", title: "体重", minSpan: 2, color: "var(--ai)", decimals: 1 } }
    : null;
  let trend = "";
  if (series.length >= 2) {
    const first = series[0];
    const diff = roundTo(last.value - first.value, 1);
    trend = `<p class="bw-trend">${escapeHtml(formatShortDate(first.date))}から <b>${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${escapeHtml(fmt(Math.abs(diff)))}kg</b>(${series.length}回の記録)</p>`;
  }
  const recent = [...series].reverse().slice(0, BW_HISTORY);
  const history = recent.length
    ? `<details class="fold bw-history"><summary>${uiIcon("clipboard", "fold-ico")}<span class="fold-label">体重の記録</span>` +
      `<span class="fold-count">${series.length}</span>${uiIcon("chevronDown", "fold-chev")}</summary>` +
      `<ul class="bw-list">${recent.map((p) =>
        `<li><span class="bw-list-date">${escapeHtml(formatJaDate(p.date))}</span><span class="bw-list-val"><b class="num">${escapeHtml(p.value.toFixed(1))}</b>kg</span>` +
        `<button type="button" class="icon-btn" data-act="bw-delete" data-date="${p.date}" data-key="bwdel-${p.date}" aria-label="${escapeHtml(formatJaDate(p.date))}の体重を削除">${uiIcon("trash")}</button></li>`).join("")}</ul>` +
      (series.length > BW_HISTORY ? `<p class="card-note">新しい${BW_HISTORY}件を表示しています。</p>` : "") + `</details>`
    : "";
  return `<section id="pg-bw" class="card bw-card" aria-labelledby="bw-title">` +
    sectionHead("bw-title", "体重", last ? `前回 ${escapeHtml(last.value.toFixed(1))}kg(${escapeHtml(formatShortDate(last.date))})` : "まだ記録がありません") +
    `<div class="bw-form">` +
    `<div class="bw-stepper" role="group" aria-label="体重(kg)">` +
    `<button type="button" class="step-btn" data-act="bw-step" data-step="-1" data-key="bw-minus" aria-label="0.1kg 減らす">${uiIcon("minus")}</button>` +
    `<label class="bw-value"><select class="bw-select" data-key="bw-select" aria-label="体重(kg)">${bwOptionsHtml(value)}</select><span class="bw-unit" aria-hidden="true">kg</span></label>` +
    `<button type="button" class="step-btn" data-act="bw-step" data-step="1" data-key="bw-plus" aria-label="0.1kg 増やす">${uiIcon("plus")}</button></div>` +
    `<div class="bw-row"><div class="seg seg-2 bw-date" role="radiogroup" aria-label="日付">${opt("today", "今日", today)}${opt("yesterday", "昨日", addDays(today, -1))}</div>` +
    `<button type="button" class="btn btn-primary bw-save" data-act="bw-save" data-key="bw-save">${uiIcon("check")}記録</button></div></div>` +
    (series.length ? `<div class="chart-box chart-box--bw" data-chart="bw"></div>${trend}` : `<p class="card-note">毎日同じ時間(起床後など)に測ると、変化が分かりやすくなります。</p>`) +
    history + `</section>`;
}

function setBwValue(v) {
  bwValue = roundTo(clamp(v, 20, 300), 1);
  const sel = body.querySelector(".bw-select");
  if (!sel) return;
  // 選択肢の範囲を出たら、新しい値を中心に作り直す
  if ([...sel.options].some((o) => Math.abs(Number(o.value) - bwValue) < 1e-9)) sel.value = String(bwValue);
  else sel.innerHTML = bwOptionsHtml(bwValue);
}

function saveBodyweight() {
  const today = localDateStr();
  const date = bwChoice === "yesterday" ? addDays(today, -1) : today;
  const value = bwValue;
  const before = ctx.storage.loadBodyweight();
  const replaced = before.find((b) => b.date === date);
  const next = [...before.filter((b) => b.date !== date), { date, weight: value }];
  if (!ctx.storage.saveBodyweight(next)) return;
  renderSection("bw", { focus: "bw-save" });
  ctx.toast(`${formatJaDate(date)} ${value.toFixed(1)}kg を記録しました${replaced ? `(${replaced.weight.toFixed(1)}kg から変更)` : ""}`, {
    tone: "ok",
    action: "元に戻す",
    onAction: () => {
      if (ctx.storage.saveBodyweight(before)) {
        renderSection("bw");
        ctx.toast("体重の記録を取り消しました", { tone: "info" });
      }
    },
  });
}

function deleteBodyweight(date) {
  const before = ctx.storage.loadBodyweight();
  const target = before.find((b) => b.date === date);
  if (!target || !ctx.storage.saveBodyweight(before.filter((b) => b.date !== date))) return;
  renderSection("bw", { focus: "bw-save" });
  ctx.toast(`${formatJaDate(date)}の体重(${target.weight.toFixed(1)}kg)を削除しました`, {
    tone: "info",
    action: "元に戻す",
    onAction: () => {
      if (ctx.storage.saveBodyweight(before)) renderSection("bw");
    },
  });
}

// ---------- バッジ(B34) ----------

function badgesHtml(logs) {
  const list = badges(logs);
  const got = list.filter((b) => b.ok).length;
  const items = list.map((b) => {
    const [cur, goal] = String(b.progress ?? "0/1").split("/").map(Number);
    const pct = goal > 0 ? Math.round((Math.min(cur, goal) / goal) * 100) : 0;
    return `<li class="badge-item ${b.ok ? "is-got" : "is-locked"}">` +
      `<span class="badge-ico">${uiIcon(BADGE_ICON[b.id] ?? "medal")}</span>` +
      `<div class="badge-body"><p class="badge-name">${escapeHtml(b.label)}</p><p class="badge-need">${escapeHtml(b.need)}</p>` +
      `<div class="badge-meter" aria-hidden="true"><span style="width:${pct}%"></span></div></div>` +
      `<p class="badge-state">${b.ok ? `${uiIcon("check")}獲得` : escapeHtml(b.progress ?? "")}` +
      `<span class="sr-only">${b.ok ? "(獲得済み)" : "(未獲得)"}</span></p></li>`;
  }).join("");
  return `<section id="pg-badges" class="card badges-card pg-wide" aria-labelledby="badges-title">` +
    sectionHead("badges-title", "バッジ", `${got}/${list.length} 獲得`) +
    `<ul class="badge-grid" role="list">${items}</ul></section>`;
}

// ---------- 全体の描画 ----------

function emptyHtml() {
  return `<div class="empty-state pg-wide">` +
    `<span class="empty-ico">${uiIcon("chart")}</span>` +
    `<h2 class="empty-title">記録すると、ここに進捗が表示されます</h2>` +
    `<p class="empty-text">カレンダー・種目ごとのグラフ・自己ベスト・バッジで、続けた成果をひと目で確認できます。体重は今日から記録できます。</p>` +
    `<button type="button" class="btn btn-primary" data-act="goto-log" data-key="goto-log">トレーニングを記録する</button></div>`;
}

const SECTIONS = {
  summary: (logs) => summaryHtml(summarize(logs)),
  cal: calendarHtml,
  chart: chartHtml,
  names: namesHtml,
  best: bestsHtml,
  bw: () => bwHtml(ctx.storage.loadBodyweight()),
  badges: badgesHtml,
};

function render() {
  const key = activeKey();
  const logs = ctx.storage.loadLogs();
  const order = logs.length ? ["summary", "cal", "chart", "names", "best", "bw", "badges"] : ["bw", "badges"];
  body.innerHTML = `<div class="progress-grid">${logs.length ? "" : emptyHtml()}${order.map((k) => SECTIONS[k](logs)).join("")}</div>`;
  observeCharts();
  focusKey(key);
}

// 1つの節だけ描き直す(操作中の他の節はそのまま)
function renderSection(name, { focus = null } = {}) {
  const el = body.querySelector(`#pg-${name}`);
  if (!el) {
    render();
    return;
  }
  const key = focus ?? activeKey();
  el.outerHTML = SECTIONS[name](ctx.storage.loadLogs());
  observeCharts();
  focusKey(key);
}

// ---------- 操作 ----------

function selectCalendarDay(btn) {
  const date = btn.dataset.date;
  calSelected = calSelected === date ? null : date;
  for (const b of body.querySelectorAll(".cal-cell[data-date]")) b.setAttribute("aria-pressed", String(b.dataset.date === calSelected));
  body.querySelector("#pg-cal .cal-detail").innerHTML = calDetailHtml(ctx.storage.loadLogs());
}

function mergeName(from) {
  const to = [...body.querySelectorAll(".alias-to")].find((s) => s.dataset.from === from)?.value;
  if (!to) return;
  const res = ctx.storage.renameExercise(from, to);
  if (!res.ok) return;
  if (chartName === from) chartName = to;
  ctx.refresh("logs");
  ctx.toast(`「${from}」を「${to}」にまとめました(${res.count}件)`, {
    tone: "ok",
    action: "元に戻す",
    onAction: () => {
      if (res.undo()) {
        ctx.refresh("logs");
        ctx.toast("名前を元に戻しました", { tone: "info" });
      }
    },
  });
  if (!focusKey("merge-0")) focusKey("chart-ex");
}

function keepName(from) {
  const keep = new Set(ctx.storage.getMeta().keepNames ?? []);
  keep.add(from);
  ctx.storage.setMeta({ keepNames: [...keep] });
  renderSection("names");
  ctx.announce(`「${from}」はこのままにします`);
}

function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || !body.contains(btn)) return;
  switch (btn.dataset.act) {
    case "cal-day": selectCalendarDay(btn); break;
    case "open-log": ctx.navigate("log", { focus: false, detail: { logId: btn.dataset.id } }); break;
    case "chart":
      chartName = btn.dataset.name;
      renderSection("chart");
      body.querySelector("#pg-chart")?.scrollIntoView({ behavior: ctx.motion() ? "smooth" : "auto", block: "start" });
      focusKey("chart-ex");
      break;
    case "bests-toggle":
      bestsOpen = !bestsOpen;
      renderSection("best", { focus: "bests-toggle" });
      break;
    case "bw-step": setBwValue(bwValue + Number(btn.dataset.step) * 0.1); break;
    case "bw-save": saveBodyweight(); break;
    case "bw-delete": deleteBodyweight(btn.dataset.date); break;
    case "merge": mergeName(btn.dataset.from); break;
    case "keep-name": keepName(btn.dataset.from); break;
    case "goto-log": ctx.navigate("log"); break;
    default: break;
  }
}

function onChange(e) {
  const t = e.target;
  if (t.matches(".chart-ex")) {
    chartName = t.value;
    renderSection("chart", { focus: "chart-ex" });
  } else if (t.name === "chart-metric") {
    const kind = trackedExercises(ctx.storage.loadLogs()).find((x) => x.name === chartName)?.kind;
    if (kind) metricOf[kind] = t.value;
    renderSection("chart", { focus: `metric-${t.value}` });
  } else if (t.matches(".bw-select")) {
    bwValue = Number(t.value);
  } else if (t.name === "bw-date") {
    bwChoice = t.value;
  }
}

// ---------- ビューの約束(js/app.js 参照) ----------

export function mount(section, c) {
  ctx = c;
  body = section.querySelector(".view-body");
  body.addEventListener("click", onClick);
  body.addEventListener("change", onChange);
  render();
}

export function update(reason) {
  if (reason === "import") {
    chartName = null;
    calSelected = null;
    bwValue = null;
  }
  if (reason === "profile" && ctx.storage.loadBodyweight().length === 0) bwValue = null;
  if (reason === "day") bwChoice = "today";
  if (reason !== "plan") render();
}

export function show() {
  for (const box of body.querySelectorAll("[data-chart]")) drawChart(box);
}
