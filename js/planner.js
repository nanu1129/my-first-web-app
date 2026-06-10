// 筋トレメニューのルールベース生成ロジック。
// 純粋関数のみで構成し、ブラウザ・Node どちらでも動作する(テスト可能にするため)。

export const EQUIPMENT = {
  barbell: "バーベル(ラック・プレート)",
  dumbbell: "ダンベル",
  kettlebell: "ケトルベル",
  machine: "マシン一式(下の個別マシンすべて)",
  mc_chest_press: "チェストプレスマシン",
  mc_pec_fly: "ペックフライ(チェストフライ)マシン",
  mc_lat_pulldown: "ラットプルダウンマシン",
  mc_seated_row: "シーテッドロー(ローイング)マシン",
  mc_shoulder_press: "ショルダープレスマシン",
  mc_leg_press: "レッグプレスマシン",
  mc_leg_extension: "レッグエクステンションマシン",
  mc_leg_curl: "レッグカールマシン",
  mc_smith: "スミスマシン",
  mc_abdominal: "アブドミナルクランチマシン",
  cable: "ケーブルマシン",
  pullup_bar: "懸垂バー",
  bench: "トレーニングベンチ",
  band: "レジスタンスバンド",
  pool: "プール",
  treadmill: "ランニングマシン / 屋外ランニング",
  bike: "エアロバイク",
  mc_rowing: "ローイングエルゴメーター",
};

// 「マシン一式」を選んだときに使えるとみなす個別マシン
export const MACHINE_KEYS = [
  "mc_chest_press", "mc_pec_fly", "mc_lat_pulldown", "mc_seated_row",
  "mc_shoulder_press", "mc_leg_press", "mc_leg_extension", "mc_leg_curl",
  "mc_smith", "mc_abdominal", "cable",
];

export const EQUIPMENT_GROUPS = [
  { label: "フリーウェイト系", keys: ["barbell", "dumbbell", "kettlebell"] },
  { label: "ジムマシン", keys: ["machine", ...MACHINE_KEYS] },
  { label: "その他設備", keys: ["pullup_bar", "bench", "band"] },
  { label: "有酸素・施設系", keys: ["pool", "treadmill", "bike", "mc_rowing"] },
];

export const PRESETS = {
  gym: {
    label: "ジム(フル装備)",
    keys: [
      "barbell", "dumbbell", "kettlebell", "machine", ...MACHINE_KEYS,
      "pullup_bar", "bench", "treadmill", "bike", "mc_rowing",
    ],
  },
  home: { label: "自宅(自重のみ)", keys: [] },
  home_db: { label: "自宅+ダンベル", keys: ["dumbbell", "bench"] },
};

export const GOALS = {
  hypertrophy: "筋肥大",
  cut: "減量・引き締め",
  strength: "筋力・体力向上",
  health: "健康維持",
};

export const LEVELS = { beginner: "初心者", intermediate: "中級者", advanced: "上級者" };
const LEVEL_NUM = { beginner: 1, intermediate: 2, advanced: 3 };

// 種目データベース。
// equipment: 実施に必要な器具タグ(空配列 = 自重のみで可能)
// level: 推奨される最低レベル(1=初心者OK)
// priority: 同部位内での優先度(高いほど先に採用)
// kind: compound(多関節) / isolation(単関節) / cardio(有酸素)
const EXERCISES = [
  // --- 胸 ---
  { name: "ベンチプレス", muscle: "chest", equipment: ["barbell", "bench"], level: 1, priority: 10, kind: "compound" },
  { name: "インクラインベンチプレス", muscle: "chest", equipment: ["barbell", "bench"], level: 2, priority: 8, kind: "compound" },
  { name: "ダンベルプレス", muscle: "chest", equipment: ["dumbbell", "bench"], level: 1, priority: 9, kind: "compound" },
  { name: "ダンベルフライ", muscle: "chest", equipment: ["dumbbell", "bench"], level: 1, priority: 6, kind: "isolation" },
  { name: "チェストプレス(マシン)", muscle: "chest", equipment: ["mc_chest_press"], level: 1, priority: 8, kind: "compound" },
  { name: "ペックフライ(マシン)", muscle: "chest", equipment: ["mc_pec_fly"], level: 1, priority: 6, kind: "isolation" },
  { name: "ケーブルクロスオーバー", muscle: "chest", equipment: ["cable"], level: 2, priority: 5, kind: "isolation" },
  { name: "バンドチェストプレス", muscle: "chest", equipment: ["band"], level: 1, priority: 4, kind: "compound" },
  { name: "スミスマシンベンチプレス", muscle: "chest", equipment: ["mc_smith", "bench"], level: 1, priority: 7, kind: "compound" },
  { name: "腕立て伏せ", muscle: "chest", equipment: [], level: 1, priority: 7, kind: "compound" },
  { name: "ワイドプッシュアップ", muscle: "chest", equipment: [], level: 1, priority: 5, kind: "compound" },
  { name: "デクラインプッシュアップ", muscle: "chest", equipment: [], level: 2, priority: 5, kind: "compound" },

  // --- 背中 ---
  { name: "デッドリフト", muscle: "back", equipment: ["barbell"], level: 2, priority: 10, kind: "compound" },
  { name: "ベントオーバーロー", muscle: "back", equipment: ["barbell"], level: 2, priority: 9, kind: "compound" },
  { name: "ラットプルダウン", muscle: "back", equipment: ["mc_lat_pulldown"], level: 1, priority: 8, kind: "compound" },
  { name: "シーテッドロー(マシン)", muscle: "back", equipment: ["mc_seated_row"], level: 1, priority: 7, kind: "compound" },
  { name: "ケーブルロー", muscle: "back", equipment: ["cable"], level: 1, priority: 7, kind: "compound" },
  { name: "懸垂(チンニング)", muscle: "back", equipment: ["pullup_bar"], level: 2, priority: 9, kind: "compound" },
  { name: "斜め懸垂(インバーテッドロー)", muscle: "back", equipment: ["pullup_bar"], level: 1, priority: 6, kind: "compound" },
  { name: "ワンハンドダンベルロー", muscle: "back", equipment: ["dumbbell"], level: 1, priority: 8, kind: "compound" },
  { name: "ダンベルデッドリフト", muscle: "back", equipment: ["dumbbell"], level: 1, priority: 7, kind: "compound" },
  { name: "バンドロー", muscle: "back", equipment: ["band"], level: 1, priority: 4, kind: "compound" },
  { name: "スーパーマン(バックエクステンション)", muscle: "back", equipment: [], level: 1, priority: 3, kind: "isolation" },

  // --- 脚 ---
  { name: "バーベルスクワット", muscle: "legs", equipment: ["barbell"], level: 1, priority: 10, kind: "compound" },
  { name: "ルーマニアンデッドリフト", muscle: "legs", equipment: ["barbell"], level: 2, priority: 8, kind: "compound" },
  { name: "レッグプレス", muscle: "legs", equipment: ["mc_leg_press"], level: 1, priority: 8, kind: "compound" },
  { name: "レッグエクステンション", muscle: "legs", equipment: ["mc_leg_extension"], level: 1, priority: 5, kind: "isolation" },
  { name: "レッグカール", muscle: "legs", equipment: ["mc_leg_curl"], level: 1, priority: 5, kind: "isolation" },
  { name: "ゴブレットスクワット", muscle: "legs", equipment: ["dumbbell"], level: 1, priority: 7, kind: "compound" },
  { name: "ダンベルランジ", muscle: "legs", equipment: ["dumbbell"], level: 1, priority: 7, kind: "compound" },
  { name: "ブルガリアンスクワット", muscle: "legs", equipment: ["dumbbell", "bench"], level: 2, priority: 8, kind: "compound" },
  { name: "ケトルベルスイング", muscle: "legs", equipment: ["kettlebell"], level: 1, priority: 7, kind: "compound" },
  { name: "スミスマシンスクワット", muscle: "legs", equipment: ["mc_smith"], level: 1, priority: 8, kind: "compound" },
  { name: "自重スクワット", muscle: "legs", equipment: [], level: 1, priority: 6, kind: "compound" },
  { name: "フォワードランジ", muscle: "legs", equipment: [], level: 1, priority: 5, kind: "compound" },
  { name: "ヒップリフト", muscle: "legs", equipment: [], level: 1, priority: 4, kind: "isolation" },
  { name: "カーフレイズ", muscle: "legs", equipment: [], level: 1, priority: 3, kind: "isolation" },

  // --- 肩 ---
  { name: "オーバーヘッドプレス", muscle: "shoulders", equipment: ["barbell"], level: 2, priority: 9, kind: "compound" },
  { name: "ダンベルショルダープレス", muscle: "shoulders", equipment: ["dumbbell"], level: 1, priority: 8, kind: "compound" },
  { name: "サイドレイズ", muscle: "shoulders", equipment: ["dumbbell"], level: 1, priority: 6, kind: "isolation" },
  { name: "リアレイズ", muscle: "shoulders", equipment: ["dumbbell"], level: 1, priority: 5, kind: "isolation" },
  { name: "ショルダープレス(マシン)", muscle: "shoulders", equipment: ["mc_shoulder_press"], level: 1, priority: 7, kind: "compound" },
  { name: "ケーブルサイドレイズ", muscle: "shoulders", equipment: ["cable"], level: 2, priority: 5, kind: "isolation" },
  { name: "バンドサイドレイズ", muscle: "shoulders", equipment: ["band"], level: 1, priority: 4, kind: "isolation" },
  { name: "パイクプッシュアップ", muscle: "shoulders", equipment: [], level: 1, priority: 5, kind: "compound" },

  // --- 腕 ---
  { name: "バーベルカール", muscle: "arms", equipment: ["barbell"], level: 1, priority: 6, kind: "isolation" },
  { name: "ナローベンチプレス", muscle: "arms", equipment: ["barbell", "bench"], level: 2, priority: 6, kind: "compound" },
  { name: "ダンベルカール", muscle: "arms", equipment: ["dumbbell"], level: 1, priority: 6, kind: "isolation" },
  { name: "ハンマーカール", muscle: "arms", equipment: ["dumbbell"], level: 1, priority: 5, kind: "isolation" },
  { name: "ダンベルフレンチプレス", muscle: "arms", equipment: ["dumbbell"], level: 1, priority: 5, kind: "isolation" },
  { name: "トライセプスプレスダウン", muscle: "arms", equipment: ["cable"], level: 1, priority: 5, kind: "isolation" },
  { name: "バンドカール", muscle: "arms", equipment: ["band"], level: 1, priority: 3, kind: "isolation" },
  { name: "ディップス(椅子・台を利用)", muscle: "arms", equipment: [], level: 1, priority: 4, kind: "compound" },

  // --- 体幹 ---
  { name: "プランク", muscle: "core", equipment: [], level: 1, priority: 7, kind: "isolation" },
  { name: "クランチ", muscle: "core", equipment: [], level: 1, priority: 5, kind: "isolation" },
  { name: "レッグレイズ", muscle: "core", equipment: [], level: 1, priority: 5, kind: "isolation" },
  { name: "ロシアンツイスト", muscle: "core", equipment: [], level: 1, priority: 4, kind: "isolation" },
  { name: "ハンギングレッグレイズ", muscle: "core", equipment: ["pullup_bar"], level: 2, priority: 6, kind: "isolation" },
  { name: "ケーブルクランチ", muscle: "core", equipment: ["cable"], level: 2, priority: 5, kind: "isolation" },
  { name: "アブドミナルクランチ(マシン)", muscle: "core", equipment: ["mc_abdominal"], level: 1, priority: 6, kind: "isolation" },

  // --- 有酸素 ---
  { name: "水泳(クロール)", muscle: "cardio", equipment: ["pool"], level: 2, priority: 10, kind: "cardio" },
  { name: "水中ウォーキング", muscle: "cardio", equipment: ["pool"], level: 1, priority: 8, kind: "cardio" },
  { name: "ランニング", muscle: "cardio", equipment: ["treadmill"], level: 1, priority: 8, kind: "cardio" },
  { name: "エアロバイク", muscle: "cardio", equipment: ["bike"], level: 1, priority: 7, kind: "cardio" },
  { name: "ローイングエルゴメーター", muscle: "cardio", equipment: ["mc_rowing"], level: 1, priority: 7, kind: "cardio" },
  { name: "バーピー", muscle: "cardio", equipment: [], level: 2, priority: 6, kind: "cardio" },
  { name: "ジャンピングジャック+その場ジョギング", muscle: "cardio", equipment: [], level: 1, priority: 5, kind: "cardio" },
];

// 目的別のセット・レップ・休憩設定
const GOAL_PARAMS = {
  hypertrophy: {
    compound: { sets: 4, reps: "8〜12回", rest: "90秒" },
    isolation: { sets: 3, reps: "10〜12回", rest: "60秒" },
    cardioMin: null,
  },
  cut: {
    compound: { sets: 3, reps: "12〜15回", rest: "45〜60秒" },
    isolation: { sets: 3, reps: "15回", rest: "30〜45秒" },
    cardioMin: "20〜30分",
  },
  strength: {
    compound: { sets: 5, reps: "4〜6回", rest: "2〜3分" },
    isolation: { sets: 3, reps: "8〜10回", rest: "90秒" },
    cardioMin: "15〜20分",
  },
  health: {
    compound: { sets: 3, reps: "10〜15回", rest: "60秒" },
    isolation: { sets: 2, reps: "12〜15回", rest: "60秒" },
    cardioMin: "10〜15分(軽め)",
  },
};

export function calcBmi(weightKg, heightCm) {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  let category;
  if (bmi < 18.5) category = "低体重(やせ気味)";
  else if (bmi < 25) category = "普通体重";
  else if (bmi < 30) category = "肥満(1度)";
  else category = "肥満(2度以上)";
  return { value: Math.round(bmi * 10) / 10, category };
}

function isAvailable(exercise, selectedSet) {
  return exercise.equipment.every((tag) => selectedSet.has(tag));
}

// 指定部位から、使える器具とレベルに合う種目を優先度順に1つ選ぶ
function pickExercise(muscle, selectedSet, levelNum, used) {
  const candidates = EXERCISES.filter(
    (e) => e.muscle === muscle && isAvailable(e, selectedSet) && !used.has(e.name)
  ).sort((a, b) => b.priority - a.priority);
  // レベルに合うものを優先し、無ければレベル制限を緩めて選ぶ
  const fit = candidates.find((e) => e.level <= levelNum) ?? candidates[0];
  if (fit) used.add(fit.name);
  return fit ?? null;
}

function pickCardio(selectedSet, levelNum) {
  const used = new Set();
  return pickExercise("cardio", selectedSet, levelNum, used);
}

// 週頻度から分割法と各日の対象部位を決める
function buildSplit(frequency) {
  if (frequency <= 2) {
    return {
      name: "全身法(フルボディ)",
      days: Array.from({ length: frequency }, (_, i) => ({
        title: `Day ${i + 1}:全身`,
        muscles: ["legs", "chest", "back", "shoulders", "core"],
      })),
    };
  }
  if (frequency <= 4) {
    const upper = { title: "上半身", muscles: ["chest", "back", "shoulders", "arms", "core"] };
    const lower = { title: "下半身", muscles: ["legs", "legs", "legs", "core"] };
    const days = [];
    for (let i = 0; i < frequency; i++) {
      const base = i % 2 === 0 ? upper : lower;
      days.push({ title: `Day ${i + 1}:${base.title}`, muscles: [...base.muscles] });
    }
    return { name: "上半身・下半身 2分割", days };
  }
  const cycle = [
    { title: "Push(胸・肩・腕)", muscles: ["chest", "chest", "shoulders", "shoulders", "arms"] },
    { title: "Pull(背中・腕)", muscles: ["back", "back", "back", "arms", "core"] },
    { title: "Legs(脚・体幹)", muscles: ["legs", "legs", "legs", "core"] },
  ];
  const days = [];
  for (let i = 0; i < frequency; i++) {
    const base = cycle[i % 3];
    days.push({ title: `Day ${i + 1}:${base.title}`, muscles: [...base.muscles] });
  }
  return { name: "Push / Pull / Legs 3分割", days };
}

function buildAdvice(profile, bmi) {
  const w = profile.weight;
  const tips = [];
  let protein;
  let calories;

  switch (profile.goal) {
    case "hypertrophy":
      protein = `1日あたり ${Math.round(w * 1.6)}〜${Math.round(w * 2.2)}g(体重×1.6〜2.2g)`;
      calories = "メンテナンスカロリー+200〜300kcal を目安に、少しずつ増量しましょう。";
      tips.push("漸進性過負荷:同じ重量・回数がこなせたら、次回は重量か回数を少し増やしましょう。");
      break;
    case "cut":
      protein = `1日あたり ${Math.round(w * 1.8)}〜${Math.round(w * 2.2)}g(筋肉量を守るため多めに)`;
      calories = "メンテナンスカロリー−300〜500kcal を目安に。急激な減量は筋肉も落ちるので避けましょう。";
      tips.push("筋トレ後の有酸素運動は脂肪燃焼に効果的です。無理のない強度で継続しましょう。");
      break;
    case "strength":
      protein = `1日あたり ${Math.round(w * 1.6)}〜${Math.round(w * 2.0)}g(体重×1.6〜2.0g)`;
      calories = "メンテナンスカロリー前後を維持し、トレーニング前は炭水化物をしっかり摂りましょう。";
      tips.push("高重量・低回数では正しいフォームが最重要です。重量を欲張らず段階的に伸ばしましょう。");
      break;
    default:
      protein = `1日あたり ${Math.round(w * 1.2)}〜${Math.round(w * 1.6)}g(体重×1.2〜1.6g)`;
      calories = "バランスの良い食事を心がけ、極端な増減は不要です。";
      tips.push("「続けること」が最大の効果を生みます。きつい日はセット数を減らしてもOKです。");
  }

  tips.push("各種目の最初は軽い重量でウォームアップセットを1〜2セット行いましょう。");
  tips.push("睡眠を7時間以上確保すると回復と成長が促進されます。");
  if (bmi.value < 18.5 && profile.goal === "cut") {
    tips.push("BMIが低体重の範囲です。減量よりも筋肉をつける方向(食事量アップ)を検討してください。");
  }
  if (profile.age >= 50) {
    tips.push("関節への負担に注意し、痛みを感じたらすぐ中止してください。週1回は完全休養日を設けましょう。");
  }
  if (profile.equipment.includes("pool") && profile.goal === "hypertrophy") {
    tips.push("休養日に軽い水泳や水中ウォーキングを行うと、関節に優しく回復(アクティブレスト)に役立ちます。");
  }

  return { protein, calories, tips };
}

// メイン:プロフィールから1週間のメニューを生成する
// profile: { weight, height, age, gender, goal, level, frequency, equipment: string[] }
export function generatePlan(profile) {
  const levelNum = LEVEL_NUM[profile.level] ?? 1;
  const selectedSet = new Set(profile.equipment);
  // 「マシン一式」選択時は個別マシンすべてを使えるものとして扱う
  if (selectedSet.has("machine")) {
    for (const key of MACHINE_KEYS) selectedSet.add(key);
  }
  const bmi = calcBmi(profile.weight, profile.height);
  const split = buildSplit(profile.frequency);
  const params = GOAL_PARAMS[profile.goal] ?? GOAL_PARAMS.health;
  const cardio = params.cardioMin ? pickCardio(selectedSet, levelNum) : null;

  const days = split.days.map((day) => {
    const used = new Set();
    const exercises = [];
    for (const muscle of day.muscles) {
      const ex = pickExercise(muscle, selectedSet, levelNum, used);
      if (!ex) continue;
      const p = ex.kind === "compound" ? params.compound : params.isolation;
      exercises.push({
        name: ex.name,
        sets: p.sets,
        reps: ex.name === "プランク" ? "30〜60秒キープ" : p.reps,
        rest: p.rest,
      });
    }
    return {
      title: day.title,
      exercises,
      cardio: cardio ? { name: cardio.name, duration: params.cardioMin } : null,
    };
  });

  return {
    bmi,
    splitName: split.name,
    days,
    advice: buildAdvice(profile, bmi),
  };
}
