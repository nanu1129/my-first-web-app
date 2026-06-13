// トレーニング記録の集計・可視化のための純粋関数群。
// ブラウザ・Node どちらでも動作する。
import { estimate1RM } from "./planner.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (s) => new Date(`${s}T00:00:00`);
const iso = (d) => d.toISOString().slice(0, 10);

// 月曜始まりの週キー(その週の月曜の YYYY-MM-DD)
function weekKey(dateStr) {
  const d = toDate(dateStr);
  const dow = (d.getDay() + 6) % 7; // 月=0
  d.setDate(d.getDate() - dow);
  return iso(d);
}

// 全体サマリー: 総回数・連続週・今週の回数・最終日
export function summarize(logs, now = new Date()) {
  if (!logs || logs.length === 0) {
    return { total: 0, weekStreak: 0, thisWeek: 0, lastDate: null };
  }
  const dates = [...new Set(logs.map((l) => l.date))].sort();
  const total = logs.length;
  const lastDate = dates[dates.length - 1];

  // 週ごとにトレーニングの有無を集計し、今週(または先週)から連続している週数を数える
  const weeks = new Set(dates.map(weekKey));
  const thisMonday = toDate(weekKey(iso(now)));
  let streak = 0;
  // 今週に記録が無くてもまだ「継続中」とみなすため、先週からさかのぼる起点を決める
  let cursor = new Date(thisMonday);
  if (!weeks.has(iso(cursor))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(iso(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }

  const thisWeekKey = weekKey(iso(now));
  const thisWeek = logs.filter((l) => weekKey(l.date) === thisWeekKey).length;
  return { total, weekStreak: streak, thisWeek, lastDate };
}

// 実績バッジ。achieved=達成済みか
export function badges(logs) {
  const total = logs?.length ?? 0;
  const { weekStreak } = summarize(logs ?? []);
  const defs = [
    { id: "first", icon: "🌱", label: "はじめの一歩", need: "初トレを記録", ok: total >= 1 },
    { id: "ten", icon: "🔥", label: "10回達成", need: "10回トレ", ok: total >= 10 },
    { id: "fifty", icon: "💪", label: "50回達成", need: "50回トレ", ok: total >= 50 },
    { id: "hundred", icon: "🏆", label: "100回達成", need: "100回トレ", ok: total >= 100 },
    { id: "streak4", icon: "📅", label: "4週連続", need: "4週連続でトレ", ok: weekStreak >= 4 },
    { id: "streak12", icon: "👑", label: "3ヶ月継続", need: "12週連続でトレ", ok: weekStreak >= 12 },
  ];
  return defs;
}

// 直近 weeks 週分のカレンダー(週×7日のグリッド)。各セルにトレーニング数。
export function calendar(logs, weeks = 8, now = new Date()) {
  const countByDate = new Map();
  for (const l of logs ?? []) countByDate.set(l.date, (countByDate.get(l.date) ?? 0) + 1);

  const today = toDate(iso(now));
  const dow = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(thisMonday.getDate() - dow);

  const grid = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(thisMonday);
      cell.setDate(cell.getDate() - w * 7 + d);
      const key = iso(cell);
      row.push({
        date: key,
        count: countByDate.get(key) ?? 0,
        future: cell.getTime() > today.getTime(),
        today: key === iso(today),
      });
    }
    grid.push(row);
  }
  return grid;
}

// 記録に登場する種目名(筋トレ=重量あり)の一覧。グラフ対象の選択肢用。
export function trackedWeightExercises(logs) {
  const names = new Set();
  for (const l of logs ?? []) {
    for (const e of l.entries) {
      if ((e.track ?? "weight") === "weight" && parseFloat(e.weight) > 0) names.add(e.name);
    }
  }
  return [...names];
}

// 指定種目の推移(日付ごとの最大重量・推定1RM)。古い順。
export function exerciseSeries(logs, name) {
  const byDate = new Map();
  for (const l of logs ?? []) {
    for (const e of l.entries) {
      if (e.name !== name) continue;
      const w = parseFloat(e.weight);
      if (!(w > 0)) continue;
      const orm = estimate1RM(e.weight, e.reps) ?? w;
      const cur = byDate.get(l.date);
      if (!cur || w > cur.weight) byDate.set(l.date, { date: l.date, weight: w, orm });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 体重ログの推移(古い順)。logs: [{date, weight}]
export function bodyweightSeries(bwLogs) {
  return [...(bwLogs ?? [])]
    .map((b) => ({ date: b.date, value: parseFloat(b.weight) }))
    .filter((b) => b.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
