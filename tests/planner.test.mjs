// planner.js(メニュー生成・種目DB)の単体テスト。実行: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as planner from "../js/planner.js?v=14";

const {
  generatePlan, alternativeExercise, alternativeCardio, hasAlternative, adjustPlanVolume, canAdjustVolume,
  shortenPlan, estimateMinutes, progressionTarget, analyzeLogs, pickWorkingSet, weeklySets,
  getExerciseInfo, getExerciseTrack, getExerciseTip, getDistanceUnit, isPoolExercise, parseRestSeconds,
  exerciseChoices, exercisesByMuscle, allExerciseNames, WEIGHT_CHOICES, PRESETS, MACHINE_KEYS,
  MUSCLE_LABELS, SUB_MUSCLES,
} = planner;

const NOW = new Date(2026, 8, 29, 12, 0, 0); // 2026-09-29 12:00(ローカル時刻)
const EQ = {
  gym: PRESETS.gym.keys,
  home: PRESETS.home.keys,
  home_db: PRESETS.home_db.keys,
  machine: ["machine"],
  barbell: ["barbell", "bench"],
  pool: ["pool"],
  band: ["band", "pullup_bar"],
};
const GOAL_KEYS = ["hypertrophy", "cut", "strength", "health"];
const LEVEL_KEYS = ["beginner", "intermediate", "advanced"];
const LEVEL_NUM = { beginner: 1, intermediate: 2, advanced: 3 };

const profileOf = (o = {}) => ({
  weight: 70, height: 172, age: 30, gender: "男性", goal: "hypertrophy", level: "intermediate",
  frequency: 3, equipment: EQ.gym, focus: [], ...o,
});
const planOf = (o, logs = []) => generatePlan(profileOf(o), logs, NOW);
const clone = (x) => JSON.parse(JSON.stringify(x));
const liftDays = (plan) => plan.days.filter((d) => d.type === "lift");
const range = (reps) => {
  const m = String(reps).match(/(\d+)(?:〜(\d+))?/);
  return m ? { lo: Number(m[1]), hi: Number(m[2] ?? m[1]) } : null;
};
const available = (equipment) => {
  const set = new Set(equipment);
  if (set.has("machine")) for (const k of MACHINE_KEYS) set.add(k);
  return set;
};
const infoOf = (name) => {
  const info = getExerciseInfo(name);
  assert.ok(info, `unknown exercise in plan: ${name}`);
  return info;
};
// 並び順の階層: 0=複合(腕以外) 1=腕の複合 2=単関節 3=体幹・キープ
const tierOf = (name) => {
  const i = infoOf(name);
  if (i.muscle === "core" || i.track === "time") return 3;
  if (i.kind !== "compound") return 2;
  return i.muscle === "arms" ? 1 : 0;
};
const PUSH_PATTERNS = new Set(["h_push", "incline_push", "chest_fly", "v_push"]);
const HIGH_IMPACT = new Set(["ランニング", "バーピー", "ジャンピングジャック+その場ジョギング"]);

// 全組み合わせ(目的×レベル×頻度×器具×強化部位)を1回だけ生成して使い回す
const FOCUS_SETS = [[], ["arms"], ["legs"], ["shoulders", "core"]];
const MATRIX = [];
for (const goal of GOAL_KEYS) {
  for (const level of LEVEL_KEYS) {
    for (const [eq, equipment] of Object.entries(EQ)) {
      for (let frequency = 1; frequency <= 7; frequency++) {
        for (const focus of FOCUS_SETS) {
          const profile = profileOf({ goal, level, frequency, equipment, focus });
          MATRIX.push({ key: `${goal}/${level}/${eq}/f${frequency}/[${focus}]`, goal, level, eq, frequency, focus, profile, plan: generatePlan(profile, [], NOW) });
        }
      }
    }
  }
}
const noFocus = MATRIX.filter((m) => m.focus.length === 0);

// 失敗を集めてまとめて報告する(最初の数件だけ表示)
function expectNone(failures, label) {
  assert.equal(failures.length, 0, `${label}: ${failures.length} 件\n${failures.slice(0, 8).join("\n")}`);
}

test("既存のエクスポート名と定数が維持されている", () => {
  for (const name of [
    "generatePlan", "allExerciseNames", "exerciseChoices", "getExerciseTrack", "getExerciseTip", "getDistanceUnit",
    "alternativeExercise", "alternativeCardio", "adjustPlanVolume", "shortenPlan", "estimate1RM", "calcBmi",
    "exercisesByMuscle", "analyzeLogs", "progressionTarget", "estimateMinutes", "isPoolExercise",
  ]) {
    assert.equal(typeof planner[name], "function", name);
  }
  for (const name of ["EQUIPMENT", "EQUIPMENT_GROUPS", "PRESETS", "MACHINE_KEYS", "MUSCLE_LABELS", "GOALS", "LEVELS", "WEIGHT_CHOICES"]) {
    assert.ok(planner[name], name);
  }
  assert.deepEqual(Object.keys(MUSCLE_LABELS), ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"]);
  for (const sub of Object.values(SUB_MUSCLES)) assert.ok(sub.group in MUSCLE_LABELS && sub.group !== "cardio");
  assert.equal(planner.estimate1RM(100, 1), 100);
  assert.equal(planner.estimate1RM(100, 10), 133.3);
  assert.equal(planner.estimate1RM(0, 10), null);
  assert.deepEqual(planner.calcBmi(70, 175), { value: 22.9, category: "普通体重" });
});

test("種目DB: 既存の種目名が残り、すべてに解説・記録方式がある", () => {
  const names = allExerciseNames();
  assert.equal(new Set(names).size, names.length, "種目名の重複");
  for (const legacy of ["ベンチプレス", "デッドリフト", "ルーマニアンデッドリフト", "スーパーマン(バックエクステンション)",
    "ディップス(椅子・台を利用)", "ジャンピングジャック+その場ジョギング", "水泳(クロール)", "ウォールシット(空気椅子)", "ケトルベルスイング"]) {
    assert.ok(names.includes(legacy), legacy);
  }
  for (const name of names) {
    assert.ok(getExerciseTip(name).length > 5, `tip: ${name}`);
    assert.equal(getExerciseTrack(name), infoOf(name).track);
  }
  assert.equal(getExerciseTrack("プランク"), "time");
  assert.equal(getExerciseTrack("水泳(平泳ぎ)"), "cardio");
  assert.equal(getExerciseTrack("未知の種目"), "weight");
  // デッドリフトは背中のグループのまま(記録フォーム・集計の互換)
  const weightGroups = exerciseChoices("weight");
  assert.ok(weightGroups.find((g) => g.label === "背中").names.includes("デッドリフト"));
  assert.ok(exerciseChoices("time")[0].names.includes("片脚立ち"));
  assert.ok(exerciseChoices("cardio")[0].names.includes("ウォーキング(早歩き)"));
  assert.equal(exercisesByMuscle().length, 7);
});

test("WEIGHT_CHOICES: 0・1〜10kg・ダンベル規格・2.5kg刻み(300kgまで)の昇順", () => {
  assert.equal(WEIGHT_CHOICES[0], 0);
  for (let i = 1; i < WEIGHT_CHOICES.length; i++) assert.ok(WEIGHT_CHOICES[i] > WEIGHT_CHOICES[i - 1]);
  for (let v = 1; v <= 10; v++) assert.ok(WEIGHT_CHOICES.includes(v), `${v}`);
  for (let v = 12; v <= 32; v += 2) assert.ok(WEIGHT_CHOICES.includes(v), `${v}`);
  for (let v = 2.5; v <= 300; v += 2.5) assert.ok(WEIGHT_CHOICES.includes(v), `${v}`);
  assert.equal(WEIGHT_CHOICES.at(-1), 300);
  assert.ok(!WEIGHT_CHOICES.includes(11) && !WEIGHT_CHOICES.includes(33));
});

test("isPoolExercise / getDistanceUnit / parseRestSeconds", () => {
  assert.equal(isPoolExercise("水泳(クロール)"), true);
  assert.equal(isPoolExercise("水中ウォーキング"), true);
  assert.equal(isPoolExercise("ランニング"), false);
  assert.equal(isPoolExercise("プールでスイム"), true);
  assert.equal(getDistanceUnit("ビート板キック"), "m");
  assert.equal(getDistanceUnit("エアロバイク"), "km");
  assert.equal(parseRestSeconds("2〜3分"), 120);
  assert.equal(parseRestSeconds("90〜120秒"), 90);
  assert.equal(parseRestSeconds("60秒"), 60);
  assert.equal(parseRestSeconds(""), 0);
});

test("プランの形(SPEC の Plan / Day / Ex)を守る", () => {
  const fails = [];
  for (const { key, plan, frequency } of MATRIX) {
    for (const k of ["bmi", "splitName", "repScheme", "focusLabels", "advice", "days"]) if (!(k in plan)) fails.push(`${key} no ${k}`);
    if (plan.days.length !== frequency) fails.push(`${key} days=${plan.days.length}`);
    if (!Array.isArray(plan.advice.tips) || !plan.advice.protein || !plan.advice.calories) fails.push(`${key} advice`);
    for (const d of plan.days) {
      if (!/^Day \d+:/.test(d.title)) fails.push(`${key} title ${d.title}`);
      if (!Array.isArray(d.warmup) || !Array.isArray(d.cooldown) || !Array.isArray(d.exercises)) fails.push(`${key} ${d.title} arrays`);
      if (!(d.estMinutes > 0) || d.estMinutes % 5 !== 0) fails.push(`${key} ${d.title} estMinutes=${d.estMinutes}`);
      if (d.estMinutes !== estimateMinutes(d)) fails.push(`${key} ${d.title} estMinutes mismatch`);
      if (typeof d.focusSummary !== "string" || !d.focusSummary) fails.push(`${key} ${d.title} focusSummary`);
      if (d.cardio !== null) {
        const c = d.cardio;
        if (typeof c.name !== "string" || typeof c.duration !== "string" || typeof c.isPool !== "boolean" || !("note" in c)) {
          fails.push(`${key} ${d.title} cardio shape`);
        }
      }
      for (const ex of d.exercises) {
        const ok = typeof ex.name === "string" && ex.muscle in MUSCLE_LABELS && ["weight", "time"].includes(ex.track) &&
          typeof ex.tip === "string" && ["main", "accessory"].includes(ex.role) && Number.isInteger(ex.sets) &&
          typeof ex.reps === "string" && typeof ex.rest === "string" && (ex.note === null || typeof ex.note === "string") &&
          typeof ex.focused === "boolean";
        if (!ok) fails.push(`${key} ${d.title} ${ex.name} shape`);
      }
    }
  }
  expectNone(fails, "shape");
  // JSON に直列化しても壊れない(保存・復元用)
  const p = MATRIX[0].plan;
  const round = JSON.parse(JSON.stringify(p));
  assert.equal(round.days.length, p.days.length);
});

test("同じ入力なら同じプラン(決定的)・入力(プロフィール・記録)を書き換えない", () => {
  for (const o of [{}, { frequency: 6, focus: ["arms"] }, { equipment: EQ.home, level: "beginner", frequency: 4 }]) {
    assert.deepEqual(clone(planOf(o)), clone(planOf(o)));
  }
  const deepFreeze = (x) => {
    if (x && typeof x === "object") {
      for (const v of Object.values(x)) deepFreeze(v);
      Object.freeze(x);
    }
    return x;
  };
  const logs = [{ date: "2026-09-26", entries: [
    { name: "ベンチプレス", weight: 40, reps: 10, sets: 1 },
    { name: "ベンチプレス", weight: 80, reps: 8, sets: 3, setDetails: [{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }] },
    { name: "水泳(平泳ぎ)", track: "cardio", minutes: 30, distance: 600, unit: "m" },
  ] }];
  const profile = profileOf({ frequency: 5, focus: ["chest"], equipment: [...EQ.gym, "pool"] });
  const a = generatePlan(deepFreeze(clone(profile)), deepFreeze(clone(logs)), NOW);
  assert.deepEqual(clone(a), clone(generatePlan(profile, logs, NOW)));
  alternativeExercise(deepFreeze(clone(profile)), deepFreeze(clone(logs)), deepFreeze(clone(a.days[0])), 0, NOW);
});

test("各日: 種目の重複なし・器具とレベルの範囲内(レベル制限を超えない B19)", () => {
  const fails = [];
  for (const { key, plan, profile } of MATRIX) {
    const avail = available(profile.equipment);
    for (const d of plan.days) {
      const names = d.exercises.map((e) => e.name);
      if (new Set(names).size !== names.length) fails.push(`${key} ${d.title} duplicate`);
      if (d.type === "lift" && (names.length < 3 || names.length > 8)) fails.push(`${key} ${d.title} count ${names.length}`);
      for (const ex of d.exercises) {
        const i = infoOf(ex.name);
        if (i.level > LEVEL_NUM[profile.level]) fails.push(`${key} ${d.title} level ${ex.name}`);
        if (!i.equipment.every((t) => avail.has(t))) fails.push(`${key} ${d.title} equipment ${ex.name}`);
        if (ex.tip !== i.tip || ex.track !== i.track || ex.muscle !== i.muscle) fails.push(`${key} ${ex.name} meta`);
      }
    }
  }
  expectNone(fails, "day content");
});

test("並び順: 複合→腕の複合→単関節→体幹・キープ。★は同じ種類の中で先頭(B20)", () => {
  const fails = [];
  for (const { key, plan } of MATRIX) {
    for (const d of liftDays(plan)) {
      const tiers = d.exercises.map((e) => tierOf(e.name));
      for (let i = 1; i < tiers.length; i++) if (tiers[i] < tiers[i - 1]) fails.push(`${key} ${d.title} ${d.exercises.map((e) => e.name)}`);
      // 同じ階層の中で ★ の後ろに ★ なしが来てから ★ が現れない
      for (let t = 0; t <= 3; t++) {
        const flags = d.exercises.filter((e) => tierOf(e.name) === t).map((e) => e.focused);
        const firstPlain = flags.indexOf(false);
        if (firstPlain >= 0 && flags.slice(firstPlain).includes(true)) fails.push(`${key} ${d.title} focus order tier ${t}`);
      }
      // メイン(main)はその日の最初の種目。メインは1つだけ
      const mains = d.exercises.filter((e) => e.tier === "main");
      if (mains.length > 1 || (mains.length === 1 && d.exercises[0].tier !== "main")) fails.push(`${key} ${d.title} main`);
    }
  }
  expectNone(fails, "order");
});

test("ヒンジ: 上半身/Push/Pull と全身A には入れない・1日1種目・連続する日に置かない(B18)", () => {
  const fails = [];
  for (const { key, plan } of MATRIX) {
    const hinge = plan.days.map((d) => d.exercises.filter((e) => infoOf(e.name).pattern === "hinge").length);
    plan.days.forEach((d, i) => {
      if (hinge[i] > 1) fails.push(`${key} ${d.title} ${hinge[i]} hinges`);
      if (hinge[i] > 0 && (["upper", "push", "pull"].includes(d.split) || /全身A/.test(d.title))) fails.push(`${key} ${d.title} has hinge`);
      if (i > 0 && hinge[i] > 0 && hinge[i - 1] > 0) fails.push(`${key} adjacent hinge ${plan.days[i - 1].title} / ${d.title}`);
    });
  }
  expectNone(fails, "hinge");
});

test("Push の日にカールなし・Pull の日にプレスや三頭なし(B17)", () => {
  const fails = [];
  for (const { key, plan } of MATRIX) {
    for (const d of plan.days) {
      const pats = d.exercises.map((e) => infoOf(e.name).pattern);
      if (d.split === "push" && pats.includes("biceps")) fails.push(`${key} ${d.title} curl`);
      if (d.split === "pull" && pats.some((p) => p === "triceps" || PUSH_PATTERNS.has(p))) fails.push(`${key} ${d.title} press`);
    }
  }
  expectNone(fails, "push/pull");
});

test("細かい筋肉: 週3回以上なら三頭・二頭・肩の側部・もも裏・ふくらはぎを必ず鍛える(B17)", () => {
  const fails = [];
  for (const m of noFocus) {
    if (m.frequency < 3) continue;
    const tot = weeklySets(m.plan);
    // 自重のみ(自宅・プール)でもペットボトルのサイドレイズで肩の側部を鍛える
    const need = ["triceps", "biceps", "hamstrings", "calves", "chest", "back", "quads", "core", "side_delt"];
    for (const k of need) if (!(tot[k] > 0)) fails.push(`${m.key} ${k}=0`);
  }
  expectNone(fails, "coverage");
  // 週1〜2回でも、スクワット・ヒンジ・押す・引く の基本動作がそろう(B17)
  for (const m of noFocus.filter((x) => x.frequency <= 2)) {
    const pats = new Set(m.plan.days.flatMap((d) => d.exercises.map((e) => e.pattern)));
    const has = (list) => list.some((p) => pats.has(p));
    if (!has(["squat", "lunge"])) fails.push(`${m.key} no squat`);
    if (!has(["hinge", "glute"])) fails.push(`${m.key} no hinge`);
    if (!has(["h_push", "incline_push", "v_push"])) fails.push(`${m.key} no push`);
    if (!has(["h_pull", "v_pull"])) fails.push(`${m.key} no pull`);
  }
  expectNone(fails, "basic patterns f1-2");
  // マシンのみでも下半身の日にレッグカールが入る
  for (const f of [4, 5, 6]) {
    const plan = planOf({ equipment: ["machine"], frequency: f });
    for (const d of plan.days.filter((x) => x.split === "lower" || x.split === "legs")) {
      assert.ok(d.exercises.some((e) => e.name === "レッグカール"), `machine f${f} ${d.title}`);
    }
  }
});

test("背中: 上半身・Pull の日には必ずローかプルダウン系がある(ジムの全組み合わせで週0にならない)", () => {
  const fails = [];
  for (const m of MATRIX.filter((x) => x.eq === "gym" || x.eq === "machine" || x.eq === "home_db")) {
    let pulls = 0;
    for (const d of liftDays(m.plan)) {
      const n = d.exercises.filter((e) => ["h_pull", "v_pull"].includes(infoOf(e.name).pattern)).length;
      pulls += n;
      if ((d.split === "upper" || d.split === "pull") && n === 0) fails.push(`${m.key} ${d.title}`);
    }
    if (pulls === 0) fails.push(`${m.key} no rows/pulldowns`);
  }
  expectNone(fails, "pulls");
});

test("分割法: 週3回以上は主要部位を週2日以上・A/B で内容を変える(I06)", () => {
  const fails = [];
  for (const m of MATRIX) {
    const lift = liftDays(m.plan);
    if (lift.length >= 3) {
      for (const g of ["chest", "back", "shoulders", "legs", "core"]) {
        const days = lift.filter((d) => d.exercises.some((e) => (SUB_MUSCLES[e.sub]?.group ?? e.muscle) === g)).length;
        if (days < 2) fails.push(`${m.key} ${g} on ${days} days`);
      }
    }
    if (m.focus.length === 0 && [2, 4, 6].includes(lift.length)) {
      const sigs = new Set(lift.map((d) => d.exercises.map((e) => e.name).join("|")));
      if (sigs.size !== lift.length) fails.push(`${m.key} identical days`);
    }
    if (m.frequency === 7 && !m.plan.days.some((d) => d.type === "recovery")) fails.push(`${m.key} f7 no rest`);
    if (lift.length > 6) fails.push(`${m.key} ${lift.length} lifting days`);
  }
  expectNone(fails, "split");
  // 週4回の上半身A/B は共通種目が2つまで(マシンのみは種目の選択肢が少ないので4つまで)
  for (const [eq, limit] of [["gym", 2], ["home_db", 2], ["machine", 4]]) {
    for (const level of LEVEL_KEYS) {
      const plan = planOf({ frequency: 4, equipment: EQ[eq], level });
      for (const [x, y] of [[0, 2], [1, 3]]) {
        const a = new Set(plan.days[x].exercises.map((e) => e.name));
        const shared = plan.days[y].exercises.filter((e) => a.has(e.name)).length;
        assert.ok(shared <= limit, `${eq} ${level} day${x + 1}/day${y + 1} share ${shared}`);
      }
    }
  }
  // 初心者・週3回はどの日も6種目まで
  for (const eq of Object.keys(EQ)) {
    for (const d of planOf({ level: "beginner", frequency: 3, equipment: EQ[eq] }).days) {
      assert.ok(d.exercises.length <= 6, `${eq} ${d.title}`);
    }
  }
});

test("分割法: 週7回・初心者の週5回以上はアクティブレストを入れ、回復日の内容は軽い", () => {
  const p7 = planOf({ frequency: 7, level: "advanced" });
  assert.equal(p7.days.filter((d) => d.type === "recovery").length, 1);
  assert.match(p7.weekNote, /アクティブレスト/);
  const beg = planOf({ frequency: 6, level: "beginner" });
  assert.equal(liftDays(beg).length, 4);
  assert.match(beg.weekNote, /初心者は週4回/);
  for (const m of MATRIX) {
    for (const d of m.plan.days.filter((x) => x.type === "recovery")) {
      assert.ok(d.cardio, `${m.key} recovery cardio`);
      assert.ok(!HIGH_IMPACT.has(d.cardio.name), `${m.key} ${d.cardio.name}`);
      assert.ok(d.exercises.every((e) => ["片脚立ち", "椅子スクワット"].includes(e.name)), `${m.key} recovery lifting`);
    }
  }
  // 回復日は相談ボタン・入れ替えで壊れない
  const plan = clone(p7);
  assert.equal(typeof adjustPlanVolume(plan, 1), "number");
  shortenPlan(plan);
  const rest = plan.days.find((d) => d.type === "recovery");
  assert.equal(rest.exercises.length, 0);
  assert.ok(alternativeCardio(profileOf({ frequency: 7, level: "advanced" }), [], rest.cardio.name, NOW, { day: rest }) !== undefined);
});

// 帯を下回ってよいのは、その筋肉のどの種目も上限(1種目のセット上限・1日の合計上限・筋力目的の重い種目の上限)に当たっているときだけ
const DAY_CAP = { 1: 16, 2: 22, 3: 25 };
const DAY_CAP_GOAL = { hypertrophy: 1, strength: 0.9, cut: 0.9, health: 0.75 };
function exerciseCap(ex, goal, levelNum) {
  if (goal === "health") return 3;
  if (levelNum === 1 || (ex.tier === "accessory" && levelNum === 2)) return 4;
  return 5;
}
function blocked(plan, ex, day, goal, levelNum) {
  if (ex.sets >= exerciseCap(ex, goal, levelNum)) return true;
  const daySets = day.exercises.reduce((s, e) => s + e.sets, 0);
  if (daySets >= Math.round(DAY_CAP[levelNum] * DAY_CAP_GOAL[goal])) return true;
  const heavy = day.exercises.filter((e) => e.tier !== "accessory").reduce((s, e) => s + e.sets, 0);
  return goal === "strength" && ex.tier !== "accessory" && heavy >= 15;
}

test("週のセット数: 筋肉ごとの目標帯に収まる(I17)", () => {
  const fails = [];
  let strictGym = 0;
  for (const m of MATRIX) {
    const plan = m.plan;
    const lift = liftDays(plan);
    const tot = weeklySets(plan);
    assert.deepEqual(Object.fromEntries(plan.weeklyVolume.map((v) => [v.key, v.sets])), tot, `${m.key} weeklyVolume`);
    for (const [key, [lo, hi, hard]] of Object.entries(plan.volumeBands)) {
      const t = tot[key] ?? 0;
      assert.ok(hard <= 24 && hard >= hi, `${m.key} hard cap`);
      const rows = lift.flatMap((d) => d.exercises.filter((e) => e.sub === key).map((e) => ({ e, d })));
      if (t > hi && rows.some((r) => r.e.sets > 2)) fails.push(`${m.key} ${key} ${t} > ${hi}`);
      if (lift.length >= 2 && t < lo) {
        if (!rows.every((r) => blocked(plan, r.e, r.d, m.goal, LEVEL_NUM[m.level]))) fails.push(`${m.key} ${key} ${t} < ${lo}`);
      } else if (m.eq === "gym" && m.goal !== "health" && lift.length >= 4) strictGym++;
    }
    // 1種目は2〜5セット
    for (const d of lift) for (const e of d.exercises) if (e.sets < 2 || e.sets > 5) fails.push(`${m.key} ${e.name} sets ${e.sets}`);
  }
  expectNone(fails, "weekly bands");
  assert.ok(strictGym > 500, "ジム・週4回以上はほとんどの筋肉が帯の中");
  // 上級者・週7回でも1筋肉あたり週20セットまで
  const p = planOf({ level: "advanced", frequency: 7 });
  for (const [k, v] of Object.entries(weeklySets(p))) assert.ok(v <= 20, `${k} ${v}`);
  // 週1回は維持向け(足さない)
  const p1 = planOf({ frequency: 1 });
  assert.equal(p1.maintenance, true);
  assert.match(p1.weekNote, /維持/);
});

test("もっときつく/もっと楽に: 上限を超えず、変更数を返す(I17)", () => {
  for (const o of [{ level: "advanced", frequency: 7 }, { level: "beginner", frequency: 3, equipment: EQ.home }, { goal: "strength", frequency: 5 }]) {
    const plan = planOf(o);
    const bands = plan.volumeBands;
    let changes = 0;
    for (let i = 0; i < 12; i++) changes = adjustPlanVolume(plan, 1);
    assert.equal(changes, 0, "何度も押すといずれ上限で止まる");
    assert.equal(canAdjustVolume(plan, 1), false);
    assert.equal(canAdjustVolume(plan, -1), true);
    const tot = weeklySets(plan);
    for (const [k, v] of Object.entries(tot)) assert.ok(v <= bands[k][2], `${k} ${v} > ${bands[k][2]}`);
    if (o.level === "advanced") for (const v of Object.values(tot)) assert.ok(v <= 22);
    for (const d of plan.days) for (const e of d.exercises) {
      assert.ok(e.sets <= 5);
      if (d.type === "recovery") assert.equal(e.sets, 2);
    }
    for (const d of plan.days) assert.equal(d.estMinutes, estimateMinutes(d));
    for (let i = 0; i < 8; i++) adjustPlanVolume(plan, -1);
    for (const d of plan.days) for (const e of d.exercises) assert.equal(e.sets, 2);
    assert.equal(adjustPlanVolume(plan, -1), 0);
  }
  // 旧形式(目標帯なし)のプランも従来どおり 2〜6 で増減する
  const legacy = { days: [{ title: "Day 1", exercises: [{ name: "ベンチプレス", sets: 3 }, { name: "プランク", sets: 6 }] }] };
  assert.equal(adjustPlanVolume(legacy, 1), 1);
  assert.deepEqual(legacy.days[0].exercises.map((e) => e.sets), [4, 6]);
});

test("回数・休憩: 役割別の処方、重いバーベル種目は10回まで・休憩2分以上(I18)", () => {
  const fails = [];
  for (const { key, plan, goal } of MATRIX) {
    for (const d of plan.days) {
      let heavySets = 0;
      for (const e of d.exercises) {
        const i = infoOf(e.name);
        const r = range(e.reps);
        const rest = parseRestSeconds(e.rest);
        if (!r) fails.push(`${key} ${e.name} reps ${e.reps}`);
        if (rest < 30 || rest > 300) fails.push(`${key} ${e.name} rest ${e.rest}`);
        if (/秒.*分|分.*秒/.test(e.rest)) fails.push(`${key} ${e.name} mixed rest unit ${e.rest}`);
        if (i.heavy && (r.hi > 10 || rest < 120)) fails.push(`${key} ${e.name} heavy ${e.reps} ${e.rest}`);
        // 自重種目(床で行う押す・しゃがむ・ランジ)は8回未満を処方しない(B21)
        if (i.style === "bw" && r.lo < 8) fails.push(`${key} ${e.name} bw ${e.reps}`);
        if (e.tier !== "accessory") heavySets += e.sets;
        if ((e.tier === "accessory") !== (e.role === "accessory")) fails.push(`${key} ${e.name} role/tier`);
      }
      if (goal === "strength" && heavySets > 15) fails.push(`${key} ${d.title} heavy sets ${heavySets}`);
    }
  }
  expectNone(fails, "prescription");
  // 減量中でもデッドリフトは高回数・短い休憩にしない
  const cut = planOf({ goal: "cut", frequency: 4 });
  const dl = cut.days.flatMap((d) => d.exercises).find((e) => e.name === "デッドリフト");
  assert.ok(dl && range(dl.reps).hi <= 10 && parseRestSeconds(dl.rest) >= 120);
  // 懸垂は減量・中級でも 12〜15回 にならない
  const pull = cut.days.flatMap((d) => d.exercises).find((e) => e.name === "懸垂(チンニング)");
  assert.ok(pull && range(pull.reps).hi <= 10, pull?.reps);
  // 筋力目的のメインは低回数・長い休憩
  const str = planOf({ goal: "strength", frequency: 4 });
  assert.equal(str.days[0].exercises[0].reps, "3〜5回");
  assert.equal(str.days[0].exercises[0].rest, "3〜5分");
  // 自重のみ・筋力目的でも 5x4〜6 のような処方はしない
  const bw = planOf({ goal: "strength", equipment: [], frequency: 3 });
  for (const e of bw.days.flatMap((d) => d.exercises)) if (e.track === "weight") assert.ok(range(e.reps).lo >= 8, `${e.name} ${e.reps}`);
});

test("強化部位: ★種目を1つ追加し、腕は Push=三頭・Pull=二頭(B17/B20)", () => {
  const plan = planOf({ frequency: 6, focus: ["arms"] });
  for (const d of plan.days) {
    const extra = d.exercises.filter((e) => e.extra);
    if (d.split === "legs") {
      assert.equal(extra.length, 0, d.title);
      continue;
    }
    assert.equal(extra.length, 1, d.title);
    assert.ok(extra[0].focused);
    if (d.split === "push") assert.equal(extra[0].pattern, "triceps");
    if (d.split === "pull") assert.equal(extra[0].pattern, "biceps");
  }
  // 全身法の日は常に1種目追加
  for (const d of planOf({ frequency: 3, focus: ["legs"] }).days) assert.equal(d.exercises.filter((e) => e.extra).length, 1);
  // 体幹を強化しても体幹は最後(バーベル種目の前に置かない)
  const core = planOf({ frequency: 4, focus: ["core"] });
  for (const d of core.days) {
    const idx = d.exercises.findIndex((e) => e.muscle === "core");
    assert.ok(idx === -1 || d.exercises.slice(idx).every((e) => e.muscle === "core" || infoOf(e.name).track === "time"), d.title);
  }
  // 強化部位の週の上限は高め
  const legs = planOf({ frequency: 4, focus: ["legs"] });
  const base = planOf({ frequency: 4 });
  assert.ok(legs.volumeBands.quads[1] > base.volumeBands.quads[1]);
  assert.deepEqual(legs.focusLabels, ["脚"]);
});

// 入れ替え(↻)を繰り返しても: 同じ日の重複なし・レベル内・ヒンジ規則・腕の取り違えなし・セット数維持
function swapCycle(profile, plan, dayIndex, exIndex, limit = 30) {
  const day = clone(plan.days[dayIndex]);
  const original = day.exercises[exIndex];
  const seen = [original.name];
  for (let i = 0; i < limit; i++) {
    const alt = alternativeExercise(profile, [], day, exIndex, NOW);
    if (!alt) break;
    day.exercises[exIndex] = alt;
    seen.push(alt.name);
    if (alt.name === original.name) break;
  }
  return { day, seen, original };
}

test("入れ替え(↻): 同じ動作パターン内で循環し、条件を守る(B17/B18/B19/B23)", () => {
  const fails = [];
  const samples = MATRIX.filter((m) => m.focus.length === 0 && [2, 3, 4, 6].includes(m.frequency));
  for (const m of samples) {
    m.plan.days.forEach((d, di) => {
      d.exercises.forEach((ex, ei) => {
        const { day, seen, original } = swapCycle(m.profile, m.plan, di, ei);
        const names = day.exercises.map((e) => e.name);
        if (new Set(names).size !== names.length) fails.push(`${m.key} ${d.title} dup after swap`);
        if (seen.length > 1 && seen.at(-1) !== original.name) fails.push(`${m.key} ${d.title} ${original.name} no cycle: ${seen}`);
        const origGroup = SUB_MUSCLES[original.sub]?.group ?? original.muscle;
        for (const name of seen) {
          const i = infoOf(name);
          if (i.level > LEVEL_NUM[m.level]) fails.push(`${m.key} swap level ${name}`);
          if (i.pattern === "hinge" && ["upper", "push", "pull"].includes(d.split)) fails.push(`${m.key} ${d.title} swap hinge ${name}`);
          if (original.pattern === "triceps" && i.pattern !== "triceps") fails.push(`${m.key} triceps→${name}`);
          if (original.pattern === "biceps" && i.pattern !== "biceps") fails.push(`${m.key} biceps→${name}`);
          if (d.split === "push" && i.pattern === "biceps") fails.push(`${m.key} push curl ${name}`);
          if (d.split === "pull" && (i.pattern === "triceps" || PUSH_PATTERNS.has(i.pattern))) fails.push(`${m.key} pull press ${name}`);
          const g = SUB_MUSCLES[i.sub]?.group ?? i.muscle;
          const backShoulder = new Set(["back", "shoulders"]);
          if (g !== origGroup && !(backShoulder.has(g) && backShoulder.has(origGroup))) fails.push(`${m.key} ${original.name}→${name} group`);
        }
        const hinges = day.exercises.filter((e) => infoOf(e.name).pattern === "hinge").length;
        if (hinges > 1) fails.push(`${m.key} ${d.title} 2 hinges after swap`);
        if (day.exercises[ei].sets !== original.sets) fails.push(`${m.key} sets changed`);
      });
    });
  }
  expectNone(fails, "swap");
});

test("入れ替え: 自宅(自重のみ)でも ↻ が無反応にならない(I16)", () => {
  const fails = [];
  for (const level of ["beginner", "intermediate"]) {
    for (const goal of ["hypertrophy", "health"]) {
      for (const frequency of [2, 3, 6]) {
        const profile = profileOf({ level, goal, frequency, equipment: [] });
        const plan = generatePlan(profile, [], NOW);
        plan.days.forEach((d) => d.exercises.forEach((ex, i) => {
          if (d.type !== "lift") return;
          if (!hasAlternative(profile, d, i)) fails.push(`${level}/${goal}/f${frequency} ${d.title} ${ex.name}`);
          const alt = alternativeExercise(profile, [], d, i, NOW);
          if (!alt || alt.name === ex.name) fails.push(`${level}/${goal}/f${frequency} ${ex.name} null swap`);
        }));
      }
    }
  }
  expectNone(fails, "home swaps");
  // ジム・ダンベルでも ↻ が効かない行はほぼ無い
  let dead = 0;
  let total = 0;
  for (const m of noFocus.filter((x) => x.eq === "gym" || x.eq === "home_db")) {
    m.plan.days.forEach((d) => d.exercises.forEach((_, i) => {
      total++;
      if (!hasAlternative(m.profile, d, i)) dead++;
    }));
  }
  assert.ok(dead / total < 0.02, `dead ${dead}/${total}`);
});

test("入れ替え: もっときつく/楽に・時短の調整を引き継ぐ(B23)", () => {
  const profile = profileOf({ frequency: 4 });
  const plan = generatePlan(profile, [], NOW);
  adjustPlanVolume(plan, 1);
  adjustPlanVolume(plan, 1);
  const day = plan.days[0];
  const before = day.exercises[0];
  const alt = alternativeExercise(profile, [], day, 0, NOW);
  assert.ok(alt);
  assert.equal(alt.sets, before.sets);
  assert.equal(alt.baseSets, before.baseSets);
  assert.equal(alt.tier, "main");
  // 楽に ×3 の後でも2セットのまま
  const p2 = generatePlan(profile, [], NOW);
  for (let i = 0; i < 3; i++) adjustPlanVolume(p2, -1);
  const alt2 = alternativeExercise(profile, [], p2.days[1], 2, NOW);
  assert.equal(alt2.sets, 2);
  // 時短後は休憩も短いまま
  const p3 = generatePlan(profile, [], NOW);
  shortenPlan(p3);
  const d3 = p3.days[0];
  const acc = d3.exercises.findIndex((e) => e.tier === "accessory");
  const alt3 = alternativeExercise(profile, [], d3, acc, NOW);
  assert.ok(parseRestSeconds(alt3.rest) <= 60, alt3.rest);
  // 旧形式の行(pattern なし)でも同じ部位から選び、上半身の日にデッドリフトを出さない
  const legacyDay = { title: "Day 1:上半身", exercises: [
    { name: "ベンチプレス", muscle: "chest", sets: 4, reps: "8〜12回", rest: "90秒" },
    { name: "ラットプルダウン", muscle: "back", sets: 4, reps: "8〜12回", rest: "90秒" },
  ] };
  const seen = new Set();
  let d = clone(legacyDay);
  for (let i = 0; i < 12; i++) {
    const a = alternativeExercise(profile, [], d, 1, NOW);
    if (!a) break;
    seen.add(a.name);
    d.exercises[1] = a;
    assert.equal(a.sets, 4);
  }
  assert.ok(seen.size >= 2);
  assert.ok(!seen.has("デッドリフト"));
});

test("時間を短く: 目安時間内・★は残す・外した部位の準備を除く・何度押しても同じ(I22/B24)", () => {
  const fails = [];
  for (const m of MATRIX.filter((x) => [1, 2, 3, 4, 5, 6].includes(x.frequency) && (x.eq === "gym" || x.eq === "home" || x.eq === "home_db"))) {
    const plan = clone(m.plan);
    shortenPlan(plan);
    const target = m.goal === "strength" ? 50 : 45;
    for (const [di, d] of plan.days.entries()) {
      if (d.type !== "lift") continue;
      const before = m.plan.days[di];
      const t = estimateMinutes(d);
      if (d.estMinutes !== t) fails.push(`${m.key} ${d.title} estMinutes stale`);
      const onlyProtected = d.exercises.every((e, i) => e.focused || e.tier === "main" || (!e.tier && i === 0));
      if (t > target && d.exercises.length > 3 && !onlyProtected) fails.push(`${m.key} ${d.title} ${t}分`);
      if (t > before.estMinutes) fails.push(`${m.key} ${d.title} got longer`);
      for (const e of before.exercises.filter((x) => x.focused)) {
        if (!d.exercises.some((x) => x.name === e.name)) fails.push(`${m.key} ${d.title} lost ★${e.name}`);
      }
      if (before.exercises[0].tier === "main" && d.exercises[0].name !== before.exercises[0].name) fails.push(`${m.key} lost main`);
      // 順番は変えない
      const order = d.exercises.map((e) => before.exercises.findIndex((x) => x.name === e.name));
      if (order.some((v, i) => i > 0 && v < order[i - 1])) fails.push(`${m.key} ${d.title} reordered`);
      // クールダウンは残った部位だけ
      const cool = d.cooldown.join("");
      if (/腹筋ストレッチ/.test(cool) && !d.exercises.some((e) => e.sub === "core")) fails.push(`${m.key} ${d.title} stale core stretch`);
      if (/上腕三頭筋/.test(cool) && !d.exercises.some((e) => e.sub === "triceps")) fails.push(`${m.key} ${d.title} stale triceps stretch`);
      if (/ヒップヒンジ/.test(d.warmup.join("")) && !d.exercises.some((e) => ["hinge", "glute", "knee_flex"].includes(e.pattern))) {
        fails.push(`${m.key} ${d.title} stale hinge warmup`);
      }
      for (const e of d.exercises) {
        if (e.tier !== "main" && e.sets > 2) fails.push(`${m.key} ${e.name} sets ${e.sets}`);
        if (infoOf(e.name).heavy && parseRestSeconds(e.rest) < 120) fails.push(`${m.key} ${e.name} heavy rest ${e.rest}`);
      }
    }
    const again = clone(plan);
    shortenPlan(again);
    if (JSON.stringify(again) !== JSON.stringify(plan)) fails.push(`${m.key} not idempotent`);
  }
  expectNone(fails, "shorten");
  // 全身法・腕を強化: 短くしても ★ の腕種目が残る(B24 の再現ケース)
  const p = planOf({ frequency: 2, focus: ["arms"] });
  shortenPlan(p);
  for (const d of p.days) assert.ok(d.exercises.some((e) => e.focused && e.muscle === "arms"), d.title);
  assert.equal(p.shortened, true);
  // 以前の「最大4種目」よりきちんと短くなる
  const s = planOf({ goal: "strength", level: "advanced", frequency: 5 });
  const longest = Math.max(...s.days.map((d) => d.estMinutes));
  shortenPlan(s);
  assert.ok(Math.max(...s.days.map((d) => d.estMinutes)) <= 50 && longest >= 70, `${longest}`);
});

test("所要時間の見積もり(estimateMinutes)", () => {
  assert.equal(estimateMinutes(null), 0);
  const day = { exercises: [{ name: "ベンチプレス", sets: 3, reps: "8〜12回", rest: "90秒" }], cardio: null };
  // 3×(10回×3秒+10秒) + 2×90秒 + 60秒 = 360秒 = 6分 + 準備11分 → 17分 → 20分
  assert.equal(estimateMinutes(day), 20);
  const withCardio = { ...day, cardio: { name: "ランニング", duration: "20〜30分" } };
  assert.equal(estimateMinutes(withCardio), 45);
  const optional = { ...day, cardio: { name: "水泳(平泳ぎ)", duration: "25m×8本", minutes: 15, optional: true } };
  assert.equal(estimateMinutes(optional), 20);
  // 強度が上がると長くなる
  const plan = planOf({ frequency: 3 });
  const before = plan.days[0].estMinutes;
  adjustPlanVolume(plan, 1);
  assert.ok(plan.days[0].estMinutes >= before);
});

test("前回記録からの目標(ダブルプログレッション I19)", () => {
  const t = (name, reps, rec, extra = {}) => progressionTarget({ name, date: "2026-09-26", ...rec }, { name, reps, ...extra }, { level: "intermediate" }, NOW);
  // 範囲の上限到達 → 1段階重く・下限の回数から
  let r = t("サイドレイズ", "10〜12回", { weight: 5, reps: 12, sets: 3 });
  assert.equal(r.weight, 6); assert.equal(r.reps, 10); assert.match(r.text, /6kg×10回/);
  r = t("ラットプルダウン", "8〜12回", { weight: 40, reps: 12, sets: 3 });
  assert.equal(r.weight, 42.5); assert.match(r.text, /42\.5kg×8回/); assert.match(r.text, /1段階/);
  r = t("ダンベルカール", "10〜12回", { weight: 10, reps: 12 });
  assert.equal(r.weight, 12);
  r = t("バーベルスクワット", "8〜12回", { weight: 100, reps: 12 });
  assert.equal(r.weight, 105);
  r = t("ベンチプレス", "8〜12回", { weight: 60, reps: 12 });
  assert.equal(r.weight, 62.5);
  r = t("デッドリフト", "6〜10回", { weight: 100, reps: 10 });
  assert.equal(r.weight, 105);
  // 範囲内 → 同じ重量で+1回
  r = t("ベンチプレス", "8〜12回", { weight: 60, reps: 10 });
  assert.equal(r.weight, 60); assert.equal(r.reps, 11); assert.match(r.text, /60kg×11回/);
  // 下限未満 → 同じ重量で下限を目指す(大きく届かなければ1段階軽く)
  r = t("ベンチプレス", "8〜12回", { weight: 60, reps: 6 });
  assert.equal(r.weight, 60); assert.equal(r.reps, 8); assert.match(r.text, /60kg×8回/);
  r = t("ベンチプレス", "8〜12回", { weight: 60, reps: 3 });
  assert.equal(r.weight, 57.5);
  // 「15回」のような単一値でも上限扱い
  r = t("レッグエクステンション", "15回", { weight: 30, reps: 15 });
  assert.equal(r.weight, 32.5); assert.equal(r.reps, 15);
  // 自重: 上限を超えたら難しいバリエーションへ(B21)
  r = t("腕立て伏せ", "10〜20回(余力1〜2回)", { weight: 0, reps: 25, sets: 3 });
  assert.match(r.text, /デクラインプッシュアップ/);
  r = t("腕立て伏せ", "10〜20回", { weight: 0, reps: 3 });
  assert.match(r.text, /膝つき腕立て伏せ/);
  r = t("腕立て伏せ", "10〜20回", { weight: 0, reps: 12 });
  assert.equal(r.reps, 13);
  // キープ・有酸素
  r = t("プランク", "30〜60秒キープ", { track: "time", seconds: 30, sets: 3 });
  assert.equal(r.seconds, 35);
  r = t("プランク", "30〜60秒キープ", { track: "time", seconds: 60, sets: 3 });
  assert.match(r.text, /より難しい/);
  r = t("水泳(平泳ぎ)", "", { track: "cardio", minutes: 30, distance: 600, unit: "m" });
  assert.equal(r.distance, 625); assert.equal(r.distance % 25, 0);
  r = t("水泳(クロール)", "", { track: "cardio", minutes: 40, distance: 1200, unit: "m" });
  assert.equal(r.distance, 1250);
  r = t("ランニング", "", { track: "cardio", minutes: 20, distance: 3, unit: "km" });
  assert.equal(r.minutes, 22);
  // ブランク明けは約8割から
  r = progressionTarget({ name: "ベンチプレス", date: "2026-08-01", weight: 80, reps: 8 }, { name: "ベンチプレス", reps: "8〜12回" }, {}, NOW);
  assert.equal(r.weight, 65);
  // 旧形式(文字列・欠損)でも落ちない
  assert.equal(progressionTarget(null, { name: "ベンチプレス" }), null);
  assert.equal(progressionTarget({ name: "ベンチプレス", weight: "", reps: "" }, { name: "ベンチプレス", reps: "8〜12回" }), null);
  r = progressionTarget({ name: "ベンチプレス", weight: "60", reps: "12" }, { name: "ベンチプレス", reps: "8〜12回" });
  assert.equal(r.weight, 62.5);
  // 目標重量は重量の選択肢に含まれる値
  for (const [name, w] of [["サイドレイズ", 7], ["ダンベルプレス", 22], ["ラットプルダウン", 47.5], ["ケトルベルスイング", 16]]) {
    const x = t(name, "8〜12回", { weight: w, reps: 12 });
    assert.ok(WEIGHT_CHOICES.includes(x.weight), `${name} ${x.weight}`);
  }
});

test("プランに前回記録の目標とノートが入る(Ex.target / note)", () => {
  const logs = [{ id: "a", date: "2026-09-26", entries: [
    { name: "ベンチプレス", track: "weight", weight: 40, reps: 10, sets: 1 },
    { name: "ベンチプレス", track: "weight", weight: 80, reps: 5, sets: 3 },
  ] }];
  const plan = generatePlan(profileOf({ goal: "strength", frequency: 4 }), logs, NOW);
  const bench = plan.days[0].exercises.find((e) => e.name === "ベンチプレス");
  assert.ok(bench.target);
  assert.equal(bench.target.weight, 82.5); // 3〜5回の上限5回に到達 → +2.5kg
  assert.match(bench.note, /80kg×5回×3セット/);
  assert.match(bench.note, /9\/26/);
  assert.match(plan.historySummary.join(""), /記録 1件/);
});

test("記録の分析: 同じ日の作業セットを選び、新しい日付を優先する(B39)", () => {
  const logs = [
    { date: "2026-09-20", entries: [{ name: "ベンチプレス", weight: 100, reps: 5, sets: 3 }] },
    { date: "2026-09-26", entries: [
      { name: "ベンチプレス", weight: "40", reps: "10", sets: "1" },
      { name: "ベンチプレス", weight: "80", reps: "5", sets: "3" },
      { name: "プランク", track: "time", seconds: 30, sets: 1 },
      { name: "プランク", track: "time", seconds: 60, sets: 2 },
    ] },
    { date: "2026-09-26", entries: [{ name: "ベンチプレス", weight: 80, reps: 6, sets: 1 }] },
    { date: "bad", entries: [] },
    null,
  ];
  const a = analyzeLogs(logs, NOW);
  assert.equal(a.lastRecordByName["ベンチプレス"].weight, 80);
  assert.equal(Number(a.lastRecordByName["ベンチプレス"].reps), 6);
  assert.equal(a.lastRecordByName["プランク"].seconds, 60);
  assert.equal(a.daysSinceLast, 3);
  assert.equal(a.muscleLastDays.chest, 3);
  assert.ok(a.neglectedMuscles.includes("legs"));
  assert.equal(analyzeLogs([], NOW), null);
  assert.equal(analyzeLogs(null, NOW), null);
  // setDetails(セッション記録)は最も重いセットを作業セットとする
  const b = analyzeLogs([{ date: "2026-09-28", entries: [{ name: "スクワット", weight: 60, reps: 8, sets: 3,
    setDetails: [{ weight: 60, reps: 8 }, { weight: 70, reps: 5 }, { weight: 70, reps: 6 }] }] }], NOW);
  assert.equal(b.lastRecordByName["スクワット"].weight, 70);
  assert.equal(b.lastRecordByName["スクワット"].reps, 6);
  // 未来の日付でもマイナスの日数にしない
  assert.equal(analyzeLogs([{ date: "2026-10-05", entries: [] }], NOW).daysSinceLast, 0);
  // pickWorkingSet
  assert.equal(pickWorkingSet([{ name: "x", weight: 40, reps: 10 }, { name: "x", weight: 80, reps: 5 }]).weight, 80);
  assert.equal(pickWorkingSet([]), null);
});

test("有酸素: 目的別・日ごとに種類を回す・脚の日は低衝撃・プールは25m単位(I20)", () => {
  const fails = [];
  for (const m of MATRIX) {
    for (const d of m.plan.days) {
      const c = d.cardio;
      if (!c) continue;
      const i = infoOf(c.name);
      if (i.level > LEVEL_NUM[m.level]) fails.push(`${m.key} cardio level ${c.name}`);
      if (/バーピー|ジャンピング/.test(c.name) && /20〜30分/.test(c.duration)) fails.push(`${m.key} interval 20〜30分`);
      if ((d.split === "lower" || d.split === "legs") && HIGH_IMPACT.has(c.name)) fails.push(`${m.key} ${d.title} high impact ${c.name}`);
      if (c.isPool !== isPoolExercise(c.name)) fails.push(`${m.key} isPool`);
      if (i.isPool && c.name !== "水中ウォーキング" && !(c.distanceM > 0 && c.distanceM % 25 === 0)) fails.push(`${m.key} swim distance ${c.duration}`);
      if (!(c.minutes > 0)) fails.push(`${m.key} cardio minutes`);
    }
    if (m.goal === "hypertrophy" && !m.profile.equipment.includes("pool")) {
      if (liftDays(m.plan).some((d) => d.cardio)) fails.push(`${m.key} hypertrophy cardio`);
    }
  }
  expectNone(fails, "cardio");
  // プールのみ: どの目的でも25m単位の泳ぎが出る
  for (const goal of GOAL_KEYS) {
    const plan = planOf({ goal, equipment: ["pool"], frequency: 3 });
    const swims = plan.days.map((d) => d.cardio).filter((c) => c && c.isPool && c.distanceM);
    assert.ok(swims.length > 0, goal);
    for (const c of swims) assert.match(c.duration, /25m|50m|100m/);
  }
  // 2種類以上使えるなら日ごとに変える
  const cut = planOf({ goal: "cut", frequency: 4 });
  assert.ok(new Set(cut.days.map((d) => d.cardio?.name)).size >= 2);
  // 健康維持・週5回は週150分以上
  assert.ok(planOf({ goal: "health", frequency: 5 }).weeklyCardioMinutes >= 150);
  assert.match(planOf({ goal: "health", frequency: 2 }).advice.tips.join(""), /週150分/);
  // 有酸素の入れ替えは日の cardio をそのまま置き換えられる
  const profile = profileOf({ goal: "cut", equipment: ["pool", "treadmill", "bike"] });
  const plan = generatePlan(profile, [], NOW);
  const alt = alternativeCardio(profile, [], plan.days[0].cardio.name, NOW, { day: plan.days[0] });
  assert.ok(alt && alt.name !== plan.days[0].cardio.name && typeof alt.duration === "string" && "isPool" in alt);
  assert.equal(alternativeCardio(profileOf({ goal: "cut", equipment: [], level: "beginner", age: 70 }), [], "ウォーキング(早歩き)", NOW), null);
});

test("年齢・体格: 高BMI・60歳以上は衝撃の大きい有酸素とディップスを避ける(I20/I21)", () => {
  const risky = { test: (name) => HIGH_IMPACT.has(name) };
  for (const o of [{ weight: 115, height: 165 }, { age: 72 }]) {
    for (const goal of GOAL_KEYS) {
      for (const [eq, equipment] of Object.entries(EQ)) {
        for (const frequency of [3, 7]) {
          const profile = profileOf({ ...o, goal, equipment, frequency, level: "beginner" });
          const plan = generatePlan(profile, [], NOW);
          for (const d of plan.days) {
            if (d.cardio) {
              assert.ok(!risky.test(d.cardio.name), `${eq} ${goal} ${d.cardio.name}`);
              let name = d.cardio.name;
              for (let i = 0; i < 12; i++) {
                const alt = alternativeCardio(profile, [], name, NOW, { day: d });
                if (!alt) break;
                assert.ok(!risky.test(alt.name), `swap ${alt.name}`);
                name = alt.name;
              }
            }
            if (o.age) assert.ok(!d.exercises.some((e) => /ディップス/.test(e.name)), `${eq} dips`);
          }
        }
      }
    }
  }
  // 72歳・週7回: 筋トレは週4日まで・片脚立ちあり・「完全休養日」と矛盾しない
  const senior = planOf({ age: 72, gender: "女性", goal: "health", level: "beginner", frequency: 7 });
  assert.equal(liftDays(senior).length, 4);
  assert.ok(senior.days.some((d) => d.exercises.some((e) => e.name === "片脚立ち")));
  assert.ok(!senior.advice.tips.some((t) => /完全休養日を設け/.test(t)));
  assert.match(senior.weekNote, /60歳以上/);
  assert.ok(senior.days.every((d) => d.type !== "lift" || d.warmup.some((w) => /片脚立ち/.test(w))));
  // 115kg/165cm の減量: タンパク質は目安体重(約68kg)で計算
  const big = planOf({ weight: 115, height: 165, goal: "cut", level: "beginner" });
  assert.match(big.advice.protein, /122〜150g/);
  assert.match(big.advice.tips.join(""), /膝つき/);
  // 自重メニューは入門バリエーションから
  const bigHome = planOf({ weight: 115, height: 165, level: "beginner", equipment: [] });
  const names = bigHome.days.flatMap((d) => d.exercises.map((e) => e.name));
  assert.ok(names.includes("膝つき腕立て伏せ") && !names.includes("腕立て伏せ"), names.join(","));
  assert.ok(names.includes("椅子スクワット"));
  // 13歳・筋力: 低回数の高重量なし・減量の摂取制限なし・睡眠8〜10時間
  const teen = planOf({ age: 13, goal: "strength", level: "beginner" });
  for (const e of teen.days.flatMap((d) => d.exercises)) if (e.track === "weight") assert.ok(range(e.reps).lo >= 8, `${e.name} ${e.reps}`);
  assert.match(teen.advice.tips.join(""), /8〜10時間/);
  const teenCut = planOf({ age: 13, goal: "cut", gender: "女性" });
  assert.ok(!/−300〜500kcal/.test(teenCut.advice.calories));
  assert.match(teenCut.advice.protein, /1\.2〜1\.6g/);
  // 30歳・BMI普通なら特別な調整は入らない
  const adult = planOf({ frequency: 7, level: "advanced" });
  assert.equal(liftDays(adult).length, 6);
  assert.ok(!/目安体重/.test(adult.advice.protein));
});

test("ウォームアップ: 動作に合わせた準備・器具がない人に器具を使うドリルは出さない(I36)", () => {
  const fails = [];
  for (const m of MATRIX) {
    const eq = new Set(m.profile.equipment);
    for (const d of liftDays(m.plan)) {
      const w = d.warmup.join(" / ");
      if (/バンド/.test(w) && !eq.has("band")) fails.push(`${m.key} band drill`);
      if (/ぶら下がり/.test(w) && !eq.has("pullup_bar") && m.eq !== "gym") fails.push(`${m.key} bar drill`);
      const first = d.exercises[0];
      if (infoOf(first.name).equipment.length === 0 && /軽い重量|%/.test(w)) fails.push(`${m.key} weight ramp for bodyweight`);
      if (!w.includes("ウォームアップセット")) fails.push(`${m.key} ${d.title} no ramp`);
      if (d.exercises.some((e) => e.pattern === "hinge") && !/ヒップヒンジ/.test(w)) fails.push(`${m.key} ${d.title} no hinge prep`);
    }
  }
  expectNone(fails, "warmup");
  // 筋力目的で前回のスクワット記録があれば kg 付きで3段階以上
  const logs = [{ date: "2026-09-25", entries: [{ name: "バーベルスクワット", track: "weight", weight: 100, reps: 5, sets: 3 }] }];
  const plan = generatePlan(profileOf({ goal: "strength", frequency: 4 }), logs, NOW);
  const lower = plan.days.find((d) => d.exercises[0]?.name === "バーベルスクワット");
  const ramp = lower.warmup.find((w) => w.startsWith("ウォームアップセット"));
  assert.ok((ramp.match(/kg×/g) ?? []).length >= 3, ramp);
  assert.match(ramp, /本番105kg/);
  assert.match(plan.advice.tips.join(""), /最初の種目/);
});

test("入力の欠損: 頻度が不正でも空のメニューにしない(B25)", () => {
  const p = generatePlan({ weight: 70, height: 170, age: 30, goal: "??", level: "??", frequency: NaN, equipment: undefined }, [], NOW);
  assert.equal(p.days.length, 3);
  assert.ok(p.days.every((d) => d.exercises.length >= 3));
  assert.equal(generatePlan(profileOf({ frequency: 12 }), [], NOW).days.length, 7);
  assert.equal(generatePlan(profileOf({ frequency: "2" }), [], NOW).days.length, 2);
});

test("メイン種目: その日の1種目目は他の種目よりセット数が少なくならない(初心者は必ず)", () => {
  const fails = [];
  let days = 0;
  let leads = 0;
  for (const m of MATRIX) {
    for (const d of liftDays(m.plan)) {
      const main = d.exercises.find((e) => e.tier === "main");
      if (!main) continue;
      days++;
      const top = Math.max(0, ...d.exercises.filter((e) => e !== main && e.track === "weight").map((e) => e.sets));
      if (main.sets >= top) leads++;
      else if (m.level === "beginner") fails.push(`${m.key} ${d.title} ${d.exercises.map((e) => `${e.name}${e.sets}`)}`);
    }
  }
  expectNone(fails, "beginner main sets");
  assert.ok(leads / days >= 0.98, `main leads ${leads}/${days}`);
  // 初心者でもメイン種目は3セットでフォームを練習する(健康維持は2セットから)
  for (const goal of ["hypertrophy", "cut", "strength"]) {
    for (const eq of ["gym", "home", "home_db"]) {
      for (const d of liftDays(planOf({ goal, level: "beginner", frequency: 3, equipment: EQ[eq] }))) {
        assert.equal(d.exercises[0].tier, "main", `${goal} ${eq} ${d.title}`);
        assert.ok(d.exercises[0].sets >= 3, `${goal} ${eq} ${d.title} ${d.exercises[0].name} ${d.exercises[0].sets}`);
      }
    }
  }
  for (const d of liftDays(planOf({ goal: "health", level: "beginner", frequency: 3 }))) assert.equal(d.exercises[0].sets, 2);
});

test("種目DB: 難易度の上下(harder/easier)は実在する同じ部位の種目を指す", () => {
  for (const name of allExerciseNames()) {
    const i = infoOf(name);
    for (const link of [i.harder, i.easier]) {
      if (!link) continue;
      const j = infoOf(link);
      assert.equal(SUB_MUSCLES[j.sub]?.group ?? j.muscle, SUB_MUSCLES[i.sub]?.group ?? i.muscle, `${name} → ${link}`);
      assert.equal(j.track, i.track, `${name} → ${link}`);
    }
  }
  // 自重の押す・しゃがむ種目には入門バリエーションがある(高BMI・高齢者の出発点)
  for (const name of ["腕立て伏せ", "自重スクワット", "パイクプッシュアップ", "ダイヤモンドプッシュアップ"]) {
    assert.ok(infoOf(name).easier, name);
  }
});

test("前回記録からの目標重量は、いつも記録フォームの重量の選択肢(WEIGHT_CHOICES)にある", () => {
  const names = ["ベンチプレス", "バーベルスクワット", "ダンベルプレス", "サイドレイズ", "ケトルベルスイング",
    "ラットプルダウン", "スミスマシンスクワット", "トライセプスプレスダウン", "チェストプレス(マシン)"];
  const fails = [];
  const at = (name, weight, reps, date = "2026-09-26") =>
    progressionTarget({ name, weight, reps, date }, { name, reps: "8〜12回" }, { level: "intermediate" }, NOW);
  for (const name of names) {
    for (const w of WEIGHT_CHOICES.filter((x) => x > 0 && x <= 200)) {
      const up = at(name, w, 12);
      if (!WEIGHT_CHOICES.includes(up.weight) || !(up.weight > w)) fails.push(`${name} up ${w}→${up.weight}`);
      const down = at(name, w, 3);
      if (!WEIGHT_CHOICES.includes(down.weight) || down.weight > w || (w >= 5 && !(down.weight < w))) fails.push(`${name} down ${w}→${down.weight}`);
      const layoff = at(name, w, 10, "2026-07-01");
      if (!WEIGHT_CHOICES.includes(layoff.weight) || layoff.weight > w || (w >= 5 && !(layoff.weight < w))) fails.push(`${name} layoff ${w}→${layoff.weight}`);
    }
  }
  expectNone(fails, "weight grid");
  // ケトルベルは実在する規格の次の重さへ(記録できない 36kg は使わない)
  assert.equal(at("ケトルベルスイング", 24, 12).weight, 28);
  assert.equal(at("ケトルベルスイング", 32, 12).weight, 40);
});

test("ウォームアップセット: 段階の数は本番の回数に合わせ、重さは選択肢の値・バーより軽くしない(I36)", () => {
  const logs = [{ date: "2026-09-25", entries: [
    { name: "チェストプレス(マシン)", track: "weight", weight: 50, reps: 8, sets: 3 },
    { name: "ダンベルプレス", track: "weight", weight: 24, reps: 8, sets: 3 },
    { name: "ベンチプレス", track: "weight", weight: 30, reps: 5, sets: 3 },
  ] }];
  const rampOf = (plan, name) => {
    const day = plan.days.find((d) => d.exercises[0]?.name === name);
    assert.ok(day, name);
    return day.warmup.find((w) => w.startsWith("ウォームアップセット"));
  };
  const kgs = (ramp) => [...ramp.matchAll(/([\d.]+)kg×/g)].map((m) => Number(m[1]));
  // 筋力目的でも、マシンがメインの日(6〜8回)は 50%→70% の2段階で足りる
  const machine = rampOf(generatePlan(profileOf({ goal: "strength", equipment: ["machine"], frequency: 4 }), logs, NOW), "チェストプレス(マシン)");
  assert.equal(kgs(machine).length, 2, machine);
  // ダンベルの段階は選択肢にある重さ
  const db = rampOf(generatePlan(profileOf({ equipment: EQ.home_db, frequency: 4 }), logs, NOW), "ダンベルプレス");
  assert.ok(kgs(db).length >= 2 && kgs(db).every((w) => WEIGHT_CHOICES.includes(w) && w < 24), db);
  // 筋力目的のバーベル(3〜5回): バーのみから始め、20kg より軽い段階は出さない
  const bar = rampOf(generatePlan(profileOf({ goal: "strength", equipment: EQ.barbell, frequency: 4 }), logs, NOW), "ベンチプレス");
  assert.match(bar, /20kg\(バーのみ\)×10/);
  assert.ok(kgs(bar).every((w) => w >= 20 && WEIGHT_CHOICES.includes(w)), bar);
});

test("健康維持の有酸素: アクティブレストの日も数えて週150分以上・筋トレ日は長くしすぎない(I20/I21)", () => {
  const profile = profileOf({ age: 72, gender: "女性", goal: "health", level: "beginner", frequency: 7 });
  const senior = generatePlan(profile, [], NOW);
  assert.ok(senior.weeklyCardioMinutes >= 150, `${senior.weeklyCardioMinutes}`);
  for (const d of liftDays(senior)) assert.ok(d.cardio && d.cardio.minutes <= 25, `${d.title} ${d.cardio?.minutes}`);
  // 入れ替えても同じ分数のまま
  const day = liftDays(senior)[0];
  const alt = alternativeCardio(profile, [], day.cardio.name, NOW, { day });
  assert.ok(alt && alt.minutes === day.cardio.minutes, `${alt?.name} ${alt?.minutes}`);
  for (const frequency of [5, 6, 7]) {
    for (const level of LEVEL_KEYS) {
      const p = planOf({ goal: "health", level, frequency });
      assert.ok(p.weeklyCardioMinutes >= 150, `f${frequency} ${level} ${p.weeklyCardioMinutes}`);
      for (const d of liftDays(p)) assert.ok(d.cardio.minutes <= 30);
    }
  }
});

test("60歳以上: 頭が下がる種目(パイク・デクライン)・ディップスは自動採用も入れ替えもしない(I21)", () => {
  const risky = /パイク|デクライン|ディップス|バーピー|ジャンピングジャック/;
  const fails = [];
  for (const eq of ["home", "home_db", "band", "gym"]) {
    for (const level of ["beginner", "intermediate"]) {
      for (const frequency of [2, 3, 4, 7]) {
        const profile = profileOf({ age: 68, goal: "health", level, frequency, equipment: EQ[eq] });
        const plan = generatePlan(profile, [], NOW);
        plan.days.forEach((d, di) => d.exercises.forEach((ex, ei) => {
          if (risky.test(ex.name)) fails.push(`${eq}/${level}/f${frequency} ${ex.name}`);
          for (const name of swapCycle(profile, plan, di, ei).seen) if (risky.test(name)) fails.push(`${eq}/${level}/f${frequency} swap ${name}`);
        }));
      }
    }
  }
  expectNone(fails, "senior risky");
  // 30歳なら自宅でもパイクプッシュアップを使う(調整は高齢者だけ)
  const young = planOf({ equipment: EQ.home, frequency: 6 });
  assert.ok(young.days.some((d) => d.exercises.some((e) => e.name === "パイクプッシュアップ")));
});

test("アクティブレストの日: 入れ替えは器具を使わない軽い種目だけで、補助扱い・セット数そのまま", () => {
  const profile = profileOf({ age: 72, goal: "health", level: "beginner", frequency: 7 });
  const plan = generatePlan(profile, [], NOW);
  const di = plan.days.findIndex((d) => d.type === "recovery");
  assert.ok(di >= 0);
  plan.days[di].exercises.forEach((ex, ei) => {
    const { seen, day } = swapCycle(profile, plan, di, ei);
    for (const name of seen) assert.equal(infoOf(name).equipment.length, 0, name);
    assert.equal(day.exercises[ei].tier, "accessory");
    assert.equal(day.exercises[ei].sets, ex.sets);
  });
  // 片脚立ちは代わりが無いので ↻ を無効にできる
  const balance = plan.days[di].exercises.findIndex((e) => e.name === "片脚立ち");
  assert.equal(hasAlternative(profile, plan.days[di], balance), false);
});

test("しばらく鍛えていない部位: 同じ種類の中で先に置き、複合種目の前に単関節・体幹を置かない(B20)", () => {
  const logs = [
    { date: "2026-09-08", entries: [
      { name: "バーベルカール", weight: 30, reps: 10, sets: 3 },
      { name: "プランク", track: "time", seconds: 60, sets: 3 },
    ] },
    { date: "2026-09-27", entries: [
      { name: "ベンチプレス", weight: 80, reps: 8, sets: 3 },
      { name: "バーベルスクワット", weight: 100, reps: 8, sets: 3 },
      { name: "ラットプルダウン", weight: 50, reps: 10, sets: 3 },
      { name: "サイドレイズ", weight: 8, reps: 12, sets: 3 },
      { name: "デッドリフト", weight: 120, reps: 5, sets: 3 },
    ] },
  ];
  const fails = [];
  for (const eq of ["gym", "home_db", "home"]) {
    for (const frequency of [2, 3, 4, 5, 6]) {
      const plan = generatePlan(profileOf({ frequency, equipment: EQ[eq] }), logs, NOW);
      assert.ok(plan.historySummary.includes("しばらく鍛えていない部位: 腕・体幹(同じ種類の中で優先して配置)"));
      for (const d of liftDays(plan)) {
        const tiers = d.exercises.map((e) => tierOf(e.name));
        if (tiers.some((t, i) => i > 0 && t < tiers[i - 1])) fails.push(`${eq}/f${frequency} ${d.title} ${d.exercises.map((e) => e.name)}`);
        // 単関節の中では、腕(しばらく空いた部位)が先
        const iso = d.exercises.filter((e) => tierOf(e.name) === 2).map((e) => e.muscle === "arms");
        if (iso.indexOf(false) >= 0 && iso.slice(iso.indexOf(false)).includes(true)) fails.push(`${eq}/f${frequency} ${d.title} stale order`);
      }
    }
  }
  expectNone(fails, "stale order");
  // 3週間空いた種目は約8割の重さから、最近の種目はダブルプログレッション
  const plan = generatePlan(profileOf({ frequency: 4 }), logs, NOW);
  const all = plan.days.flatMap((d) => d.exercises);
  assert.equal(all.find((e) => e.name === "バーベルカール").target.weight, 25);
  assert.equal(all.find((e) => e.name === "ベンチプレス").target.weight, 80);
});

test("入れ替え: きつく×5・楽に×1 の後でも、差し替えた行は元の行と同じセット数(B23)", () => {
  const profile = profileOf({ frequency: 4 });
  const plan = generatePlan(profile, [], NOW);
  for (let i = 0; i < 5; i++) adjustPlanVolume(plan, 1);
  adjustPlanVolume(plan, -1);
  let checked = 0;
  for (const day of plan.days) {
    day.exercises.forEach((ex, i) => {
      const alt = alternativeExercise(profile, [], day, i, NOW);
      if (!alt) return;
      checked++;
      assert.equal(alt.sets, ex.sets, `${day.title} ${ex.name}→${alt.name}`);
      assert.ok(alt.sets >= 2 && alt.sets <= 5);
    });
  }
  assert.ok(checked > 10);
});

test("保存したプラン(JSON)を読み戻しても、相談・入れ替え・時短がそのまま動く(I02)", () => {
  const profile = profileOf({ frequency: 5, focus: ["arms"] });
  const plan = clone(generatePlan(profile, [], NOW));
  assert.ok(canAdjustVolume(plan, 1));
  assert.ok(adjustPlanVolume(plan, 1) > 0);
  const alt = alternativeExercise(profile, [], plan.days[0], 1, NOW);
  assert.ok(alt && alt.name !== plan.days[0].exercises[1].name);
  plan.days[0].exercises[1] = alt;
  shortenPlan(plan);
  for (const d of plan.days) assert.equal(d.estMinutes, estimateMinutes(d));
  const again = clone(plan);
  shortenPlan(again);
  assert.deepEqual(again, plan);
  assert.deepEqual(Object.fromEntries(plan.weeklyVolume.map((v) => [v.key, v.sets])), weeklySets(plan));
});

test("旧形式(v12)のプランでも、時短・きつく・入れ替えが落ちない", () => {
  const legacy = {
    bmi: { value: 22.9, category: "普通体重" }, splitName: "Push / Pull / Legs", repScheme: "", focusLabels: ["腕"],
    advice: { protein: "", calories: "", tips: [] }, historySummary: null,
    days: [{
      title: "Day 1:Push(胸・肩・腕)", warmup: ["軽い有酸素 5分"], cooldown: ["腹筋ストレッチ(うつ伏せで上体を反らす)"],
      exercises: [
        { name: "ベンチプレス", muscle: "chest", sets: 4, reps: "8〜12回", rest: "90秒", note: null, focused: false },
        { name: "ダンベルプレス", muscle: "chest", sets: 4, reps: "8〜12回", rest: "90秒", note: null, focused: false },
        { name: "オーバーヘッドプレス", muscle: "shoulders", sets: 4, reps: "8〜12回", rest: "90秒", note: null, focused: false },
        { name: "プランク", muscle: "core", sets: 3, reps: "30〜60秒キープ", rest: "45〜60秒", note: null, focused: false },
        { name: "バーベルカール", muscle: "arms", sets: 3, reps: "8〜12回", rest: "60秒", note: null, focused: true },
      ],
      cardio: { name: "ランニング", duration: "20〜30分", note: null, isPool: false },
    }],
  };
  const profile = profileOf({ focus: ["arms"] });
  const plan = clone(legacy);
  assert.ok(adjustPlanVolume(plan, 1) > 0);
  // 旧形式の行でも動作パターンで入れ替える(カールはカールの中で)
  const alt = alternativeExercise(profile, [], plan.days[0], 4, NOW);
  assert.ok(alt && infoOf(alt.name).pattern === "biceps", alt?.name);
  shortenPlan(plan);
  const d = plan.days[0];
  assert.ok(d.exercises.some((e) => e.name === "バーベルカール"), "★ is kept");
  assert.equal(d.exercises[0].name, "ベンチプレス");
  assert.ok(d.exercises[0].sets <= 3 && d.exercises.slice(1).every((e) => e.sets <= 2));
  assert.ok(d.estMinutes > 0 && d.estMinutes <= 45, `${d.estMinutes}`);
  if (!d.exercises.some((e) => e.muscle === "core")) assert.ok(!/腹筋ストレッチ/.test(d.cooldown.join("")));
});

test("記録が増えたら保存済みメニューの前回・目標を付け直す(refreshTargets, I02/I19)", () => {
  const profile = profileOf({ equipment: EQ.barbell.concat(["dumbbell"]) });
  const first = [{ id: "a", date: "2026-09-26", entries: [{ name: "ベンチプレス", track: "weight", weight: 75, reps: 10, sets: 3 }] }];
  const plan = generatePlan(profile, first, NOW);
  const day = plan.days.find((d) => d.exercises.some((e) => e.name === "ベンチプレス"));
  assert.ok(day, "bench day exists");
  const bench = () => day.exercises.find((e) => e.name === "ベンチプレス");
  const before = bench().target;
  assert.ok(before?.weight > 0, JSON.stringify(before));
  // 目標どおりに記録した翌週: 同じ重量で回数を伸ばす目標へ進み、前回の日付も新しくなる
  const logs = [{ id: "b", date: "2026-10-01", entries: [{ name: "ベンチプレス", track: "weight", weight: before.weight, reps: before.reps, sets: 3 }] }, ...first];
  const later = new Date(2026, 9, 8, 12, 0, 0);
  assert.equal(planner.refreshTargets(plan, logs, profile, later), true);
  assert.match(bench().note, /^前回\(10\/1\)/);
  assert.equal(bench().target.weight, before.weight);
  assert.equal(bench().target.reps, before.reps + 1);
  // 同じ記録でもう一度呼んでも変わらない
  assert.equal(planner.refreshTargets(plan, logs, profile, later), false);
  // 記録を消すと前回・目標も消える
  planner.refreshTargets(plan, [], profile, later);
  assert.equal(bench().note, null);
  assert.equal(bench().target, undefined);
});

test("重り種目を 0kg で記録しても自重の目標にしない・最初の目安の重さ", () => {
  const r = progressionTarget({ name: "ベンチプレス", date: "2026-09-26", weight: 0, reps: 8, sets: 4 },
    { name: "ベンチプレス", reps: "8〜12回" }, { level: "intermediate" }, NOW);
  assert.equal(r.weight, null);
  assert.equal(r.reps, 9);
  assert.match(r.text, /9回できる重さ/);
  // 自重の種目は今までどおり
  assert.equal(progressionTarget({ name: "腕立て伏せ", date: "2026-09-26", weight: 0, reps: 12 },
    { name: "腕立て伏せ", reps: "10〜20回" }, { level: "intermediate" }, NOW).weight, 0);
  assert.equal(planner.startingWeight("ベンチプレス"), 20);
  assert.ok(planner.startingWeight("サイドレイズ") > 0);
  assert.ok(WEIGHT_CHOICES.includes(planner.startingWeight("サイドレイズ")));
  assert.equal(planner.startingWeight("腕立て伏せ"), null);
  assert.equal(planner.startingWeight("プランク"), null);
});

test("任意の軽い泳ぎには前回+25m の目標を付けない(処方どおりの距離)", () => {
  const logs = [{ id: "s", date: "2026-09-26", entries: [{ name: "水泳(平泳ぎ)", track: "cardio", minutes: 25, distance: 750, unit: "m" }] }];
  const profile = profileOf({ goal: "hypertrophy", equipment: ["pool", ...EQ.gym] });
  const plan = generatePlan(profile, logs, NOW);
  const optional = plan.days.map((d) => d.cardio).filter((c) => c?.optional);
  assert.ok(optional.length > 0, "optional swim exists");
  for (const c of optional) {
    assert.equal(c.target, undefined, JSON.stringify(c));
    assert.ok(c.distanceM > 0 && c.distanceM % 25 === 0);
  }
  planner.refreshTargets(plan, logs, profile, NOW);
  for (const c of plan.days.map((d) => d.cardio).filter((x) => x?.optional)) assert.equal(c.target, undefined);
});
