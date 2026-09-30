// js/stats.js の単体テスト。日付の判定はローカル時刻で組み立てた now で行い、
// どのタイムゾーンで実行しても成り立つ。JST 固有のケースは TZ=Asia/Tokyo の子プロセスで確認する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  summarize, badges, calendar, trackedExercises, trackedWeightExercises, exerciseSeries, metricSeries, metricUnit,
  bodyweightSeries, detectPRs, prHistory, prCount, personalBests, monthlySummary, lastWorkingSet,
  unknownExerciseNames, E1RM_MAX_REPS,
} from "../js/stats.js";

const STATS_URL = new URL("../js/stats.js", import.meta.url).href;
const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map((date, i) => ({ id: i, date, entries: [] }));

let seq = 0;
const log = (date, entries, extra = {}) => ({ id: `t${++seq}`, date, entries, ...extra });
const lift = (name, weight, reps, sets = 3) => ({ name, track: "weight", weight, reps, sets });
const hold = (name, seconds, sets = 3) => ({ name, track: "time", seconds, sets });
const cardio = (name, minutes, distance = null, unit = undefined) => ({ name, track: "cardio", minutes, distance, ...(unit ? { unit } : {}) });

function inTZ(tz, body) {
  const code = `import * as s from ${JSON.stringify(STATS_URL)}; const out = (() => { ${body} })(); console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("B01: 4 consecutive Mondays give a 4-week streak at 07:30, 12:00 and 23:59 local", () => {
  for (const now of [at(2026, 9, 29, 7, 30), at(2026, 9, 29, 12), at(2026, 9, 29, 23, 59)]) {
    const s = summarize(mondays, now);
    assert.equal(s.weekStreak, 4, String(now));
    assert.equal(s.thisWeek, 1);
    assert.equal(s.lastDate, "2026-09-28");
    const row = calendar(mondays, 1, now)[0];
    assert.equal(row[0].date, "2026-09-28");
    assert.equal(row[0].count, 1);
    assert.equal(row[1].date, "2026-09-29");
    assert.equal(row[1].today, true);
    assert.equal(row[1].future, false);
    assert.equal(row[0].future, false);
    assert.deepEqual(row.map((c) => c.future), [false, false, true, true, true, true, true]);
  }
  const monday = summarize(mondays, at(2026, 10, 5, 0, 30));
  assert.deepEqual([monday.weekStreak, monday.thisWeek], [4, 0]);
  assert.equal(badges(mondays, at(2026, 9, 29, 7, 30)).find((b) => b.id === "streak4").ok, true);
});

test("B01 in Asia/Tokyo with absolute instants (07:30 / 12:00 / 23:59 JST and Monday 00:30)", () => {
  const out = inTZ("Asia/Tokyo", `
    const logs = ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"].map((date, i) => ({ id: i, date, entries: [] }));
    const r = {};
    for (const t of ["2026-09-29T07:30:00+09:00", "2026-09-29T12:00:00+09:00", "2026-09-29T23:59:00+09:00"]) {
      const now = new Date(t);
      const row = s.calendar(logs, 1, now)[0];
      r[t] = [s.summarize(logs, now).weekStreak, row[0].date, row[0].count, row.find((c) => c.today).date, row.filter((c) => c.future).length];
    }
    const mon = s.summarize(logs, new Date("2026-10-05T00:30:00+09:00"));
    r.monday = [mon.weekStreak, mon.thisWeek];
    return r;`);
  for (const t of ["2026-09-29T07:30:00+09:00", "2026-09-29T12:00:00+09:00", "2026-09-29T23:59:00+09:00"]) {
    assert.deepEqual(out[t], [4, "2026-09-28", 1, "2026-09-29", 5], t);
  }
  assert.deepEqual(out.monday, [4, 0]);
});

test("12-week daily streak survives DST changes (Los Angeles, London)", () => {
  for (const tz of ["America/Los_Angeles", "Europe/London"]) {
    const out = inTZ(tz, `
      const logs = [];
      for (let i = 0; i < 84; i++) { const d = new Date(Date.UTC(2026, 9, 5 + i)); logs.push({ id: i, date: d.toISOString().slice(0, 10), entries: [] }); }
      const now = new Date(2026, 11, 27, 9, 0);
      const sm = s.summarize(logs, now);
      const grid = s.calendar(logs, 12, now);
      return { streak: sm.weekStreak, best: sm.bestStreak, total: sm.total, mondays: grid.every((row) => new Date(row[0].date + "T12:00:00Z").getUTCDay() === 1), rows: grid.length };`);
    assert.deepEqual(out, { streak: 12, best: 12, total: 84, mondays: true, rows: 12 }, tz);
  }
});

test("summarize counts training days (not saves), ignores future dates, and tracks best streak", () => {
  const logs = [
    log("2026-09-01", [lift("ベンチプレス", 60, 10)]),
    log("2026-09-01", [lift("スクワット", 80, 5)]),
    log("2026-09-02", [lift("ベンチプレス", 60, 10)]),
    log("2026-10-10", [lift("ベンチプレス", 60, 10)]), // 未来
  ];
  const s = summarize(logs, at(2026, 9, 3));
  assert.deepEqual([s.total, s.logCount, s.thisWeek, s.lastDate, s.daysSinceLast], [2, 3, 2, "2026-09-02", 1]);
  // 連続が途切れても過去最長とバッジは残る
  const weeks = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"].map((d) => log(d, [lift("A", 1, 1)]));
  const later = summarize(weeks, at(2026, 9, 29));
  assert.deepEqual([later.weekStreak, later.bestStreak], [0, 4]);
  assert.equal(badges(weeks, at(2026, 9, 29)).find((b) => b.id === "streak4").ok, true);
  assert.deepEqual(summarize([], at(2026, 9, 29)).total, 0);
});

test("badges expose progress strings and PR badges", () => {
  const b = badges([log("2026-09-01", [lift("ベンチプレス", 60, 10)])], at(2026, 9, 2));
  const ten = b.find((x) => x.id === "ten");
  assert.deepEqual([ten.ok, ten.progress], [false, "1/10"]);
  assert.equal(b.find((x) => x.id === "first").ok, true);
  for (const x of b) assert.ok(x.icon && x.label && x.need && typeof x.ok === "boolean" && /^\d+\/\d+$/.test(x.progress));
  const prLogs = [log("2026-09-01", [lift("ベンチプレス", 60, 10)]), log("2026-09-08", [lift("ベンチプレス", 65, 10)])];
  assert.equal(badges(prLogs, at(2026, 9, 9)).find((x) => x.id === "pr1").ok, true);
});

test("calendar cells carry Japanese labels and no counts in the future", () => {
  const grid = calendar([log("2026-09-29", [lift("A", 1, 1)]), log("2026-09-29", [lift("B", 1, 1)])], 2, at(2026, 9, 29));
  assert.equal(grid.length, 2);
  assert.ok(grid.every((r) => r.length === 7));
  const today = grid[1][1];
  assert.deepEqual([today.date, today.label, today.day], ["2026-09-29", "9/29(火) 2件", 29]);
  assert.equal(grid[1][0].label, "9/28(月) 記録なし");
  assert.equal(grid[1][2].label, "9/30(水)");
  assert.equal(grid[0][0].date, "2026-09-21");
});

test("trackedExercises: most recent first, kinds and metrics per track, legacy mismatches excluded (B22, I15, I44)", () => {
  const logs = [
    log("2026-06-08", [{ name: "ベンチ", weight: "60", sets: "3", reps: "10" }, { name: "水泳(クロール)", weight: "1", sets: "1", reps: "30" }]),
    log("2026-09-01", [lift("ベンチプレス", 60, 10), lift("腕立て伏せ", 0, 15), hold("プランク", 30)]),
    log("2026-09-05", [cardio("水泳(クロール)", 30, 750, "m"), cardio("ランニング", 20)]),
    log("2026-09-10", [lift("懸垂(チンニング)", 0, 8), lift("懸垂(チンニング)", 10, 5)]),
  ];
  const t = trackedExercises(logs);
  assert.equal(t[0].name, "懸垂(チンニング)");
  assert.equal(t[t.length - 1].name, "ベンチ");
  const by = Object.fromEntries(t.map((x) => [x.name, x]));
  assert.deepEqual([by["ベンチプレス"].kind, by["ベンチプレス"].metrics], ["weight", ["weight", "orm"]]);
  assert.deepEqual([by["腕立て伏せ"].kind, by["腕立て伏せ"].metrics], ["reps", ["reps"]]);
  assert.deepEqual([by["プランク"].kind, by["プランク"].metrics], ["time", ["seconds"]]);
  assert.deepEqual([by["水泳(クロール)"].kind, by["水泳(クロール)"].metrics, by["水泳(クロール)"].distanceUnit], ["cardio", ["distance", "minutes"], "m"]);
  assert.deepEqual(by["ランニング"].metrics, ["minutes"]);
  assert.deepEqual(by["懸垂(チンニング)"].metrics, ["weight", "orm", "reps"]);
  assert.equal(by["水泳(クロール)"].count, 1); // 旧形式(回数で記録)の水泳は数えない
  assert.deepEqual(trackedWeightExercises(logs), ["懸垂(チンニング)", "ベンチプレス", "ベンチ"]);
});

test("exerciseSeries picks the working set, not the warm-up (B39); 1RM only up to 12 reps (I15)", () => {
  const logs = [
    log("2026-09-26", [lift("ベンチプレス", 40, 10, 1), lift("ベンチプレス", 80, 5, 3)]),
    log("2026-09-20", [lift("ベンチプレス", 20, 30)]),
    log("2026-09-22", [{ name: "ベンチプレス", track: "weight", setDetails: [{ weight: 60, reps: 8 }, { weight: 70, reps: 3 }, { weight: 70, reps: 5 }] }]),
  ];
  const s = exerciseSeries(logs, "ベンチプレス");
  assert.deepEqual(s.map((p) => p.date), ["2026-09-20", "2026-09-22", "2026-09-26"]);
  assert.deepEqual(s[0], { date: "2026-09-20", weight: 20, reps: 30, orm: null });
  assert.deepEqual([s[1].weight, s[1].reps, s[1].orm], [70, 5, 81.7]);
  assert.deepEqual([s[2].weight, s[2].reps, s[2].orm], [80, 5, 93.3]);
  assert.equal(E1RM_MAX_REPS, 12);
  assert.deepEqual(exerciseSeries(logs, "スクワット"), []);
});

test("metricSeries covers reps, seconds, minutes and distance with unit normalisation (I15)", () => {
  const logs = [
    log("2026-09-01", [lift("腕立て伏せ", 0, 15), hold("プランク", 30), cardio("水泳(クロール)", 30, 750, "m"), cardio("ランニング", 20, 3)]),
    log("2026-09-03", [lift("腕立て伏せ", 0, 18), hold("プランク", 45), cardio("水泳(クロール)", 20, 500, "m"), cardio("水泳(クロール)", 25, 1.2)]),
    log("2026-09-03", [cardio("ランニング", 25, 4500, "m")]),
    log("2026-09-05", [{ name: "プランク", track: "time", setDetails: [{ seconds: 40 }, { seconds: 60 }] }, cardio("水泳(クロール)", 40, 1625, "m")]),
    log("2026-06-08", [{ name: "プランク", weight: "", sets: "3", reps: "60" }]), // 旧形式: 回数で記録 → 使わない
  ];
  assert.deepEqual(metricSeries(logs, "腕立て伏せ", "reps"), [{ date: "2026-09-01", value: 15 }, { date: "2026-09-03", value: 18, pr: true }]);
  assert.deepEqual(metricSeries(logs, "プランク", "seconds").map((p) => [p.date, p.value]), [["2026-09-01", 30], ["2026-09-03", 45], ["2026-09-05", 60]]);
  assert.deepEqual(metricSeries(logs, "水泳(クロール)", "distance").map((p) => p.value), [750, 1700, 1625]);
  assert.deepEqual(metricSeries(logs, "水泳(クロール)", "minutes").map((p) => p.value), [30, 45, 40]);
  assert.deepEqual(metricSeries(logs, "ランニング", "distance").map((p) => p.value), [3, 4.5]);
  assert.deepEqual(metricSeries(logs, "ベンチプレス", "orm"), []);
  assert.deepEqual(
    [metricUnit("ベンチプレス", "orm"), metricUnit("腕立て伏せ", "reps"), metricUnit("プランク", "seconds"), metricUnit("水泳(クロール)", "distance"), metricUnit("ランニング", "distance"), metricUnit("ランニング", "minutes")],
    ["kg", "回", "秒", "m", "km", "分"],
  );
  const w = metricSeries([log("2026-09-01", [lift("ベンチプレス", 60, 10)]), log("2026-09-08", [lift("ベンチプレス", 60, 12)]), log("2026-09-15", [lift("ベンチプレス", 62.5, 8)])], "ベンチプレス", "orm");
  assert.deepEqual(w.map((p) => [p.value, !!p.pr]), [[80, false], [84, true], [79.2, false]]);
});

test("bodyweightSeries dedupes by date, skips junk and sorts", () => {
  assert.deepEqual(
    bodyweightSeries([{ date: "2026-09-02", weight: "65" }, null, { date: "2026-09-01", weight: 64.5 }, { date: "2026-09-02", weight: "64.8" }, { date: "bad", weight: 1 }, { date: "2026-09-03", weight: "abc" }]),
    [{ date: "2026-09-01", value: 64.5 }, { date: "2026-09-02", value: 64.8 }],
  );
  assert.deepEqual(bodyweightSeries(null), []);
});

test("detectPRs (I05): e1RM from more reps, first-ever gives none, unit-safe distance, no PR on ties or regressions", () => {
  const bench8 = log("2026-09-22", [lift("ベンチプレス", 62.5, 8)]);
  const bench10 = log("2026-09-28", [lift("ベンチプレス", 62.5, 10)]);
  const prs = detectPRs([bench8], bench10);
  assert.deepEqual(prs.map((p) => p.kind), ["orm"]);
  assert.deepEqual([prs[0].name, prs[0].prev, prs[0].value, prs[0].unit, prs[0].label], ["ベンチプレス", 79.2, 83.3, "kg", "推定1RM"]);
  assert.equal(prs[0].diff, 4.1);
  // 初めての種目
  assert.deepEqual(detectPRs([], bench10), []);
  assert.deepEqual(detectPRs([bench8], log("2026-09-29", [lift("スクワット", 100, 5)])), []);
  // 重量更新
  const heavier = detectPRs([bench8], log("2026-09-29", [lift("ベンチプレス", 40, 10, 1), lift("ベンチプレス", 65, 8)]));
  assert.deepEqual(heavier.map((p) => p.kind), ["orm", "weight"]);
  // 水泳: 1000m → 1250m は距離の更新、旧形式の 1.0(km)と 1000m は同じ
  const swim1000 = log("2026-09-01", [cardio("水泳(クロール)", 30, 1000, "m")]);
  const swim = detectPRs([swim1000], log("2026-09-08", [cardio("水泳(クロール)", 30, 1250, "m")]));
  assert.deepEqual(swim.map((p) => [p.kind, p.prev, p.value, p.unit]), [["distance", 1000, 1250, "m"]]);
  assert.deepEqual(detectPRs([log("2026-09-01", [cardio("水泳(クロール)", 30, 1.0)])], log("2026-09-08", [cardio("水泳(クロール)", 30, 1000, "m")])), []);
  // プランクの後退・同値は対象外。時間の更新は検出
  const plank = log("2026-09-01", [hold("プランク", 60)]);
  assert.deepEqual(detectPRs([plank], log("2026-09-08", [hold("プランク", 45)])), []);
  assert.deepEqual(detectPRs([plank], log("2026-09-08", [hold("プランク", 60)])), []);
  assert.deepEqual(detectPRs([plank], log("2026-09-08", [hold("プランク", 75)])).map((p) => p.kind), ["seconds"]);
  // 自重の回数
  assert.deepEqual(detectPRs([log("2026-09-01", [lift("腕立て伏せ", 0, 15)])], log("2026-09-08", [lift("腕立て伏せ", 0, 20)])).map((p) => [p.kind, p.value, p.unit]), [["reps", 20, "回"]]);
  // 保存済みの一覧に新しい記録自身が含まれていても自分とは比べない
  assert.deepEqual(detectPRs([bench8, bench10], bench10).map((p) => p.kind), ["orm"]);
  // 13回以上のセットは 1RM 比較に使わない
  assert.deepEqual(detectPRs([bench8], log("2026-09-29", [lift("ベンチプレス", 40, 30)])), []);
  // 旧形式(形の食い違い)は比較に使わない
  assert.deepEqual(detectPRs([log("2026-06-08", [{ name: "プランク", weight: "", sets: "3", reps: "60" }])], log("2026-09-08", [hold("プランク", 30)])), []);
});

test("prHistory / prCount are derived from the logs, so deleting a PR log removes its marker", () => {
  const a = log("2026-09-01", [lift("ベンチプレス", 60, 10)]);
  const b = log("2026-09-08", [lift("ベンチプレス", 65, 10), hold("プランク", 30)]);
  const c = log("2026-09-15", [lift("ベンチプレス", 67.5, 10), hold("プランク", 45)]);
  const h = prHistory([c, b, a]);
  assert.equal(h.has(a.id), false);
  assert.deepEqual(h.get(b.id).map((p) => p.kind), ["orm", "weight"]);
  assert.deepEqual(h.get(c.id).map((p) => `${p.name}:${p.kind}`), ["ベンチプレス:orm", "ベンチプレス:weight", "プランク:seconds"]);
  assert.equal(prCount([c, b, a]), 3);
  const without = prHistory([c, a]);
  assert.equal(without.has(b.id), false);
  assert.deepEqual(without.get(c.id).map((p) => p.kind), ["orm", "weight"]);
});

test("personalBests lists the headline best per exercise, most recently improved first", () => {
  const logs = [
    log("2026-09-01", [lift("ベンチプレス", 60, 10), cardio("水泳(クロール)", 30, 1000, "m")]),
    log("2026-09-08", [lift("ベンチプレス", 70, 5), hold("プランク", 60)]),
    log("2026-09-15", [lift("ベンチプレス", 65, 10), cardio("水泳(クロール)", 45, 900, "m"), lift("腕立て伏せ", 0, 20)]),
  ];
  const pb = personalBests(logs);
  const by = Object.fromEntries(pb.map((p) => [p.name, p]));
  assert.deepEqual([by["ベンチプレス"].best.kind, by["ベンチプレス"].best.value, by["ベンチプレス"].best.date], ["weight", 70, "2026-09-08"]);
  assert.deepEqual([by["ベンチプレス"].bests.orm.value, by["ベンチプレス"].bests.orm.date], [86.7, "2026-09-15"]);
  assert.deepEqual([by["水泳(クロール)"].best.kind, by["水泳(クロール)"].best.value, by["水泳(クロール)"].best.unit], ["distance", 1000, "m"]);
  assert.deepEqual([by["水泳(クロール)"].bests.minutes.value, by["水泳(クロール)"].bests.minutes.date], [45, "2026-09-15"]);
  assert.deepEqual([by["プランク"].best.kind, by["プランク"].best.value], ["seconds", 60]);
  assert.deepEqual([by["腕立て伏せ"].best.kind, by["腕立て伏せ"].best.unit], ["reps", "回"]);
  assert.equal(pb[pb.length - 1].name, "プランク");
  // 同値は最初に達成した日のまま
  const tie = personalBests([log("2026-09-01", [lift("A", 50, 5)]), log("2026-09-08", [lift("A", 50, 5)])]);
  assert.equal(tie[0].best.date, "2026-09-01");
});

test("monthlySummary totals this month's cardio in local dates", () => {
  const logs = [
    log("2026-09-01", [cardio("水泳(クロール)", 30, 1000, "m")]),
    log("2026-09-20", [cardio("水泳(クロール)", 40, 1250, "m"), cardio("水泳(クロール)", 10, 250, "m")]),
    log("2026-08-31", [cardio("水泳(クロール)", 30, 1000, "m")]),
  ];
  assert.deepEqual(monthlySummary(logs, "水泳(クロール)", at(2026, 9, 29)), { month: 9, distance: 2500, unit: "m", minutes: 80, sessions: 2 });
  assert.equal(monthlySummary(logs, "ランニング", at(2026, 9, 29)), null);
  const run = monthlySummary([log("2026-09-02", [cardio("ランニング", 30)])], "ランニング", at(2026, 9, 29));
  assert.deepEqual(run, { month: 9, distance: null, unit: "km", minutes: 30, sessions: 1 });
});

test("lastWorkingSet: newest session wins, best row within it (B39)", () => {
  const logs = [
    log("2026-09-20", [lift("ベンチプレス", 100, 3)]),
    log("2026-09-26", [lift("ベンチプレス", 40, 10, 1), lift("ベンチプレス", 80, 5)]),
  ];
  const last = lastWorkingSet(logs, "ベンチプレス");
  assert.deepEqual([last.date, last.weight, last.reps], ["2026-09-26", 80, 5]);
  assert.equal(lastWorkingSet([log("2026-09-01", [hold("プランク", 30), hold("プランク", 60)])], "プランク").seconds, 60);
  assert.equal(lastWorkingSet(logs, "スクワット"), null);
  assert.equal(lastWorkingSet([log("2026-06-08", [{ name: "プランク", weight: "", sets: "3", reps: "60" }])], "プランク"), null);
});

test("unknownExerciseNames suggests database names for free-typed ones (I44)", () => {
  const logs = [
    log("2026-06-08", [{ name: "ベンチ", weight: "60", reps: "10" }, { name: "腹筋", reps: "50" }, { name: "謎の運動", reps: "1" }]),
    log("2026-06-12", [{ name: "ウォールシット", track: "weight", weight: "0", reps: "10" }, { name: "ベンチ", weight: "60", reps: "10" }]),
    log("2026-06-13", [lift("ベンチプレス", 60, 10)]),
  ];
  const u = unknownExerciseNames(logs);
  assert.deepEqual(u[0], { name: "ベンチ", count: 2, lastDate: "2026-06-12", suggestion: "ベンチプレス" });
  const by = Object.fromEntries(u.map((x) => [x.name, x.suggestion]));
  assert.deepEqual(by, { "ベンチ": "ベンチプレス", "ウォールシット": "ウォールシット(空気椅子)", "腹筋": "クランチ", "謎の運動": null });
});

test("stats functions never throw on corrupt input (B02 defence in depth)", () => {
  const junk = [null, 5, "x", { date: "2026/13/45" }, { date: 20260901, entries: [] }, { date: "2026-09-01", entries: "nope" },
    { date: "2026-09-02", entries: [null, 3, { name: 7, weight: "a" }, { weight: 5 }] }];
  const now = at(2026, 9, 29);
  assert.doesNotThrow(() => {
    summarize(junk, now); badges(junk, now); calendar(junk, 8, now); trackedExercises(junk); exerciseSeries(junk, "7");
    metricSeries(junk, "7", "reps"); detectPRs(junk, junk[6]); prHistory(junk); personalBests(junk); monthlySummary(junk, "7", now);
    lastWorkingSet(junk, "7"); unknownExerciseNames(junk); detectPRs(null, null); summarize(undefined, now); calendar(undefined, 2, now);
  });
  assert.equal(summarize(junk, now).total, 2);
});
