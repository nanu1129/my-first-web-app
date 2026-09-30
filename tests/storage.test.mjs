// js/storage.js の単体テスト。メモリ上の localStorage 代替で、移行・破損・容量不足・バックアップを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as S from "../js/storage.js";

// localStorage と同じ API のメモリ実装。quota(文字数)を超える setItem は QuotaExceededError を投げる
class MemoryStorage {
  constructor(init = {}, quota = Infinity) {
    this.map = new Map(Object.entries(init));
    this.quota = quota;
    this.writes = 0;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    const str = String(v);
    let size = 0;
    for (const [kk, vv] of this.map) if (kk !== k) size += kk.length + vv.length;
    if (size + k.length + str.length > this.quota) {
      const e = new Error(`Setting the value of '${k}' exceeded the quota.`);
      e.name = "QuotaExceededError";
      throw e;
    }
    this.writes++;
    this.map.set(k, str);
  }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
  dump() { return Object.fromEntries(this.map); }
}

// テストごとに新しいストレージで初期化する
function fresh(init = {}, quota = Infinity) {
  const store = new MemoryStorage(init, quota);
  const errors = [];
  const status = S.initStorage({ onError: (m) => errors.push(m), storage: store });
  return { store, errors, status };
}

// 旧バージョンが実際に保存していた形(git 履歴 1600d82 → 7668ae7 → c0f2e2a → 6d40f72 → c93d731)
const LEGACY_LOGS = [
  // 1600d82: 自由入力・track なし・すべて文字列。プランク/ランニングも「回数」で記録していた
  { id: 1790652951674, date: "2026-06-08", entries: [
    { name: "ベンチ", weight: "60", sets: "3", reps: "10" },
    { name: "プランク", weight: "", sets: "3", reps: "60" },
    { name: "ランニング", weight: "", sets: "1", reps: "30" },
    { name: "腹筋", weight: "", sets: "3", reps: "50" },
  ] },
  { id: 1790652952123, date: "2026-06-10", entries: [
    { name: "ベンチプレス", weight: "62.5", sets: "3", reps: "8" },
    { name: "水泳(クロール)", weight: "1", sets: "1", reps: "30" },
  ] },
  // 7668ae7: track あり(DB に無い名前は weight 扱い)、有酸素は km・単位なし
  { id: 1790652953890, date: "2026-06-11", entries: [
    { name: "サイドプランク", track: "weight", weight: "", sets: "3", reps: "40" },
    { name: "水泳(クロール)", track: "cardio", minutes: "40", distance: "1.2" },
    { name: "ランニング", track: "cardio", minutes: "130", distance: "21.1" },
    { name: "プランク", track: "time", seconds: "90", sets: "3" },
  ] },
  // c0f2e2a: 選択式。"0" = 自重、距離なしは ""
  { id: 1790652954773, date: "2026-06-12", entries: [
    { name: "ウォールシット", track: "weight", weight: "0", sets: "3", reps: "10" },
    { name: "ランニング", track: "cardio", minutes: "25", distance: "" },
  ] },
  // 6d40f72+: プールは m と単位付き
  { id: 1790652957357, date: "2026-06-12", entries: [
    { name: "水泳(平泳ぎ)", track: "cardio", minutes: "30", distance: "1000", unit: "m" },
  ] },
];
const LEGACY_STORE = {
  anthropic_api_key: "sk-ant-api03-LEGACYDUMMYKEY-do-not-use-0000000000",
  force_builtin: "1",
  workout_logs: JSON.stringify(LEGACY_LOGS),
  workout_profile: JSON.stringify({ weight: 67, height: 172, age: 34, gender: "男性", goal: "hypertrophy", level: "intermediate", frequency: 4, focus: ["chest"], equipment: ["barbell", "pool"] }),
  bodyweight_logs: JSON.stringify([{ date: "2026-09-29", weight: "67.5" }]),
};

const allEntries = (logs) => logs.flatMap((l) => l.entries);
const find = (logs, date, name) => logs.filter((l) => l.date === date).flatMap((l) => l.entries).find((e) => e.name === name);

test("initStorage deletes the legacy API key and force_builtin (B11) and flags a one-time notice", () => {
  const { store, status, errors } = fresh(LEGACY_STORE);
  assert.equal(store.getItem("anthropic_api_key"), null);
  assert.equal(store.getItem("force_builtin"), null);
  assert.equal(status.removedLegacyKey, true);
  assert.equal(S.getMeta().legacyKeyNotice, true);
  assert.equal(S.getMeta().schema, S.SCHEMA_VERSION);
  assert.deepEqual(errors, []);
  // 2回目の起動では何もしない
  const again = S.initStorage({ storage: store });
  assert.equal(again.removedLegacyKey, false);
  // 新規利用者には通知しない
  const { status: s2 } = fresh({});
  assert.equal(s2.removedLegacyKey, false);
  assert.equal(S.getMeta().legacyKeyNotice, undefined);
});

test("migration normalises every historical entry shape (B22 / I28)", () => {
  const { store, status } = fresh(LEGACY_STORE);
  assert.equal(status.migrated, true);
  const stored = JSON.parse(store.getItem("workout_logs"));
  const logs = S.loadLogs();
  assert.equal(logs.length, LEGACY_LOGS.length);
  assert.equal(allEntries(logs).length, allEntries(LEGACY_LOGS).length);
  assert.equal(allEntries(stored).length, allEntries(LEGACY_LOGS).length);
  for (const e of allEntries(logs)) {
    assert.ok(["weight", "time", "cardio"].includes(e.track), e.name);
    for (const k of ["weight", "reps", "seconds", "minutes", "distance"]) {
      assert.ok(e[k] === null || typeof e[k] === "number", `${e.name}.${k}=${JSON.stringify(e[k])}`);
    }
    assert.equal(typeof e.sets, "number");
    if (e.track === "cardio") assert.ok(["m", "km"].includes(e.unit), e.name);
  }
  // 数値文字列 → 数値
  assert.deepEqual(
    (({ weight, sets, reps, track }) => ({ weight, sets, reps, track }))(find(logs, "2026-06-10", "ベンチプレス")),
    { weight: 62.5, sets: 3, reps: 8, track: "weight" },
  );
  // 回数で記録された旧プランク・ランニング・水泳は値を残したまま shapeMismatch
  assert.equal(find(logs, "2026-06-08", "プランク").shapeMismatch, "time");
  assert.equal(find(logs, "2026-06-08", "プランク").reps, 60);
  assert.equal(find(logs, "2026-06-08", "ランニング").shapeMismatch, "cardio");
  assert.equal(find(logs, "2026-06-10", "水泳(クロール)").shapeMismatch, "cardio");
  assert.equal(find(logs, "2026-06-11", "サイドプランク").shapeMismatch, "time");
  // 形が正しいものには付かない
  assert.equal(find(logs, "2026-06-11", "プランク").shapeMismatch, undefined);
  assert.equal(find(logs, "2026-06-11", "プランク").seconds, 90);
  // DB に無い自由入力名は weight のまま(誤検知しない)
  assert.equal(find(logs, "2026-06-08", "ベンチ").shapeMismatch, undefined);
  assert.equal(find(logs, "2026-06-12", "ウォールシット").weight, 0);
  // プールの旧 km 表記 → m、その他の有酸素は km のまま
  const swim = find(logs, "2026-06-11", "水泳(クロール)");
  assert.deepEqual([swim.distance, swim.unit], [1200, "m"]);
  const run = find(logs, "2026-06-11", "ランニング");
  assert.deepEqual([run.distance, run.unit, run.minutes], [21.1, "km", 130]);
  assert.equal(find(logs, "2026-06-12", "ランニング").distance, null);
  const breast = find(logs, "2026-06-12", "水泳(平泳ぎ)");
  assert.deepEqual([breast.distance, breast.unit], [1000, "m"]);
  // id は文字列で保持
  assert.ok(logs.every((l) => typeof l.id === "string"));
  assert.ok(logs.some((l) => l.id === "1790652951674"));
  // 体重は数値に
  assert.deepEqual(S.loadBodyweight(), [{ date: "2026-09-29", weight: 67.5 }]);
  // 同じ日付の記録は新しい順(保存時刻 = 旧 id)
  const june12 = logs.filter((l) => l.date === "2026-06-12").map((l) => l.id);
  assert.deepEqual(june12, ["1790652957357", "1790652954773"]);
  // 移行は冪等
  assert.deepEqual(S.normalizeLogs(logs).logs, logs);
});

test("normalizeEntry: track inference, unknown fields kept, nameless entries dropped", () => {
  assert.equal(S.normalizeEntry({ weight: "10" }), null);
  assert.equal(S.normalizeEntry({ name: "   " }), null);
  assert.equal(S.normalizeEntry(null), null);
  assert.equal(S.normalizeEntry({ name: { x: 1 } }), null);
  assert.equal(S.normalizeEntry({ name: 123, weight: "5", reps: "5" }).name, "123");
  assert.equal(S.normalizeEntry({ name: "謎の種目", minutes: "20" }).track, "cardio");
  assert.equal(S.normalizeEntry({ name: "謎の種目", seconds: "45" }).track, "time");
  assert.equal(S.normalizeEntry({ name: "プランク" }).track, "time"); // 値が無ければ DB に従う
  const e = S.normalizeEntry({ name: "ベンチプレス", track: "weight", weight: "80", reps: "5", sets: "3", note: "調子よい", rpe: 8 });
  assert.equal(e.note, "調子よい");
  assert.equal(e.rpe, 8);
  assert.equal(S.normalizeEntry({ name: "ベンチプレス", track: "bogus", weight: "-5", reps: "abc" }).weight, 0);
  // 25m 以上の単位なしプール距離は m とみなす(二重変換しない)
  assert.deepEqual((({ distance, unit }) => ({ distance, unit }))(S.normalizeEntry({ name: "水泳(クロール)", track: "cardio", minutes: "30", distance: "750" })), { distance: 750, unit: "m" });
  const once = S.normalizeEntry({ name: "水泳(クロール)", track: "cardio", distance: "0.02" });
  assert.deepEqual([once.distance, once.unit], [20, "m"]);
  assert.deepEqual(S.normalizeEntry(once), once);
  // セット詳細だけの記録から要約値を作る
  const sd = S.normalizeEntry({ name: "ベンチプレス", track: "weight", setDetails: [{ weight: 40, reps: 10 }, { weight: "80", reps: "5" }, { weight: 80, reps: 0 }] });
  assert.deepEqual([sd.weight, sd.reps, sd.sets, sd.setDetails.length], [80, 5, 2, 2]);
  const hold = S.normalizeEntry({ name: "プランク", track: "time", setDetails: [{ seconds: 30 }, { seconds: "60" }] });
  assert.deepEqual([hold.seconds, hold.sets], [60, 2]);
});

test("loadLogs never throws on corrupt JSON and preserves the raw text exactly once (B10)", () => {
  const raw = '[{"id":1,"date":"2026-09-20","entries":[{"name":"ベンチプレス","weight":"60"'; // 途中で切れている
  const { store, errors } = fresh({ workout_logs: raw });
  assert.deepEqual(S.loadLogs(), []);
  assert.deepEqual(S.loadLogs(), []);
  assert.equal(store.getItem("workout_logs_corrupt"), raw);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /読み込めません/);
  // 新しい記録を保存しても退避した元データは残る
  assert.equal(S.addLog({ date: "2026-09-29", entries: [{ name: "スクワット", weight: 60, reps: 5 }] }), true);
  assert.equal(store.getItem("workout_logs_corrupt"), raw);
  assert.equal(S.loadLogs().length, 1);
  const corruptKeys = [...store.map.keys()].filter((k) => k.includes("corrupt"));
  assert.deepEqual(corruptKeys, ["workout_logs_corrupt"]);
});

test("invalid items are skipped on read but the original is quarantined before any overwrite", () => {
  const raw = JSON.stringify([
    { id: 1, date: "2026-09-20", entries: [{ name: "ベンチプレス", weight: "60", reps: "10", sets: "3" }] },
    { id: 2, date: "2026/13/45", entries: [{ name: "x" }] },
    null,
    { id: 3, date: "2026-09-21" },
  ]);
  const { store, errors } = fresh({ workout_logs: raw, workout_meta: JSON.stringify({ schema: 2 }) });
  const logs = S.loadLogs();
  assert.equal(logs.length, 1);
  assert.equal(store.getItem("workout_logs_corrupt"), raw);
  assert.equal(errors.length, 1);
});

test("quota errors: save returns false, onError gets a Japanese message, existing data stays", () => {
  const { store, errors } = fresh({}, 2000);
  assert.equal(S.addLog({ date: "2026-09-29", entries: [{ name: "ベンチプレス", weight: 60, reps: 10, sets: 3 }] }), true);
  const before = store.getItem("workout_logs");
  const huge = { date: "2026-09-29", entries: [{ name: "ベンチプレス", weight: 60, reps: 10, sets: 3, note: "x".repeat(3000) }] };
  assert.equal(S.addLog(huge), false);
  assert.equal(store.getItem("workout_logs"), before);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /保存できませんでした/);
  assert.equal(S.saveBodyweight([{ date: "2026-09-29", weight: 60, memo: "y".repeat(3000) }]), false);
  assert.equal(S.loadLogs().length, 1);
});

test("initStorage finds corrupt data up front, so a save before any load still preserves it", () => {
  const raw = '[{"id":1,"date":"2026-09-20","entries":[{"name":"ベンチプレス"'; // 途中で切れている
  const { store, status, errors } = fresh({ workout_logs: raw, workout_profile: "{oops", workout_meta: JSON.stringify({ schema: 2 }) });
  assert.deepEqual(status.corrupt.sort(), ["workout_logs", "workout_profile"]);
  assert.equal(errors.length, 1); // 同じ通知を何度も出さない
  assert.equal(store.getItem("workout_logs_corrupt"), raw);
  assert.equal(S.saveLogs([{ id: "n1", date: "2026-09-29", entries: [{ name: "スクワット", weight: 60, reps: 5 }] }]), true);
  assert.equal(store.getItem("workout_logs_corrupt"), raw);
  assert.equal(S.loadLogs().length, 1);
  // 正常なデータなら何も退避しない
  const ok = fresh({ workout_logs: JSON.stringify([{ id: "a", date: "2026-09-01", entries: [{ name: "A", weight: 1, reps: 1 }] }]), workout_meta: JSON.stringify({ schema: 2 }) });
  assert.deepEqual([ok.status.corrupt, ok.errors], [[], []]);
  assert.equal([...ok.store.map.keys()].some((k) => k.includes("corrupt")), false);
});

test("a corrupt key is not overwritten when its raw text cannot be quarantined", () => {
  const raw = "{not json" + "z".repeat(900);
  const store = new MemoryStorage({ workout_logs: raw, workout_meta: JSON.stringify({ schema: 2 }) }, 1200);
  const errors = [];
  S.initStorage({ onError: (m) => errors.push(m), storage: store });
  assert.deepEqual(S.loadLogs(), []);
  assert.equal(store.getItem("workout_logs_corrupt"), null); // 容量不足で退避できない
  assert.equal(S.saveLogs([{ id: "a", date: "2026-09-29", entries: [{ name: "ベンチプレス", weight: 1, reps: 1 }] }]), false);
  assert.equal(store.getItem("workout_logs"), raw);
  assert.ok(errors.some((m) => /保存できませんでした/.test(m)));
});

test("saveLogs validates before writing and rejects malformed input", () => {
  const { store } = fresh({});
  assert.equal(S.saveLogs("nope"), false);
  assert.equal(S.saveLogs([{ date: "2026-09-29", entries: [] }]), false);
  assert.equal(S.saveLogs([{ date: "bad", entries: [{ name: "x" }] }]), false);
  assert.equal(store.getItem("workout_logs"), null);
  assert.equal(S.addLog({ date: "2026-09-29", entries: [] }), false);
  assert.equal(S.addLog("x"), false);
});

test("addLog / updateLog / deleteLog round trip with undo", () => {
  fresh({});
  assert.equal(S.addLog({ id: "a1", date: "2026-09-28", entries: [{ name: "ベンチプレス", weight: 60, reps: 10, sets: 3 }] }), true);
  assert.equal(S.addLog({ date: "2026-09-29", entries: [{ name: "スクワット", weight: 80, reps: 5, sets: 5 }], planDay: { index: 1, title: "Day 2" } }), true);
  let logs = S.loadLogs();
  assert.deepEqual(logs.map((l) => l.date), ["2026-09-29", "2026-09-28"]);
  assert.match(logs[0].id, /^[a-z0-9-]+$/);
  assert.deepEqual(logs[0].planDay, { index: 1, title: "Day 2" });
  assert.equal(S.updateLog("a1", { entries: [{ name: "ベンチプレス", weight: "62.5", reps: "8", sets: "3" }] }), true);
  logs = S.loadLogs();
  const a1 = logs.find((l) => l.id === "a1");
  assert.equal(a1.entries[0].weight, 62.5);
  assert.equal(typeof a1.updatedAt, "number");
  assert.equal(S.updateLog("missing", { date: "2026-09-01" }), false);
  assert.equal(S.updateLog("a1", { date: "not-a-date" }), false);
  const removed = S.deleteLog("a1");
  assert.equal(removed.id, "a1");
  assert.equal(S.loadLogs().length, 1);
  assert.equal(S.deleteLog("a1"), null);
  assert.equal(S.addLog(removed), true); // 元に戻す
  assert.deepEqual(S.loadLogs().find((l) => l.id === "a1"), removed);
  assert.equal(S.loadLogs().length, 2);
});

test("ids stay stable across loads for id-less or duplicate-id logs, so delete always hits", () => {
  fresh({
    workout_meta: JSON.stringify({ schema: 2 }),
    workout_logs: JSON.stringify([
      { date: "2026-09-20", entries: [{ name: "A", weight: 1, reps: 1 }] },
      { id: "x", date: "2026-09-21", entries: [{ name: "B", weight: 1, reps: 1 }] },
      { id: "x", date: "2026-09-22", entries: [{ name: "C", weight: 1, reps: 1 }] },
      { id: '"><img src=x onerror=alert(1)>', date: "2026-09-23", entries: [{ name: "D", weight: 1, reps: 1 }] },
    ]),
  });
  const ids1 = S.loadLogs().map((l) => l.id);
  const ids2 = S.loadLogs().map((l) => l.id);
  assert.deepEqual(ids1, ids2);
  assert.equal(new Set(ids1).size, 4);
  assert.ok(ids1.every((id) => /^[A-Za-z0-9_.:-]+$/.test(id)), ids1.join(","));
  const target = S.loadLogs().find((l) => l.entries[0].name === "D");
  assert.ok(S.deleteLog(target.id));
  assert.equal(S.loadLogs().length, 3);
});

test("same-date logs without timestamps keep a stable order across save/load cycles", () => {
  const { store } = fresh({
    workout_meta: JSON.stringify({ schema: 2 }),
    workout_logs: JSON.stringify([
      { id: "imp-2", date: "2026-09-20", entries: [{ name: "A", weight: 1, reps: 1 }] },
      { id: "imp-10", date: "2026-09-20", entries: [{ name: "B", weight: 1, reps: 1 }] },
      { date: "2026-09-20", entries: [{ name: "C", weight: 1, reps: 1 }] },
      { id: "1790652957357", date: "2026-09-20", entries: [{ name: "D", weight: 1, reps: 1 }] },
    ]),
  });
  const order = () => S.loadLogs().map((l) => l.entries[0].name).join("");
  const first = order();
  assert.equal(first[0], "D"); // 保存時刻の分かる記録が同じ日付の中で最新
  for (let i = 0; i < 3; i++) {
    assert.equal(S.saveLogs(S.loadLogs()), true);
    assert.equal(order(), first, `cycle ${i}`);
  }
  // 入力の向き(古い順/新しい順)に関係なく同じ結果
  const logs = S.loadLogs();
  assert.deepEqual(S.normalizeLogs([...logs].reverse()).logs, logs);
  assert.deepEqual(JSON.parse(store.getItem("workout_logs")).map((l) => l.entries[0].name).join(""), [...first].reverse().join(""));
});

test("profile is validated against the app's option lists", () => {
  fresh({});
  assert.equal(S.loadProfile(), null);
  assert.equal(S.saveProfile({ weight: "70", height: 175, age: 40, gender: "女性", goal: "cut", level: "advanced", frequency: "5", focus: ['chest"]', "back", "cardio", "back"], equipment: ["dumbbell", "rocket"], extra: 1 }), true);
  const p = S.loadProfile();
  assert.deepEqual(
    [p.weight, p.height, p.age, p.gender, p.goal, p.level, p.frequency, p.focus, p.equipment, p.extra],
    [70, 175, 40, "女性", "cut", "advanced", 5, ["back"], ["dumbbell"], 1],
  );
  const bad = S.normalizeProfile({ weight: 9999, gender: "<b>", goal: "x", frequency: 99, focus: "chest" });
  assert.deepEqual([bad.weight, bad.gender, bad.goal, bad.frequency, bad.focus], [65, "その他・回答しない", "hypertrophy", 3, []]);
  assert.equal(S.normalizeProfile("x"), null);
  assert.equal(S.normalizeProfile([1]), null);
});

test("bodyweight: validated, deduplicated by date, sorted", () => {
  const { errors } = fresh({});
  assert.equal(S.saveBodyweight([{ date: "2026-09-29", weight: "64.5" }, { date: "2026-09-28", weight: 65 }, { date: "2026-09-29", weight: 64 }]), true);
  assert.deepEqual(S.loadBodyweight(), [{ date: "2026-09-28", weight: 65 }, { date: "2026-09-29", weight: 64 }]);
  assert.equal(S.saveBodyweight([null]), false);
  assert.equal(S.saveBodyweight([{ date: "2026-09-29", weight: 5 }]), false);
  assert.ok(errors.length >= 1);
  fresh({ bodyweight_logs: JSON.stringify([null, { date: "2026-09-01", weight: "abc" }, { date: "2026-09-02", weight: "70" }]), workout_meta: JSON.stringify({ schema: 2 }) });
  assert.deepEqual(S.loadBodyweight(), [{ date: "2026-09-02", weight: 70 }]);
});

test("plan / draft / session / meta storage", () => {
  const { store } = fresh({});
  assert.equal(S.loadPlan(), null);
  const plan = { bmi: { value: 22 }, splitName: "全身", days: [{ title: "Day 1", exercises: [] }] };
  assert.equal(S.savePlan({ plan, profile: { weight: 60 }, modified: true }), true);
  const rec = S.loadPlan();
  assert.equal(rec.v, 1);
  assert.equal(rec.modified, true);
  assert.deepEqual(rec.plan, plan);
  assert.equal(rec.profile.weight, 60);
  assert.equal(typeof rec.savedAt, "number");
  assert.equal(S.savePlan({ plan: { days: "x" } }), false);
  assert.equal(S.clearPlan(), true);
  assert.equal(S.loadPlan(), null);
  store.setItem("workout_plan", "{broken");
  assert.equal(S.loadPlan(), null);

  assert.equal(S.loadDraft(), null);
  assert.equal(S.saveDraft({ date: "2026-09-29", rows: [1] }), true);
  assert.deepEqual(S.loadDraft().rows, [1]);
  assert.equal(S.saveDraft("x"), false);
  S.clearDraft();
  assert.equal(S.loadDraft(), null);

  assert.equal(S.saveSession({ startedAt: 1, day: { title: "Day 1" } }), true);
  assert.equal(S.loadSession().day.title, "Day 1");
  assert.equal(typeof S.loadSession().savedAt, "number");
  S.clearSession();
  assert.equal(S.loadSession(), null);

  assert.equal(S.setMeta({ foo: 1 }), true);
  assert.equal(S.getMeta().foo, 1);
  assert.equal(S.setMeta({ foo: undefined }), true);
  assert.equal("foo" in S.getMeta(), false);
  store.setItem("workout_meta", "garbage");
  assert.equal(S.getMeta().schema, S.SCHEMA_VERSION);
});

test("validateBackup rejects bad files with Japanese messages and never writes (B02)", () => {
  const { store } = fresh({});
  S.addLog({ id: "keep", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  const snapshot = JSON.stringify(store.dump());
  const cases = [
    ["hello, this is not json", /JSON/],
    [JSON.stringify({ app: "something-else", logs: [] }), /バックアップではありません/],
    [JSON.stringify({ logs: [] }), /バックアップではありません/],
    [JSON.stringify({ app: "ai-workout-planner" }), /バックアップではありません/],
    [JSON.stringify([1, 2]), /バックアップではありません/],
    [JSON.stringify({ app: "ai-workout-planner", schema: 99, logs: [] }), /新しいバージョン/],
    [JSON.stringify({ app: "ai-workout-planner", logs: [{ date: "2026-09-01" }, null, { date: 5, entries: [] }] }), /有効な記録/],
    // 記録が全滅なら、体重だけ読めても受け付けない(置き換えで端末の記録が消えるため)
    [JSON.stringify({ app: "ai-workout-planner", logs: [{ date: "2026/13/45", entries: [{ name: "x" }] }], bodyweight: [{ date: "2026-09-01", weight: 60 }] }), /有効な記録/],
  ];
  for (const [input, re] of cases) {
    const r = S.validateBackup(input);
    assert.equal(r.ok, false, input);
    assert.match(r.errors[0], re);
    assert.equal(r.data, null);
  }
  assert.equal(JSON.stringify(store.dump()), snapshot);
});

test("validateBackup keeps the valid part and reports what it skipped", () => {
  fresh({});
  const file = {
    app: "ai-workout-planner",
    exportedAt: "2026-09-20T00:00:00.000Z",
    logs: [
      { id: 1, date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: "60", sets: "3", reps: "10" }] },
      { id: 2, date: "2026/09/20", entries: [{ name: "スクワット", weight: 80, reps: 5 }, { name: 42 }, { weight: 3 }] },
      { id: 3, date: "2026-13-45", entries: [{ name: "x" }] },
      { id: '"><script>window.__xss=1</script>', date: "2026-09-21", entries: [{ name: "デッドリフト", weight: 100, reps: 3 }] },
      { id: 5, date: "2026-09-22" },
      null,
    ],
    bodyweight: [null, { date: "2026-09-01", weight: "64.5" }, { date: "2026-09-02", weight: 999 }],
    profile: { weight: 70, height: 170, age: 30, focus: ['chest"]'], equipment: ["dumbbell"] },
  };
  const r = S.validateBackup(file);
  assert.equal(r.ok, true);
  assert.equal(r.data.logs.length, 3);
  assert.deepEqual(r.data.logs.map((l) => l.date).sort(), ["2026-09-01", "2026-09-20", "2026-09-21"]);
  assert.ok(r.data.logs.every((l) => /^[A-Za-z0-9_.:-]+$/.test(l.id)));
  assert.equal(r.data.counts.droppedLogs, 3);
  assert.equal(r.data.counts.droppedEntries, 2); // 名前なし1件 + 日付不正の記録の1件
  assert.deepEqual(r.data.bodyweight, [{ date: "2026-09-01", weight: 64.5 }]);
  assert.deepEqual(r.data.profile.focus, []);
  assert.ok(r.warnings.length >= 2);
  assert.ok(r.warnings.every((w) => /スキップ/.test(w) || /プロフィール/.test(w)));
  // 名前が数値の種目は文字列化して残す
  assert.ok(r.data.logs.some((l) => l.entries.some((e) => e.name === "42")));
  // 旧バックアップ(schema なし)も読める
  assert.equal(S.validateBackup({ app: "ai-workout-planner", logs: [] }).ok, true);
});

test("applyBackup replace → undo restores the exact previous state", () => {
  const { store } = fresh({});
  S.addLog({ id: "local", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  S.saveProfile({ weight: 60, height: 160, age: 20 });
  S.saveBodyweight([{ date: "2026-09-01", weight: 60 }]);
  const before = JSON.stringify(store.dump());
  const v = S.validateBackup({ app: "ai-workout-planner", logs: [{ id: 9, date: "2026-08-01", entries: [{ name: "スクワット", weight: 50, reps: 5 }] }], bodyweight: [], profile: { weight: 80, height: 180, age: 50 } });
  const res = S.applyBackup(v.data, "replace");
  assert.equal(res.ok, true);
  assert.deepEqual(S.loadLogs().map((l) => l.id), ["9"]);
  assert.equal(S.loadProfile().weight, 80);
  assert.deepEqual(S.loadBodyweight(), []);
  assert.equal(typeof S.getMeta().lastImportUndo.at, "string");
  assert.equal(res.undo(), true);
  const after = store.dump();
  delete after.workout_meta;
  const expected = JSON.parse(before);
  delete expected.workout_meta;
  assert.deepEqual(after, expected);
  assert.equal(S.getMeta().lastImportUndo, undefined);
});

test("applyBackup merge: importing the same backup twice adds nothing and never drops local logs", () => {
  fresh({});
  S.addLog({ id: "l1", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  S.addLog({ id: "l2", date: "2026-09-10", entries: [{ name: "スクワット", weight: 80, reps: 5 }] });
  S.saveBodyweight([{ date: "2026-09-01", weight: 60 }]);
  const backup = S.buildBackup();
  const older = { ...backup, logs: [...backup.logs, { id: "old", date: "2026-08-01", entries: [{ name: "デッドリフト", weight: 100, reps: 3 }] }], bodyweight: [{ date: "2026-09-01", weight: 99 }, { date: "2026-08-01", weight: 61 }] };
  const v = S.validateBackup(JSON.stringify(older));
  const r1 = S.applyBackup(v.data, "merge");
  assert.equal(r1.ok, true);
  assert.deepEqual([r1.added, r1.skipped], [1, 2]);
  assert.equal(S.loadLogs().length, 3);
  assert.deepEqual(S.loadBodyweight(), [{ date: "2026-08-01", weight: 61 }, { date: "2026-09-01", weight: 60 }]);
  const r2 = S.applyBackup(v.data, "merge");
  assert.deepEqual([r2.added, r2.skipped], [0, 3]);
  assert.equal(S.loadLogs().length, 3);
  // 同じ内容で id だけ違う記録も重複として扱う
  const dup = S.validateBackup({ app: "ai-workout-planner", logs: [{ id: "other-id", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] }] });
  assert.equal(S.applyBackup(dup.data, "merge").added, 0);
  // 取り消しで統合前に戻る
  assert.equal(r1.undo(), true);
  assert.equal(S.loadLogs().length, 2);
});

test("applyBackup rolls back automatically when storage fills up midway", () => {
  const { store } = fresh({}, 3000);
  S.addLog({ id: "l1", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  const before = store.getItem("workout_logs");
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, date: "2026-08-01", entries: [{ name: "スクワット", weight: 50, reps: 5 }] }));
  const v = S.validateBackup({ app: "ai-workout-planner", logs: many });
  const r = S.applyBackup(v.data, "replace");
  assert.equal(r.ok, false);
  assert.match(r.error, /保存できませんでした/);
  assert.equal(store.getItem("workout_logs"), before);
});

test("undoLastImport works after a reload (from the stored snapshot)", () => {
  const { store } = fresh({});
  S.addLog({ id: "mine", date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  const logsBefore = store.getItem("workout_logs");
  const v = S.validateBackup({ app: "ai-workout-planner", logs: [{ id: 1, date: "2026-08-01", entries: [{ name: "スクワット", weight: 50, reps: 5 }] }] });
  assert.equal(S.applyBackup(v.data).ok, true);
  assert.notEqual(store.getItem("workout_logs"), logsBefore);
  // 別セッション(再読み込み)を想定して初期化し直す
  const reopened = new MemoryStorage(store.dump());
  S.initStorage({ storage: reopened });
  assert.equal(S.undoLastImport(), true);
  assert.equal(reopened.getItem("workout_logs"), logsBefore);
  assert.equal(S.undoLastImport(), false);
});

test("buildBackup never throws and carries raw text of corrupt keys", () => {
  fresh({ workout_profile: "{oops", workout_logs: JSON.stringify([{ id: 1, date: "2026-09-01", entries: [{ name: "ベンチプレス", weight: "60", reps: "10" }] }]) });
  const b = S.buildBackup();
  assert.equal(b.app, "ai-workout-planner");
  assert.equal(b.schema, S.SCHEMA_VERSION);
  assert.equal(b.logs.length, 1);
  assert.equal(b.profile, null);
  assert.equal(b.raw.workout_profile, "{oops");
  assert.equal(b.raw.workout_profile_corrupt, "{oops");
  // 書き出したファイルはそのまま読み込める
  const round = S.validateBackup(JSON.stringify(b));
  assert.equal(round.ok, true);
  assert.equal(round.data.logs[0].entries[0].weight, 60);
});

test("backupFileName uses the local date; backupStatus nudges when a backup is overdue", () => {
  fresh({});
  assert.equal(S.backupFileName(new Date(2026, 8, 29, 7, 30)), "workout-backup-2026-09-29.json");
  for (let i = 0; i < 6; i++) S.addLog({ date: `2026-09-0${i + 1}`, entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  let st = S.backupStatus(new Date(2026, 8, 29, 12));
  assert.deepEqual([st.lastBackupAt, st.shouldNudge, st.newLogs], [null, true, 6]);
  assert.equal(S.markBackup(new Date(2026, 8, 29, 12)), true);
  st = S.backupStatus(new Date(2026, 8, 30, 12));
  assert.deepEqual([st.daysSince, st.newLogs, st.shouldNudge], [1, 0, false]);
  S.addLog({ date: "2026-09-30", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
  st = S.backupStatus(new Date(2026, 9, 20, 12));
  assert.deepEqual([st.daysSince, st.newLogs, st.shouldNudge], [21, 1, true]);
});

test("backupFileName is correct at 07:30 JST (B01) — checked in a TZ=Asia/Tokyo process", () => {
  const url = new URL("../js/storage.js", import.meta.url).href;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { backupFileName } from ${JSON.stringify(url)}; console.log(backupFileName(new Date("2026-09-29T07:30:00+09:00")));`],
  { env: { ...process.env, TZ: "Asia/Tokyo" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "workout-backup-2026-09-29.json");
});

test("renameExercise merges free-typed names and can be undone (I44)", () => {
  fresh({ workout_meta: JSON.stringify({ schema: 2 }), workout_logs: JSON.stringify(LEGACY_LOGS) });
  const r = S.renameExercise("ベンチ", "ベンチプレス");
  assert.deepEqual([r.ok, r.count], [true, 1]);
  const e = find(S.loadLogs(), "2026-06-08", "ベンチプレス");
  assert.equal(e.originalName, "ベンチ");
  assert.equal(r.undo(), true);
  assert.ok(find(S.loadLogs(), "2026-06-08", "ベンチ"));
  assert.equal(S.renameExercise("ベンチ", "ベンチ").ok, false);
});

test("requestPersistentStorage is best-effort", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const set = (v) => Object.defineProperty(globalThis, "navigator", { value: v, configurable: true, writable: true });
  try {
    set({ storage: { persisted: async () => false, persist: async () => true } });
    assert.equal(await S.requestPersistentStorage(), true);
    set({ storage: { persisted: async () => true, persist: async () => { throw new Error("no"); } } });
    assert.equal(await S.requestPersistentStorage(), true);
    set({ storage: { persist: async () => { throw new Error("denied"); } } });
    assert.equal(await S.requestPersistentStorage(), false);
    set({});
    assert.equal(await S.requestPersistentStorage(), false);
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
    else delete globalThis.navigator;
  }
});

test("blocked localStorage falls back to memory and reports once", () => {
  const url = new URL("../js/storage.js", import.meta.url).href;
  const code = `
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("SecurityError"); }, configurable: true });
    const S = await import(${JSON.stringify(url)});
    const errors = [];
    const st = S.initStorage({ onError: (m) => errors.push(m) });
    const ok = S.addLog({ date: "2026-09-29", entries: [{ name: "ベンチプレス", weight: 60, reps: 10 }] });
    console.log(JSON.stringify({ available: st.available, ok, n: S.loadLogs().length, errors }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.available, false);
  assert.equal(out.ok, true);
  assert.equal(out.n, 1);
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /保存できません/);
});

test("uses globalThis.localStorage when no storage is injected", () => {
  const url = new URL("../js/storage.js", import.meta.url).href;
  const code = `
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    m.set("anthropic_api_key", "sk-ant-x");
    const S = await import(${JSON.stringify(url)});
    const st = S.initStorage({});
    console.log(JSON.stringify({ removed: st.removedLegacyKey, key: m.get("anthropic_api_key") ?? null, available: st.available }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { removed: true, key: null, available: true });
});
