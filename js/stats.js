// トレーニング記録の集計・可視化のための純粋関数群(DOM・localStorage に触れない)。
// ブラウザ・Node どちらでも動作する。日付はすべて端末ローカルの "YYYY-MM-DD" で扱い、週は月曜始まり。
// 入力は storage.loadLogs() の正規化済み記録を想定するが、古い形式が渡されても壊れないよう
// 各関数の入口で normalizeEntry を通す。shapeMismatch(旧形式で形が食い違う記録)は集計に使わない。
import { estimate1RM, getDistanceUnit, allExerciseNames } from "./planner.js?v=14";
import { normalizeEntry } from "./storage.js?v=14";
import { localDateStr, toDateStr, addDays, mondayOf, daysBetween, formatJaDate, roundTo } from "./util.js?v=14";

const EPS = 1e-9;
// 推定1RM は低回数ほど正確。13回以上のセットからは推定しない
export const E1RM_MAX_REPS = 12;

// ---------- 入力の整え ----------

// 日付の正しい記録だけを残し、種目を正規化する(種目なしの記録も「トレーニングした日」として残す)
function clean(logs) {
  const out = [];
  (Array.isArray(logs) ? logs : []).forEach((l, index) => {
    if (!l || typeof l !== "object") return;
    const date = toDateStr(l.date);
    if (!date) return;
    const entries = (Array.isArray(l.entries) ? l.entries : []).map(normalizeEntry).filter(Boolean);
    out.push({ ...l, id: l.id != null ? String(l.id) : `${date}#${index}`, date, entries, _i: index });
  });
  return out;
}

// 古い順(同じ日付は保存順)
function chronological(logs) {
  const key = (l) => l.startedAt ?? (/^\d{10,}$/.test(l.id) ? Number(l.id) : l.createdAt ?? null);
  return [...logs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ka = key(a);
    const kb = key(b);
    if (ka != null && kb != null && ka !== kb) return ka - kb;
    return b._i - a._i; // 正規化済みの一覧は新しい順なので、後ろほど古い
  });
}

const usable = (e) => !e.shapeMismatch;

// 筋トレ記録の各セット [{weight, reps}](セット詳細があればそれを、無ければ要約値を使う)
function weightSets(e) {
  if (Array.isArray(e.setDetails) && e.setDetails.length > 0) {
    return e.setDetails.map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? null }));
  }
  return [{ weight: e.weight ?? 0, reps: e.reps }];
}

function holdSeconds(e) {
  if (Array.isArray(e.setDetails) && e.setDetails.length > 0) {
    return Math.max(...e.setDetails.map((s) => s.seconds ?? 0));
  }
  return e.seconds ?? 0;
}

const e1rmOf = (weight, reps) =>
  (weight > 0 && reps >= 1 && reps <= E1RM_MAX_REPS ? estimate1RM(weight, reps) : null);

// 距離をメートルに(単位の混在をそろえる)
const toMeters = (e) => (e.distance > 0 ? (e.unit === "m" ? e.distance : e.distance * 1000) : 0);
// メートルを種目の表示単位に(プールは m、それ以外は km)
function fromMeters(m, name) {
  return getDistanceUnit(name) === "m" ? Math.round(m) : roundTo(m / 1000, 2);
}

// ---------- サマリー・バッジ・カレンダー ----------

// 全体サマリー。total / thisWeek は「トレーニングした日数」(同じ日に複数回保存しても1日)。
// weekStreak は今週(今週まだなら先週)から連続して記録がある週の数、bestStreak は過去最長。
export function summarize(logs, now = new Date()) {
  const today = localDateStr(now);
  const ls = clean(logs).filter((l) => l.date <= today);
  if (ls.length === 0) {
    return { total: 0, logCount: 0, weekStreak: 0, bestStreak: 0, thisWeek: 0, lastDate: null, daysSinceLast: null };
  }
  const dates = [...new Set(ls.map((l) => l.date))].sort();
  const weeks = new Set(dates.map(mondayOf));
  const thisMonday = mondayOf(today);
  let cursor = weeks.has(thisMonday) ? thisMonday : addDays(thisMonday, -7);
  let weekStreak = 0;
  while (weeks.has(cursor)) {
    weekStreak++;
    cursor = addDays(cursor, -7);
  }
  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const w of [...weeks].sort()) {
    run = prev && daysBetween(prev, w) === 7 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = w;
  }
  const lastDate = dates[dates.length - 1];
  return {
    total: dates.length,
    logCount: ls.length,
    weekStreak,
    bestStreak,
    thisWeek: dates.filter((d) => mondayOf(d) === thisMonday).length,
    lastDate,
    daysSinceLast: daysBetween(lastDate, today),
  };
}

// 実績バッジ: {id, icon, label, need, ok, progress:"3/10"}。
// 連続週のバッジは「過去最長」で判定するので、一度取ったバッジは消えない。
export function badges(logs, now = new Date()) {
  const s = summarize(logs ?? [], now);
  const prs = prCount(logs ?? []);
  const def = (id, icon, label, need, value, goal) => ({
    id, icon, label, need, ok: value >= goal, progress: `${Math.min(value, goal)}/${goal}`,
  });
  return [
    def("first", "🌱", "はじめの一歩", "初めてのトレーニングを記録", s.total, 1),
    def("ten", "🔥", "10日達成", "10日分のトレーニングを記録", s.total, 10),
    def("fifty", "💪", "50日達成", "50日分のトレーニングを記録", s.total, 50),
    def("hundred", "🏆", "100日達成", "100日分のトレーニングを記録", s.total, 100),
    def("streak4", "📅", "4週連続", "4週連続でトレーニング", s.bestStreak, 4),
    def("streak12", "👑", "3ヶ月継続", "12週連続でトレーニング", s.bestStreak, 12),
    def("pr1", "🥇", "初の自己ベスト", "自己ベストを更新", prs, 1),
    def("pr10", "🏅", "自己ベスト10回", "自己ベストを10回更新", prs, 10),
  ];
}

// 直近 weeks 週分のカレンダー(週×7日、月曜始まり)。
// セル: {date, day, count, future, today, label:"9/29(火) 2件"}
export function calendar(logs, weeks = 8, now = new Date()) {
  const countByDate = new Map();
  for (const l of clean(logs)) countByDate.set(l.date, (countByDate.get(l.date) ?? 0) + 1);
  const today = localDateStr(now);
  const thisMonday = mondayOf(today);
  const grid = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(thisMonday, -7 * w + d);
      const future = date > today;
      const count = future ? 0 : countByDate.get(date) ?? 0;
      const label = `${formatJaDate(date)}${future ? "" : count > 0 ? ` ${count}件` : " 記録なし"}`;
      row.push({ date, day: Number(date.slice(8)), count, future, today: date === today, label });
    }
    grid.push(row);
  }
  return grid;
}

// ---------- 種目ごとの推移 ----------

// 記録に登場する種目の一覧(最近記録した順)。グラフの種目選択用。
// kind: "weight"(重量あり)/ "reps"(自重・回数)/ "time"(キープ秒)/ "cardio"
// metrics: その種目で描けるグラフの種類(metricSeries の metric)
export function trackedExercises(logs) {
  const map = new Map();
  for (const l of clean(logs)) {
    for (const e of l.entries) {
      if (!usable(e)) continue;
      let t = map.get(e.name);
      if (!t) {
        t = { name: e.name, track: e.track, lastDate: "", dates: new Set(), perTrack: {} };
        map.set(e.name, t);
      }
      t.dates.add(l.date);
      if (l.date >= t.lastDate) {
        t.lastDate = l.date;
        t.track = e.track;
      }
      const f = (t.perTrack[e.track] ??= { weighted: false, bodyweight: false, distance: false });
      if (e.track === "weight") {
        for (const s of weightSets(e)) {
          if (s.weight > 0) f.weighted = true;
          else if (s.reps > 0) f.bodyweight = true;
        }
      }
      if (e.track === "cardio" && e.distance > 0) f.distance = true;
    }
  }
  const out = [];
  for (const t of map.values()) {
    const f = t.perTrack[t.track];
    let kind;
    let metrics;
    if (t.track === "weight") {
      kind = f.weighted ? "weight" : "reps";
      metrics = f.weighted ? ["weight", "orm", ...(f.bodyweight ? ["reps"] : [])] : ["reps"];
    } else if (t.track === "time") {
      kind = "time";
      metrics = ["seconds"];
    } else {
      kind = "cardio";
      metrics = f.distance ? ["distance", "minutes"] : ["minutes"];
    }
    out.push({
      name: t.name,
      track: t.track,
      kind,
      metrics,
      count: t.dates.size,
      lastDate: t.lastDate,
      distanceUnit: t.track === "cardio" ? getDistanceUnit(t.name) : null,
    });
  }
  return out.sort((a, b) =>
    (a.lastDate !== b.lastDate ? (a.lastDate < b.lastDate ? 1 : -1) : b.count - a.count || a.name.localeCompare(b.name, "ja")));
}

// 重量のある筋トレ種目名(最近記録した順)。旧 API との互換用
export function trackedWeightExercises(logs) {
  return trackedExercises(logs).filter((t) => t.kind === "weight").map((t) => t.name);
}

// 指定種目の日ごとの推移(古い順): [{date, weight, orm, reps}]。
// weight はその日の最も重いセット(ウォームアップの軽いセットは自然に除外される)、
// reps はその重量での最多回数、orm は 12回以下のセットから求めた推定1RM の最大(無ければ null)。
export function exerciseSeries(logs, name) {
  const byDate = new Map();
  for (const l of clean(logs)) {
    for (const e of l.entries) {
      if (e.name !== name || e.track !== "weight" || !usable(e)) continue;
      for (const s of weightSets(e)) {
        if (!(s.weight > 0)) continue;
        const cur = byDate.get(l.date) ?? { date: l.date, weight: 0, reps: null, orm: null };
        if (s.weight > cur.weight + EPS) {
          cur.weight = s.weight;
          cur.reps = s.reps;
        } else if (Math.abs(s.weight - cur.weight) < EPS && (s.reps ?? 0) > (cur.reps ?? 0)) {
          cur.reps = s.reps;
        }
        const orm = e1rmOf(s.weight, s.reps);
        if (orm != null && (cur.orm == null || orm > cur.orm)) cur.orm = orm;
        byDate.set(l.date, cur);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const METRIC_LABELS = {
  weight: "最大重量",
  orm: "推定1RM",
  reps: "回数",
  seconds: "キープ時間",
  minutes: "時間",
  distance: "距離",
};

// グラフの単位
export function metricUnit(name, metric) {
  switch (metric) {
    case "weight":
    case "orm": return "kg";
    case "reps": return "回";
    case "seconds": return "秒";
    case "minutes": return "分";
    case "distance": return getDistanceUnit(name);
    default: return "";
  }
}

// 自己ベストを更新した点に pr: true を付ける(最初の点は除く)
function markBests(series) {
  let best = -Infinity;
  return series.map((p, i) => {
    const pr = i > 0 && p.value > best + EPS;
    best = Math.max(best, p.value);
    return pr ? { ...p, pr: true } : p;
  });
}

// 指定種目・指標の日ごとの推移(古い順): [{date, value, pr?}]
// metric: "weight" | "orm" | "reps"(自重の回数)| "seconds" | "minutes"(日ごとの合計)| "distance"(日ごとの合計)
export function metricSeries(logs, name, metric) {
  if (metric === "weight" || metric === "orm") {
    const key = metric;
    return markBests(exerciseSeries(logs, name)
      .filter((p) => p[key] != null)
      .map((p) => ({ date: p.date, value: p[key] })));
  }
  const byDate = new Map();
  const put = (date, v, sum) => {
    if (!(v > 0)) return;
    const cur = byDate.get(date);
    byDate.set(date, cur == null ? v : sum ? cur + v : Math.max(cur, v));
  };
  let meters = false;
  for (const l of clean(logs)) {
    for (const e of l.entries) {
      if (e.name !== name || !usable(e)) continue;
      if (metric === "reps" && e.track === "weight") {
        for (const s of weightSets(e)) if (!(s.weight > 0)) put(l.date, s.reps ?? 0, false);
      } else if (metric === "seconds" && e.track === "time") {
        put(l.date, holdSeconds(e), false);
      } else if (metric === "minutes" && e.track === "cardio") {
        put(l.date, e.minutes ?? 0, true);
      } else if (metric === "distance" && e.track === "cardio") {
        put(l.date, toMeters(e), true);
        meters = true;
      }
    }
  }
  const series = [...byDate.entries()]
    .map(([date, v]) => ({ date, value: meters ? fromMeters(v, name) : roundTo(v, 1) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return markBests(series);
}

// 体重の推移(古い順): [{date, value}]。同じ日付は後の記録を採用
export function bodyweightSeries(bwLogs) {
  const byDate = new Map();
  for (const b of Array.isArray(bwLogs) ? bwLogs : []) {
    const date = b && typeof b === "object" ? toDateStr(b.date) : null;
    const value = date ? parseFloat(b.weight) : NaN;
    if (date && value >= 20 && value <= 300) byDate.set(date, value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 今月の有酸素の合計(「9月の水泳(クロール) 1,250m・4回」のカード用)。記録が無ければ null
export function monthlySummary(logs, name, now = new Date()) {
  const month = localDateStr(now).slice(0, 7);
  let meters = 0;
  let minutes = 0;
  const dates = new Set();
  for (const l of clean(logs)) {
    if (l.date.slice(0, 7) !== month) continue;
    for (const e of l.entries) {
      if (e.name !== name || e.track !== "cardio" || !usable(e)) continue;
      meters += toMeters(e);
      minutes += e.minutes ?? 0;
      dates.add(l.date);
    }
  }
  if (dates.size === 0) return null;
  return {
    month: Number(month.slice(5)),
    distance: meters > 0 ? fromMeters(meters, name) : null,
    unit: getDistanceUnit(name),
    minutes: roundTo(minutes, 1),
    sessions: dates.size,
  };
}

// 指定種目の直近の実施内容(記録フォームの初期値・前回値の表示用)。
// 最新の日付の中で、筋トレは最も重いセット、キープは最長、有酸素は最長時間の記録を返す。無ければ null
export function lastWorkingSet(logs, name) {
  let best = null;
  for (const l of chronological(clean(logs))) {
    for (const e of l.entries) {
      if (e.name !== name || !usable(e)) continue;
      if (!best || l.date > best.date) {
        best = { ...e, date: l.date };
        continue;
      }
      if (l.date < best.date || e.track !== best.track) continue;
      const better = e.track === "weight"
        ? (e.weight ?? 0) > (best.weight ?? 0) + EPS ||
          (Math.abs((e.weight ?? 0) - (best.weight ?? 0)) < EPS && (e.reps ?? 0) > (best.reps ?? 0))
        : e.track === "time"
          ? holdSeconds(e) > holdSeconds(best)
          : (e.minutes ?? 0) > (best.minutes ?? 0) ||
            ((e.minutes ?? 0) === (best.minutes ?? 0) && toMeters(e) > toMeters(best));
      if (better) best = { ...e, date: l.date };
    }
  }
  return best;
}

// ---------- 自己ベスト ----------

// 判定の優先順(同じ種目で複数更新したときの並び)
const PR_KINDS = ["orm", "weight", "reps", "seconds", "distance", "minutes"];
export const PR_LABELS = {
  orm: "推定1RM",
  weight: "最大重量",
  reps: "回数",
  seconds: "キープ時間",
  distance: "距離",
  minutes: "時間",
};

// 1回の記録の中での種目ごとの指標(distance はメートル)
function metricsOfLog(log) {
  const map = new Map();
  for (const e of log.entries) {
    if (!usable(e)) continue;
    const m = map.get(e.name) ?? {};
    const max = (k, v) => { if (v > 0 && !(m[k] >= v)) m[k] = v; };
    if (e.track === "weight") {
      for (const s of weightSets(e)) {
        if (s.weight > 0) {
          max("weight", s.weight);
          max("orm", e1rmOf(s.weight, s.reps) ?? 0);
        } else {
          max("reps", s.reps ?? 0);
        }
      }
    } else if (e.track === "time") {
      max("seconds", holdSeconds(e));
    } else {
      const d = toMeters(e);
      if (d > 0) m.distance = (m.distance ?? 0) + d;
      if (e.minutes > 0) m.minutes = (m.minutes ?? 0) + e.minutes;
    }
    if (Object.keys(m).length > 0) map.set(e.name, m);
  }
  return map;
}

function display(kind, value, name) {
  if (kind === "distance") return { value: fromMeters(value, name), unit: getDistanceUnit(name) };
  const unit = { orm: "kg", weight: "kg", reps: "回", seconds: "秒", minutes: "分" }[kind];
  return { value: roundTo(value, 1), unit };
}

function prItem(name, kind, value, prev) {
  const v = display(kind, value, name);
  const p = display(kind, prev, name);
  return { name, kind, label: PR_LABELS[kind], value: v.value, prev: p.value, diff: roundTo(v.value - p.value, 2), unit: v.unit };
}

// 記録を古い順に再生し、各記録で更新した自己ベストを集める
function replay(logs, onPR) {
  const bests = new Map(); // name -> {kind: {value, date}}
  for (const log of chronological(clean(logs))) {
    for (const [name, m] of metricsOfLog(log)) {
      const b = bests.get(name) ?? {};
      for (const kind of PR_KINDS) {
        const v = m[kind];
        if (v == null) continue;
        const cur = b[kind];
        if (cur && v > cur.value + EPS) onPR?.(log, prItem(name, kind, v, cur.value));
        if (!cur || v > cur.value + EPS) b[kind] = { value: v, date: log.date };
      }
      bests.set(name, b);
    }
  }
  return bests;
}

// 新しい記録が自己ベストを更新したか。初めての種目・指標は対象外(比較相手がいない)、同値も対象外。
// 返り値: [{name, kind, label, value, prev, diff, unit}](種目は記録の順、指標は PR_KINDS の順)
export function detectPRs(prevLogs, newLog) {
  const [log] = clean([newLog]);
  if (!log) return [];
  const others = (Array.isArray(prevLogs) ? prevLogs : []).filter((l) => newLog?.id == null || String(l?.id) !== String(newLog.id));
  const bests = replay(others);
  const out = [];
  for (const [name, m] of metricsOfLog(log)) {
    const b = bests.get(name);
    if (!b) continue;
    for (const kind of PR_KINDS) {
      if (m[kind] != null && b[kind] && m[kind] > b[kind].value + EPS) out.push(prItem(name, kind, m[kind], b[kind].value));
    }
  }
  return out;
}

// 各記録で更新した自己ベスト: Map(記録 id → [PR...])。記録一覧の 🏆 表示・グラフの強調・バッジ用。
// 保存せず毎回計算するので、削除や読み込みの後も正しい。
export function prHistory(logs) {
  const map = new Map();
  replay(logs, (log, pr) => {
    const list = map.get(log.id) ?? [];
    list.push(pr);
    map.set(log.id, list);
  });
  return map;
}

// 自己ベスト更新の回数(記録×種目の組み合わせで数える)
export function prCount(logs) {
  let n = 0;
  for (const list of prHistory(logs).values()) n += new Set(list.map((p) => p.name)).size;
  return n;
}

// 種目ごとの自己ベスト: [{name, track, best:{kind, label, value, unit, date}, bests:{kind: {...}}}]
// best は代表値(重量あり→最大重量、自重→回数、キープ→秒、有酸素→距離か時間)。最近更新した順。
export function personalBests(logs) {
  const bests = replay(logs);
  const tracks = new Map(trackedExercises(logs).map((t) => [t.name, t]));
  const out = [];
  for (const [name, b] of bests) {
    const t = tracks.get(name);
    if (!t) continue;
    const all = {};
    for (const kind of PR_KINDS) {
      if (!b[kind]) continue;
      const d = display(kind, b[kind].value, name);
      all[kind] = { kind, label: PR_LABELS[kind], value: d.value, unit: d.unit, date: b[kind].date };
    }
    const order = t.track === "weight"
      ? ["weight", "orm", "reps"]
      : t.track === "time" ? ["seconds"] : ["distance", "minutes"];
    const headline = order.find((k) => all[k]);
    if (!headline) continue;
    const latest = Object.values(all).reduce((a, v) => (v.date > a ? v.date : a), "");
    out.push({ name, track: t.track, best: all[headline], bests: all, updated: latest });
  }
  return out.sort((a, b) => (a.updated !== b.updated ? (a.updated < b.updated ? 1 : -1) : a.name.localeCompare(b.name, "ja")));
}

// ---------- 種目名のゆれ(自由入力の名前をデータベースの名前へまとめる候補) ----------

export const EXERCISE_ALIASES = {
  "ベンチ": "ベンチプレス",
  "スクワット": "バーベルスクワット",
  "デッド": "デッドリフト",
  "懸垂": "懸垂(チンニング)",
  "チンニング": "懸垂(チンニング)",
  "腕立て": "腕立て伏せ",
  "プッシュアップ": "腕立て伏せ",
  "腹筋": "クランチ",
  "ウォールシット": "ウォールシット(空気椅子)",
  "空気椅子": "ウォールシット(空気椅子)",
  "ラットプル": "ラットプルダウン",
  "ショルダープレス": "ダンベルショルダープレス",
  "クロール": "水泳(クロール)",
  "平泳ぎ": "水泳(平泳ぎ)",
  "背泳ぎ": "水泳(背泳ぎ)",
  "バタフライ": "水泳(バタフライ)",
  "ジョギング": "ランニング",
  "バイク": "エアロバイク",
};

// データベースに無い種目名と、まとめ先の候補(候補が無ければ suggestion: null)。記録の多い順
export function unknownExerciseNames(logs) {
  const known = new Set(allExerciseNames());
  const counts = new Map();
  for (const l of clean(logs)) {
    for (const e of l.entries) {
      if (known.has(e.name)) continue;
      const c = counts.get(e.name) ?? { name: e.name, count: 0, lastDate: "" };
      c.count++;
      if (l.date > c.lastDate) c.lastDate = l.date;
      counts.set(e.name, c);
    }
  }
  const names = [...known];
  return [...counts.values()]
    .map((c) => {
      let suggestion = EXERCISE_ALIASES[c.name] ?? null;
      if (!suggestion) {
        const starts = names.filter((n) => n.startsWith(c.name));
        if (starts.length === 1) suggestion = starts[0];
      }
      return { ...c, suggestion: suggestion && known.has(suggestion) ? suggestion : null };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
