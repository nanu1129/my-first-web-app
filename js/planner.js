// 筋トレメニューのルールベース生成ロジック(内蔵アルゴリズムのみ。外部サービスは使わない)。
// 純粋関数のみで構成し、ブラウザ・Node どちらでも動作する(テスト可能にするため)。
//
// コーチの考え方をルール化している:
// - 種目は「部位(muscle: 胸/背中/脚/肩/腕/体幹)」に加えて、細かい筋肉(sub: 上腕三頭筋・肩の側部・
//   ハムストリング・ふくらはぎ等)と動作パターン(pattern: 水平プレス・垂直プル・ヒンジ等)を持つ
// - 各日は動作パターンの枠(スロット)で組み立てる。枠が器具・レベルで埋まらなければ同系統の代替、
//   それも無ければ省略する(レベル制限は絶対に超えない)
// - 1日の並びは「複合種目 → 腕の複合 → 単関節 → 体幹・キープ」。★強化部位は同じ種類の中で先頭
// - 週のセット数を筋肉ごとに目標帯へ収める(目的・レベル・強化部位で帯を調整)
// - 役割(メイン/サブ/補助)ごとに回数・休憩を変え、前回記録からダブルプログレッションで目標を出す

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

// 「特に鍛えたい部位」チップ・記録の集計に使う大分類(6部位+有酸素)
export const MUSCLE_LABELS = {
  chest: "胸", back: "背中", legs: "脚",
  shoulders: "肩", arms: "腕", core: "体幹", cardio: "有酸素",
};

// 週のセット数を管理する細かい筋肉。group は上の大分類(強化部位チップ)に対応する。
// size: major=大筋群 / minor=小筋群 / core=体幹(それぞれ週の目標帯が異なる)
export const SUB_MUSCLES = {
  chest: { label: "胸", group: "chest", size: "major" },
  back: { label: "背中", group: "back", size: "major" },
  front_delt: { label: "肩(前部)", group: "shoulders", size: "minor" },
  side_delt: { label: "肩(側部)", group: "shoulders", size: "minor" },
  rear_delt: { label: "肩(後部)", group: "shoulders", size: "minor" },
  biceps: { label: "上腕二頭筋", group: "arms", size: "minor" },
  triceps: { label: "上腕三頭筋", group: "arms", size: "minor" },
  quads: { label: "もも前", group: "legs", size: "major" },
  hamstrings: { label: "もも裏", group: "legs", size: "major" },
  glutes: { label: "お尻", group: "legs", size: "minor" },
  calves: { label: "ふくらはぎ", group: "legs", size: "minor" },
  core: { label: "体幹", group: "core", size: "core" },
};
const SUB_ORDER = Object.keys(SUB_MUSCLES);

// 動作パターン → 主に鍛える細かい筋肉
const PATTERN_SUB = {
  h_push: "chest", incline_push: "chest", chest_fly: "chest",
  v_push: "front_delt", lateral: "side_delt", rear_delt: "rear_delt",
  v_pull: "back", h_pull: "back", back_ext: "back",
  biceps: "biceps", triceps: "triceps",
  squat: "quads", lunge: "quads", knee_ext: "quads",
  hinge: "hamstrings", knee_flex: "hamstrings", glute: "glutes", calf: "calves",
  core: "core",
};

// 種目データベース(種目名は記録のキーなので既存名は変更しない)。
// pattern: 動作パターン / equipment: 必要な器具タグ(空配列 = 自重のみで可能)
// level: 推奨される最低レベル(1=初心者OK。これを超える種目は絶対に選ばない)
// priority: 同パターン内での優先度(高いほど先に採用) / kind: compound(多関節)・isolation(単関節)・cardio
// 任意の属性:
//   style   回数表記の方式 bw=自重 / bw_pull=懸垂系 / neg=ネガティブ / high=高回数 / hold=時間キープ
//   heavy   背骨に負荷がかかるバーベル種目(回数は10回まで・休憩2分以上)
//   uni     左右別に行う種目 / mainOnly その日のメイン枠でのみ自動採用(デッドリフト)
//   harder/easier  自重種目の難易度の上下(前回記録から次の種目を提案する)
//   regression     やさしい入門バリエーション(高BMI・高齢の人に優先)
//   avoid   ["senior"] = 60歳以上には自動採用しない / impact 有酸素の衝撃 high/low / modality 有酸素の種類
const E = (name, muscle, pattern, equipment, level, priority, kind, opts = {}) => ({
  name, muscle, pattern, equipment, level, priority, kind, ...opts,
});

const EXERCISES = [
  // --- 胸 ---
  E("ベンチプレス", "chest", "h_push", ["barbell", "bench"], 1, 10, "compound", { heavy: true }),
  E("インクラインベンチプレス", "chest", "incline_push", ["barbell", "bench"], 1, 8, "compound", { heavy: true }),
  E("ダンベルプレス", "chest", "h_push", ["dumbbell", "bench"], 1, 9, "compound"),
  E("インクラインダンベルプレス", "chest", "incline_push", ["dumbbell", "bench"], 1, 8, "compound"),
  E("ダンベルフライ", "chest", "chest_fly", ["dumbbell", "bench"], 1, 6, "isolation"),
  E("チェストプレス(マシン)", "chest", "h_push", ["mc_chest_press"], 1, 8, "compound"),
  E("ペックフライ(マシン)", "chest", "chest_fly", ["mc_pec_fly"], 1, 6, "isolation"),
  E("ケーブルクロスオーバー", "chest", "chest_fly", ["cable"], 1, 5, "isolation"),
  E("バンドチェストプレス", "chest", "h_push", ["band"], 1, 4, "compound"),
  E("スミスマシンベンチプレス", "chest", "h_push", ["mc_smith", "bench"], 1, 7, "compound"),
  E("腕立て伏せ", "chest", "h_push", [], 1, 7, "compound",
    { style: "bw", harder: "デクラインプッシュアップ", easier: "膝つき腕立て伏せ" }),
  E("ワイドプッシュアップ", "chest", "h_push", [], 1, 5, "compound", { style: "bw", easier: "膝つき腕立て伏せ" }),
  E("膝つき腕立て伏せ", "chest", "h_push", [], 1, 3, "compound",
    { style: "bw", harder: "腕立て伏せ", easier: "インクラインプッシュアップ(台に手)", regression: true }),
  E("インクラインプッシュアップ(台に手)", "chest", "h_push", [], 1, 2, "compound",
    { style: "bw", harder: "膝つき腕立て伏せ", regression: true }),
  // 頭が心臓より低くなる種目(デクライン・パイク)は60歳以上には自動採用しない(血圧・めまい対策)
  E("デクラインプッシュアップ", "chest", "incline_push", [], 2, 5, "compound",
    { style: "bw", easier: "腕立て伏せ", avoid: ["senior"] }),

  // --- 背中 ---
  E("デッドリフト", "back", "hinge", ["barbell"], 2, 10, "compound", { sub: "hamstrings", heavy: true, mainOnly: true }),
  E("ベントオーバーロー", "back", "h_pull", ["barbell"], 2, 9, "compound", { heavy: true }),
  E("ラットプルダウン", "back", "v_pull", ["mc_lat_pulldown"], 1, 8, "compound"),
  E("シーテッドロー(マシン)", "back", "h_pull", ["mc_seated_row"], 1, 7, "compound"),
  E("ケーブルロー", "back", "h_pull", ["cable"], 1, 7, "compound"),
  E("懸垂(チンニング)", "back", "v_pull", ["pullup_bar"], 2, 9, "compound", { style: "bw_pull", easier: "ネガティブ懸垂" }),
  E("ネガティブ懸垂", "back", "v_pull", ["pullup_bar"], 1, 5, "compound", { style: "neg", harder: "懸垂(チンニング)" }),
  E("斜め懸垂(インバーテッドロー)", "back", "h_pull", ["pullup_bar"], 1, 6, "compound", { style: "bw", harder: "懸垂(チンニング)" }),
  E("ワンハンドダンベルロー", "back", "h_pull", ["dumbbell"], 1, 8, "compound", { uni: true }),
  E("ダンベルベントオーバーロー", "back", "h_pull", ["dumbbell"], 1, 7, "compound"),
  E("ダンベルプルオーバー", "back", "v_pull", ["dumbbell", "bench"], 1, 5, "isolation"),
  E("ダンベルデッドリフト", "back", "hinge", ["dumbbell"], 1, 7, "compound", { sub: "hamstrings" }),
  E("バンドロー", "back", "h_pull", ["band"], 1, 4, "compound"),
  E("バンドプルダウン", "back", "v_pull", ["band"], 1, 4, "compound"),
  E("リュックロー", "back", "h_pull", [], 1, 2, "compound", { style: "bw" }),
  E("スーパーマン(バックエクステンション)", "back", "back_ext", [], 1, 3, "isolation", { style: "high" }),
  E("リバーススノーエンジェル", "back", "back_ext", [], 1, 2, "isolation", { style: "high" }),

  // --- 脚 ---
  E("バーベルスクワット", "legs", "squat", ["barbell"], 1, 10, "compound", { heavy: true }),
  E("ルーマニアンデッドリフト", "legs", "hinge", ["barbell"], 2, 8, "compound", { heavy: true }),
  E("レッグプレス", "legs", "squat", ["mc_leg_press"], 1, 8, "compound"),
  E("レッグエクステンション", "legs", "knee_ext", ["mc_leg_extension"], 1, 5, "isolation"),
  E("レッグカール", "legs", "knee_flex", ["mc_leg_curl"], 1, 6, "isolation"),
  E("ゴブレットスクワット", "legs", "squat", ["dumbbell"], 1, 7, "compound"),
  E("ダンベルランジ", "legs", "lunge", ["dumbbell"], 1, 7, "compound", { uni: true }),
  E("ブルガリアンスクワット", "legs", "lunge", ["dumbbell", "bench"], 2, 8, "compound", { uni: true }),
  E("ケトルベルスイング", "legs", "hinge", ["kettlebell"], 1, 7, "compound", { style: "high" }),
  E("スミスマシンスクワット", "legs", "squat", ["mc_smith"], 1, 8, "compound"),
  E("ダンベルルーマニアンデッドリフト", "legs", "hinge", ["dumbbell"], 1, 7.5, "compound"),
  E("ケーブルプルスルー", "legs", "hinge", ["cable"], 1, 5, "compound"),
  E("ヒップスラスト", "legs", "glute", ["barbell", "bench"], 2, 7, "compound"),
  E("自重スクワット", "legs", "squat", [], 1, 6, "compound",
    { style: "bw", harder: "フォワードランジ", easier: "椅子スクワット" }),
  E("椅子スクワット", "legs", "squat", [], 1, 3, "compound", { style: "bw", harder: "自重スクワット", regression: true }),
  E("フォワードランジ", "legs", "lunge", [], 1, 5, "compound", { style: "bw", uni: true, easier: "リバースランジ" }),
  E("リバースランジ", "legs", "lunge", [], 1, 4, "compound", { style: "bw", uni: true, harder: "フォワードランジ" }),
  E("シングルレッグRDL", "legs", "hinge", [], 1, 3, "compound", { style: "bw", uni: true }),
  E("スライディングレッグカール", "legs", "knee_flex", [], 2, 3, "isolation", { style: "bw" }),
  E("ヒップリフト", "legs", "glute", [], 1, 4, "isolation", { style: "high", harder: "片脚ヒップリフト" }),
  E("片脚ヒップリフト", "legs", "glute", [], 1, 3, "isolation", { style: "high", uni: true, easier: "ヒップリフト" }),
  E("カーフレイズ", "legs", "calf", [], 1, 3, "isolation", { style: "high", harder: "片脚カーフレイズ" }),
  E("片脚カーフレイズ", "legs", "calf", [], 1, 2, "isolation", { style: "high", uni: true, easier: "カーフレイズ" }),
  E("ダンベルカーフレイズ", "legs", "calf", ["dumbbell"], 1, 4, "isolation", { style: "high" }),
  E("スミスマシンカーフレイズ", "legs", "calf", ["mc_smith"], 1, 5, "isolation", { style: "high" }),
  E("レッグプレスカーフレイズ", "legs", "calf", ["mc_leg_press"], 1, 4, "isolation", { style: "high" }),
  E("ウォールシット(空気椅子)", "legs", "squat", [], 1, 1, "isolation", { style: "hold" }),

  // --- 肩 ---
  E("オーバーヘッドプレス", "shoulders", "v_push", ["barbell"], 1, 9, "compound", { heavy: true }),
  E("ダンベルショルダープレス", "shoulders", "v_push", ["dumbbell"], 1, 8, "compound"),
  E("サイドレイズ", "shoulders", "lateral", ["dumbbell"], 1, 6, "isolation"),
  E("リアレイズ", "shoulders", "rear_delt", ["dumbbell"], 1, 5, "isolation"),
  E("ショルダープレス(マシン)", "shoulders", "v_push", ["mc_shoulder_press"], 1, 7, "compound"),
  E("ケーブルサイドレイズ", "shoulders", "lateral", ["cable"], 1, 5, "isolation"),
  E("バンドサイドレイズ", "shoulders", "lateral", ["band"], 1, 4, "isolation"),
  E("パイクプッシュアップ", "shoulders", "v_push", [], 1, 5, "compound",
    { style: "bw", easier: "パイクプッシュアップ(台に手)", avoid: ["senior"] }),
  E("パイクプッシュアップ(台に手)", "shoulders", "v_push", [], 1, 3, "compound",
    { style: "bw", harder: "パイクプッシュアップ", regression: true, avoid: ["senior"] }),
  E("フェイスプル", "shoulders", "rear_delt", ["cable"], 1, 6, "isolation", { style: "high" }),
  E("リアデルトフライ(マシン)", "shoulders", "rear_delt", ["mc_pec_fly"], 1, 5, "isolation"),
  E("バンドプルアパート", "shoulders", "rear_delt", ["band"], 1, 4, "isolation", { style: "high" }),
  E("うつ伏せYTWレイズ", "shoulders", "rear_delt", [], 1, 2, "isolation", { style: "high" }),
  E("ペットボトルサイドレイズ", "shoulders", "lateral", [], 1, 2, "isolation", { style: "high" }),

  // --- 腕 ---
  E("バーベルカール", "arms", "biceps", ["barbell"], 1, 6, "isolation"),
  E("ナローベンチプレス", "arms", "triceps", ["barbell", "bench"], 1, 5, "compound", { heavy: true }),
  E("ダンベルカール", "arms", "biceps", ["dumbbell"], 1, 6, "isolation"),
  E("ハンマーカール", "arms", "biceps", ["dumbbell"], 1, 5, "isolation"),
  E("ダンベルフレンチプレス", "arms", "triceps", ["dumbbell"], 1, 5, "isolation"),
  E("トライセプスプレスダウン", "arms", "triceps", ["cable"], 1, 6, "isolation"),
  E("バンドカール", "arms", "biceps", ["band"], 1, 3, "isolation"),
  E("ディップス(椅子・台を利用)", "arms", "triceps", [], 1, 4, "compound", { style: "bw", avoid: ["senior"] }),
  E("ケーブルカール", "arms", "biceps", ["cable"], 1, 5, "isolation"),
  E("ダンベルキックバック", "arms", "triceps", ["dumbbell"], 1, 4, "isolation"),
  E("バンドプレスダウン", "arms", "triceps", ["band"], 1, 3, "isolation"),
  E("ダイヤモンドプッシュアップ", "arms", "triceps", [], 2, 3, "compound", { style: "bw", easier: "膝つきナロープッシュアップ" }),
  E("膝つきナロープッシュアップ", "arms", "triceps", [], 1, 2, "compound",
    { style: "bw", harder: "ダイヤモンドプッシュアップ", regression: true }),
  E("リュックカール", "arms", "biceps", [], 1, 2, "isolation", { style: "bw" }),
  E("タオルカール", "arms", "biceps", [], 1, 1, "isolation", { style: "bw" }),

  // --- 体幹 ---
  E("プランク", "core", "core", [], 1, 7, "isolation", { style: "hold" }),
  E("サイドプランク", "core", "core", [], 1, 6, "isolation", { style: "hold", uni: true }),
  E("デッドバグ", "core", "core", [], 1, 6, "isolation", { style: "high" }),
  E("クランチ", "core", "core", [], 1, 5, "isolation", { style: "high" }),
  E("レッグレイズ", "core", "core", [], 1, 5, "isolation", { style: "high" }),
  E("ロシアンツイスト", "core", "core", [], 1, 4, "isolation", { style: "high" }),
  E("バードドッグ", "core", "core", [], 1, 4, "isolation", { style: "high" }),
  E("プランクショルダータップ", "core", "core", [], 1, 4, "isolation", { style: "high" }),
  E("ハンギングレッグレイズ", "core", "core", ["pullup_bar"], 2, 6, "isolation", { style: "high" }),
  E("ケーブルクランチ", "core", "core", ["cable"], 1, 5, "isolation", { style: "high" }),
  E("アブドミナルクランチ(マシン)", "core", "core", ["mc_abdominal"], 1, 6, "isolation", { style: "high" }),
  // バランス(60歳以上の回復日・ウォームアップ用。通常の枠では自動採用しない)
  E("片脚立ち", "core", "balance", [], 1, 1, "isolation", { style: "hold", uni: true, sub: null }),

  // --- 有酸素 ---
  E("水泳(クロール)", "cardio", "cardio", ["pool"], 2, 10, "cardio", { impact: "low", modality: "swim" }),
  E("水泳(平泳ぎ)", "cardio", "cardio", ["pool"], 1, 9, "cardio", { impact: "low", modality: "swim" }),
  E("水泳(背泳ぎ)", "cardio", "cardio", ["pool"], 2, 7, "cardio", { impact: "low", modality: "swim" }),
  E("水泳(バタフライ)", "cardio", "cardio", ["pool"], 3, 5, "cardio", { impact: "low", modality: "swim" }),
  E("ビート板キック", "cardio", "cardio", ["pool"], 1, 6, "cardio", { impact: "low", modality: "swim" }),
  E("水中ウォーキング", "cardio", "cardio", ["pool"], 1, 8, "cardio", { impact: "low", modality: "walk" }),
  E("ランニング", "cardio", "cardio", ["treadmill"], 1, 8, "cardio", { impact: "high", modality: "run" }),
  E("傾斜ウォーキング(ランニングマシン)", "cardio", "cardio", ["treadmill"], 1, 6, "cardio", { impact: "low", modality: "walk" }),
  E("エアロバイク", "cardio", "cardio", ["bike"], 1, 7, "cardio", { impact: "low", modality: "bike" }),
  E("ローイングエルゴメーター", "cardio", "cardio", ["mc_rowing"], 1, 7, "cardio", { impact: "low", modality: "row" }),
  E("ウォーキング(早歩き)", "cardio", "cardio", [], 1, 5, "cardio", { impact: "low", modality: "walk" }),
  E("バーピー", "cardio", "cardio", [], 2, 6, "cardio", { impact: "high", modality: "interval", avoid: ["senior"] }),
  E("ジャンピングジャック+その場ジョギング", "cardio", "cardio", [], 1, 5, "cardio",
    { impact: "high", modality: "interval", avoid: ["senior"] }),
];

const EXERCISE_TIPS = {
  "ベンチプレス": "肩甲骨を寄せて胸を張り、バーをみぞおち付近へ。お尻はベンチに着けたまま。",
  "インクラインベンチプレス": "30〜45度の傾斜で上部胸を狙う。バーは鎖骨のやや下へ下ろす。",
  "ダンベルプレス": "手首を立て、ダンベルを胸の高さまで下ろして大きく動かす。",
  "インクラインダンベルプレス": "ベンチを30〜45度に起こし、上部胸を意識して真上へ押す。",
  "ダンベルフライ": "肘を軽く曲げたまま弧を描く。胸のストレッチを感じる位置で止める。",
  "チェストプレス(マシン)": "グリップは胸の高さ。押し切っても肘は完全にロックしない。",
  "ペックフライ(マシン)": "肘の角度を保ち、胸を寄せる意識で正面へ。戻しはゆっくり。",
  "ケーブルクロスオーバー": "やや前傾し、みぞおち前で手を交差。胸の収縮を意識。",
  "バンドチェストプレス": "背中にバンドを回し、肩の高さから前方へ。戻しも効かせる。",
  "スミスマシンベンチプレス": "軌道が固定される分、足の踏ん張りと胸の張りに集中。",
  "腕立て伏せ": "体を一直線に保ち、胸が床ギリギリまで。お尻が落ちないように。",
  "ワイドプッシュアップ": "手幅を肩より広めに。胸の外側に効かせる。",
  "膝つき腕立て伏せ": "膝をついて頭〜膝を一直線に。胸を床に近づけてから押し上げる。",
  "インクラインプッシュアップ(台に手)": "机や台に手をついた斜めの姿勢で腕立て。台が高いほど楽になる。",
  "デクラインプッシュアップ": "足を台に乗せて上部胸・肩へ負荷。体幹をまっすぐ。",
  "デッドリフト": "背中を丸めない。バーは体に沿わせ、股関節を使って立ち上がる。",
  "ベントオーバーロー": "上体を45度前傾し背中はまっすぐ。みぞおちへ引く。",
  "ラットプルダウン": "胸を張り、肘を下げる意識でバーを鎖骨へ。反動を使わない。",
  "シーテッドロー(マシン)": "背中を立て、肩甲骨を寄せてお腹へ引く。",
  "ケーブルロー": "背中を丸めず、肘を体側に沿わせて引く。",
  "懸垂(チンニング)": "肩を下げて胸を張り、顎がバーを越えるまで。きつければ補助を使う。",
  "ネガティブ懸垂": "台に乗って顎をバーの上へ。そこから5秒かけてゆっくり体を下ろす。",
  "斜め懸垂(インバーテッドロー)": "体を一直線に保ち胸をバーへ。角度で強度を調整。",
  "ワンハンドダンベルロー": "ベンチに片手片膝。背中はまっすぐ、肘を後ろへ引く。",
  "ダンベルベントオーバーロー": "上体を前傾して背中はまっすぐ。両手のダンベルを腰の横へ引く。",
  "ダンベルプルオーバー": "ベンチに仰向けでダンベルを頭の後ろへ下ろし、胸の上まで弧を描いて戻す。",
  "ダンベルデッドリフト": "背中を丸めず股関節から曲げる。すねに沿って下ろす。",
  "バンドロー": "バンドを足や柱に固定し、肩甲骨を寄せて引く。",
  "バンドプルダウン": "バンドを高い位置に固定し、肘を下げて胸の前へ引き下ろす。",
  "リュックロー": "荷物を入れたリュックを持ち、上体を前傾して背中で引く。腰は丸めない。",
  "スーパーマン(バックエクステンション)": "うつ伏せで手脚を同時に上げ、背中で反る。反動を使わない。",
  "リバーススノーエンジェル": "うつ伏せで腕を床すれすれに浮かせ、雪の天使のように大きく動かす。",
  "バーベルスクワット": "足は肩幅、つま先やや外。太ももが床と平行まで。膝とつま先は同方向。",
  "ルーマニアンデッドリフト": "膝を軽く曲げ股関節を後ろへ。もも裏のストレッチを感じる。",
  "レッグプレス": "足はプレート中央。膝を胸方向へ深く曲げ、押し切ってもロックしない。",
  "レッグエクステンション": "反動を使わず膝を伸ばし切る。一瞬止めて戻す。",
  "レッグカール": "かかとをお尻へ引きつける。骨盤を浮かせない。",
  "ゴブレットスクワット": "ダンベルを胸前で持ち、背中を立てて深くしゃがむ。",
  "ダンベルランジ": "一歩踏み出し前膝を90度。上体は垂直、膝はつま先より前に出しすぎない。",
  "ブルガリアンスクワット": "後ろ足をベンチに乗せ、前足重心で深くしゃがむ。",
  "ケトルベルスイング": "股関節の蝶番動作で振る。腕で持ち上げず、お尻の力で。",
  "スミスマシンスクワット": "軌道固定なので深さとフォームに集中。膝を内に入れない。",
  "ダンベルルーマニアンデッドリフト": "膝を軽く曲げ、ダンベルを太ももに沿わせて股関節から倒す。もも裏を伸ばす。",
  "ケーブルプルスルー": "股の間からロープを持ち、お尻を後ろへ引いてから前へ突き出して立つ。",
  "ヒップスラスト": "肩甲骨をベンチに乗せ、腰のバーをお尻の力で持ち上げる。あごを引く。",
  "自重スクワット": "足は肩幅、太もも平行まで。かかと重心で立ち上がる。",
  "椅子スクワット": "椅子に浅く座った姿勢から立ち上がり、ゆっくり座る。膝とつま先は同じ向き。",
  "フォワードランジ": "前に踏み出し前膝90度。体幹をまっすぐ保つ。",
  "リバースランジ": "片脚を後ろへ引いて沈み、前脚で押して戻る。膝にやさしいランジ。",
  "シングルレッグRDL": "片脚立ちで上体を前へ倒し、後ろ脚をまっすぐ伸ばす。壁に手を添えてもOK。",
  "スライディングレッグカール": "仰向けでお尻を浮かせ、かかとの下のタオルを滑らせて膝を曲げ伸ばし。",
  "ヒップリフト": "仰向けで膝を立て、お尻を締めて持ち上げる。腰で反らない。",
  "片脚ヒップリフト": "片脚を伸ばして浮かせ、もう片脚でお尻を持ち上げる。腰を反らない。",
  "カーフレイズ": "つま先立ちでかかとを最大限上げ、一瞬止めてゆっくり下ろす。",
  "片脚カーフレイズ": "壁に手を添えて片脚でつま先立ち。上で一瞬止めてゆっくり下ろす。",
  "ダンベルカーフレイズ": "ダンベルを持ってつま先立ち。段差に乗ると可動域が広がる。",
  "スミスマシンカーフレイズ": "バーを肩に担ぎ、かかとを最大限上げてゆっくり下ろす。",
  "レッグプレスカーフレイズ": "プレートの下端につま先を置き、膝は伸ばしたまま足首だけで押す。",
  "ウォールシット(空気椅子)": "壁に背中をつけ、太ももが床と平行になる姿勢をキープ。",
  "オーバーヘッドプレス": "体幹を締め、バーを真上へ。腰を反りすぎない。",
  "ダンベルショルダープレス": "肘を軽く前に、耳の横から真上へ。手首を立てる。",
  "サイドレイズ": "小指側をやや上に、肩の高さまで。反動を使わずゆっくり。",
  "リアレイズ": "前傾して肩甲骨は動かさず、後方の三角筋で開く。",
  "ショルダープレス(マシン)": "グリップは肩の高さから。押し切っても肘はロックしない。",
  "ケーブルサイドレイズ": "体の後ろからケーブルを引き、肩の高さへ。",
  "バンドサイドレイズ": "バンドを踏んで肩の高さまで。下ろす時も効かせる。",
  "パイクプッシュアップ": "お尻を高く上げ、頭を床へ近づける。肩に効かせる。",
  "パイクプッシュアップ(台に手)": "台に手をつきお尻を高く。頭を台に近づけるように肘を曲げる。",
  "フェイスプル": "ロープを顔の高さへ引き、肘を外に開いて肩の後ろを締める。",
  "リアデルトフライ(マシン)": "マシンに向かって座り、腕を後ろへ開いて肩の後ろに効かせる。",
  "バンドプルアパート": "バンドを肩幅で持ち、胸の前で左右に引き離して肩甲骨を寄せる。",
  "うつ伏せYTWレイズ": "うつ伏せで腕をY・T・Wの形に浮かせる。肩甲骨を寄せて小さくゆっくり。",
  "ペットボトルサイドレイズ": "水を入れた500ml〜2Lのペットボトルを持ち、肘を軽く曲げて肩の高さまでゆっくり上げる。",
  "バーベルカール": "肘を固定し反動を使わず巻き上げる。下ろしもゆっくり。",
  "ナローベンチプレス": "手幅を狭め、肘を体側に。上腕三頭筋を意識。",
  "ダンベルカール": "肘を固定し小指を巻き込むように。左右交互でも可。",
  "ハンマーカール": "手のひらを内側に向けたまま巻き上げる。前腕も鍛える。",
  "ダンベルフレンチプレス": "肘を頭の横で固定し、後頭部の後ろへ下ろして伸ばす。",
  "トライセプスプレスダウン": "肘を体側に固定し、下まで押し切る。戻しもゆっくり。",
  "バンドカール": "バンドを踏み、肘を固定して巻き上げる。",
  "ディップス(椅子・台を利用)": "手を台につき、肘を後ろへ曲げて体を落とす。肩をすくめない。",
  "ケーブルカール": "肘を体側に固定し、ケーブルを巻き上げる。下ろしもゆっくり。",
  "ダンベルキックバック": "前傾して肘を体側で固定し、肘から先を後ろへ伸ばし切る。",
  "バンドプレスダウン": "バンドを高い位置に固定し、肘を体側で固定して下へ押し切る。",
  "ダイヤモンドプッシュアップ": "両手の親指と人差し指でひし形を作り、肘を体側に沿わせて腕立て。",
  "膝つきナロープッシュアップ": "膝をつき、手幅を肩幅より狭くして肘を体側に沿わせる。",
  "リュックカール": "荷物を入れたリュックの持ち手を握り、肘を固定して巻き上げる。",
  "タオルカール": "タオルを片足で踏んで両端を持ち、足の抵抗に逆らいながら巻き上げる。",
  "プランク": "肘は肩の真下、頭〜かかとを一直線に。お尻を上げ下げしない。",
  "サイドプランク": "肘を肩の下に、体を横一直線に保つ。腰を落とさない。",
  "デッドバグ": "仰向けで手脚を上げ、腰を床に押しつけたまま対角の手脚をゆっくり伸ばす。",
  "クランチ": "おへそを覗き込むように背中を丸める。首は引っ張らない。",
  "レッグレイズ": "仰向けで脚を伸ばし、腰を反らせず脚を上げ下げ。",
  "ロシアンツイスト": "上体を起こして左右にひねる。体幹で動かす。",
  "バードドッグ": "四つばいで対角の手脚を伸ばし、体をまっすぐ保って一瞬止める。",
  "プランクショルダータップ": "腕立ての姿勢で片手ずつ反対の肩にタッチ。腰を左右に揺らさない。",
  "ハンギングレッグレイズ": "ぶら下がり、反動を使わず脚を持ち上げる。",
  "ケーブルクランチ": "ひざ立ちでロープを持ち、背中を丸めて引き下ろす。",
  "アブドミナルクランチ(マシン)": "背中を丸めて上体を倒す。反動を使わない。",
  "片脚立ち": "壁や椅子のそばで片脚立ち。背すじを伸ばし、ふらついたらすぐ手をつく。",
  "水泳(クロール)": "息継ぎは横向きで。大きくゆったり、一定ペースで。",
  "水泳(平泳ぎ)": "かえる足のキックとひとかきを合わせ、伸びる時間を作る。",
  "水泳(背泳ぎ)": "仰向けで腰を反らさず、まっすぐ伸びて交互に腕を回す。",
  "水泳(バタフライ)": "上級者向け。うねりを使い、無理なら他の泳法を。",
  "ビート板キック": "板を持ち足だけで進む。脚と心肺の良い運動。",
  "水中ウォーキング": "姿勢を正し大股で。関節に優しく初心者向き。",
  "ランニング": "会話できる程度のペースから。着地は足裏全体で。",
  "傾斜ウォーキング(ランニングマシン)": "傾斜5〜10%で早歩き。手すりにつかまらず、会話できる強さで。",
  "エアロバイク": "サドル高は脚が軽く伸びる位置。一定の負荷で漕ぐ。",
  "ローイングエルゴメーター": "脚→体→腕の順で引き、戻りは逆順。背中を丸めない。",
  "ウォーキング(早歩き)": "やや大股で腕を振り、少し息が弾む程度のペースで。",
  "バーピー": "しゃがむ→足を伸ばす→戻る→ジャンプ。無理ない速さで。",
  "ジャンピングジャック+その場ジョギング": "リズムよく。心拍を上げるウォームアップにも最適。",
};

// 記録・表示の方式: weight = 重量×セット×回数 / time = 時間キープ×セット / cardio = 時間(+距離)
function trackOf(ex) {
  if (ex.kind === "cardio") return "cardio";
  if (ex.style === "hold") return "time";
  return "weight";
}
// 重量の上げ幅を決めるための負荷の種類
function loadOf(ex) {
  const eq = ex.equipment;
  if (eq.includes("barbell")) return "barbell";
  if (eq.includes("mc_smith")) return "smith";
  if (eq.includes("dumbbell")) return "dumbbell";
  if (eq.includes("kettlebell")) return "kettlebell";
  if (eq.includes("cable")) return "cable";
  if (eq.some((k) => k.startsWith("mc_"))) return "machine";
  if (eq.includes("band")) return "band";
  return "bodyweight";
}
for (const ex of EXERCISES) {
  ex.style = ex.style ?? "normal";
  ex.track = trackOf(ex);
  ex.load = loadOf(ex);
  if (!("sub" in ex)) ex.sub = PATTERN_SUB[ex.pattern] ?? null;
  ex.tip = EXERCISE_TIPS[ex.name] ?? "";
}

const NAME_TO_EXERCISE = new Map(EXERCISES.map((e) => [e.name, e]));
const STRENGTH_POOL = EXERCISES.filter((e) => e.kind !== "cardio");
const CARDIO_POOL = EXERCISES.filter((e) => e.kind === "cardio");

// 種目名から記録方式を判定する(記録フォームの自動切り替え用)。未知の種目は weight 扱い。
export function getExerciseTrack(name) {
  return NAME_TO_EXERCISE.get(name)?.track ?? "weight";
}

export function getExerciseTip(name) {
  return NAME_TO_EXERCISE.get(name)?.tip ?? "";
}

// 種目の基本情報(セッション画面などで使う)。未知の種目は null
export function getExerciseInfo(name) {
  const e = NAME_TO_EXERCISE.get(name);
  if (!e) return null;
  return {
    name: e.name, muscle: e.muscle, sub: e.sub, pattern: e.pattern, equipment: [...e.equipment],
    level: e.level, kind: e.kind, track: e.track, load: e.load, style: e.style, heavy: !!e.heavy, tip: e.tip,
    harder: e.harder ?? null, easier: e.easier ?? null, isPool: e.equipment.includes("pool"),
  };
}

// プール種目か(距離は25m刻みの m で記録する)
export function isPoolExercise(name) {
  const e = NAME_TO_EXERCISE.get(name);
  if (e) return e.equipment.includes("pool");
  return /水泳|スイム|プール/.test(String(name ?? ""));
}

// 推定1RM(Epley式)。重量×回数から最大挙上重量を推定。回数1なら重量そのもの。
export function estimate1RM(weight, reps) {
  const w = parseFloat(weight);
  const r = parseInt(reps, 10);
  if (!(w > 0) || !(r > 0)) return null;
  if (r === 1) return Math.round(w * 10) / 10;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

// 有酸素種目の距離単位。プール種目は25m刻みの「m」、それ以外は「km」
export function getDistanceUnit(name) {
  return isPoolExercise(name) ? "m" : "km";
}

// 重量の選択肢(昇順)。0 = 自重・なし / 1〜10kg は1kg刻み / 12〜32kg の偶数(ダンベルの規格) /
// 2.5kg 刻み(〜300kg)。前回記録からの目標重量もこの中の値になる。
export const WEIGHT_CHOICES = (() => {
  const set = new Set([0]);
  for (let v = 1; v <= 10; v++) set.add(v);
  for (let v = 12; v <= 32; v += 2) set.add(v);
  for (let i = 1; i <= 120; i++) set.add(i * 2.5);
  return [...set].sort((a, b) => a - b);
})();

// 記録フォームの種目リストを記録方式(筋トレ/キープ/有酸素)別に返す
export function exerciseChoices(track) {
  if (track === "cardio") {
    return [{ label: "有酸素", names: CARDIO_POOL.map((e) => e.name) }];
  }
  if (track === "time") {
    return [{ label: "体幹・キープ系", names: EXERCISES.filter((e) => e.track === "time").map((e) => e.name) }];
  }
  const order = ["chest", "back", "legs", "shoulders", "arms", "core"];
  return order
    .map((m) => ({
      label: MUSCLE_LABELS[m],
      names: EXERCISES.filter((e) => e.muscle === m && e.track === "weight").map((e) => e.name),
    }))
    .filter((g) => g.names.length > 0);
}

// 記録入力のサジェスト用に全種目名を返す
export function allExerciseNames() {
  return EXERCISES.map((e) => e.name);
}

// 記録フォームの選択リスト用に、部位ごとにグループ化した種目名を返す
export function exercisesByMuscle() {
  const order = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"];
  return order.map((m) => ({
    label: MUSCLE_LABELS[m],
    names: EXERCISES.filter((e) => e.muscle === m).map((e) => e.name),
  }));
}

export function calcBmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!(w > 0) || !(h > 0)) return { value: 0, category: "未入力" };
  const bmi = w / (h * h);
  let category;
  if (bmi < 18.5) category = "低体重(やせ気味)";
  else if (bmi < 25) category = "普通体重";
  else if (bmi < 30) category = "肥満(1度)";
  else category = "肥満(2度以上)";
  return { value: Math.round(bmi * 10) / 10, category };
}

// ---------- 小さなヘルパー ----------

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" をローカル時刻の0時として読む(UTC として解釈しない)
function parseLocalDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function localMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// a から now までの日数(未来の日付は 0)
function daysSince(dateStr, now) {
  const d = parseLocalDate(dateStr);
  if (!d) return 0;
  return Math.max(0, Math.round((localMidnight(now) - d) / DAY_MS));
}
// 表示用の短い日付 "9/26"
function shortDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return d ? `${d.getMonth() + 1}/${d.getDate()}` : String(dateStr ?? "");
}
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const fmtKg = (n) => String(Math.round(n * 10) / 10);

// "8〜12回" "15回" "30〜60秒キープ" 等の先頭の数値範囲を読む
function parseRange(text) {
  const m = String(text ?? "").match(/(\d+(?:\.\d+)?)(?:\s*[〜~～\-–]\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

// 休憩表記から秒数(範囲は短い方)。"90秒" "2〜3分" "45〜60秒"。タイマーの初期値に使う
export function parseRestSeconds(text) {
  const t = String(text ?? "");
  const nums = t.match(/\d+/g)?.map(Number);
  if (!nums || nums.length === 0) return 0;
  return t.includes("分") ? nums[0] * 60 : nums[0];
}
// 所要時間の見積もり用(範囲の中央)
function restMidSeconds(text) {
  const t = String(text ?? "");
  const r = parseRange(t);
  if (!r) return 0;
  const mid = (r.lo + r.hi) / 2;
  return t.includes("分") ? mid * 60 : mid;
}

function isAvailable(exercise, selectedSet) {
  return exercise.equipment.every((tag) => selectedSet.has(tag));
}

// 器具タグを実際に使える集合へ展開(「マシン一式」は個別マシンすべてに展開)
function expandEquipment(keys) {
  const set = new Set(Array.isArray(keys) ? keys : []);
  if (set.has("machine")) {
    for (const key of MACHINE_KEYS) set.add(key);
  }
  return set;
}

// ---------- 記録の分析 ----------

// 1行の「作業セット」(重量種目は最も重いセット。setDetails があればその中から)
function workingSetOf(entry) {
  let weight = num(entry.weight) ?? 0;
  let reps = num(entry.reps);
  if (Array.isArray(entry.setDetails) && entry.setDetails.length > 0) {
    for (const s of entry.setDetails) {
      const w = num(s?.weight) ?? 0;
      const r = num(s?.reps);
      if (r == null) continue;
      if (reps == null || w > weight || (w === weight && r > reps)) {
        weight = w;
        reps = r;
      }
    }
  }
  return { weight, reps };
}
function entryTrack(e) {
  if (e.track === "weight" || e.track === "time" || e.track === "cardio") return e.track;
  return getExerciseTrack(e.name);
}
function maxSeconds(e) {
  let s = num(e.seconds) ?? 0;
  if (Array.isArray(e.setDetails)) for (const d of e.setDetails) s = Math.max(s, num(d?.seconds) ?? 0);
  return s;
}
// a の方が「作業セット」として良い記録か(同じ種目・同じ日の行どうしを比べる)
function betterEntry(a, b) {
  const track = entryTrack(a);
  if (track === "time") return maxSeconds(a) > maxSeconds(b);
  if (track === "cardio") {
    const ma = num(a.minutes) ?? 0;
    const mb = num(b.minutes) ?? 0;
    return ma > mb || (ma === mb && (num(a.distance) ?? 0) > (num(b.distance) ?? 0));
  }
  const wa = workingSetOf(a);
  const wb = workingSetOf(b);
  return wa.weight > wb.weight || (wa.weight === wb.weight && (wa.reps ?? 0) > (wb.reps ?? 0));
}

// 同じ種目の行の中から作業セット(ウォームアップではない行)を選ぶ。
// 記録フォームの転記(前回重量)と進捗ノートで同じ規則を使うための共通ヘルパー。
export function pickWorkingSet(entries) {
  let best = null;
  for (const e of entries ?? []) {
    if (!e?.name) continue;
    if (!best || betterEntry(e, best)) best = e;
  }
  return best;
}

// トレーニング記録を分析する。
// logs: [{ date: "YYYY-MM-DD", entries: [{ name, track, weight, sets, reps, seconds, minutes, distance }] }]
export function analyzeLogs(logs, now = new Date()) {
  if (!Array.isArray(logs) || logs.length === 0) return null;
  const valid = logs.filter((l) => l && parseLocalDate(l.date) && Array.isArray(l.entries));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 新しい順

  const daysSinceLast = daysSince(sorted[0].date, now);
  const recentCount = sorted.filter((l) => daysSince(l.date, now) <= 28).length;
  const weeklyAvg = Math.round((recentCount / 4) * 10) / 10;

  const muscleLastDays = {};   // 部位 -> 最後に鍛えてからの日数
  const lastRecordByName = {}; // 種目名 -> 最新の日の作業セット
  for (const log of sorted) {
    const days = daysSince(log.date, now);
    for (const entry of log.entries) {
      if (!entry?.name) continue;
      const muscle = NAME_TO_EXERCISE.get(entry.name)?.muscle;
      if (muscle && !(muscle in muscleLastDays)) muscleLastDays[muscle] = days;
      const cur = lastRecordByName[entry.name];
      // 新しい日付を優先し、同じ日の中だけで作業セット(最も重い・長い行)を選ぶ(B39)
      if (!cur || (cur.date === log.date && betterEntry(entry, cur))) {
        const rec = { ...entry, date: log.date };
        if (entryTrack(entry) === "weight" && Array.isArray(entry.setDetails) && entry.setDetails.length) {
          const ws = workingSetOf(entry);
          rec.weight = ws.weight;
          rec.reps = ws.reps;
        }
        lastRecordByName[entry.name] = rec;
      }
    }
  }

  // 記録上、14日以上鍛えていない(または一度も出てこない)筋トレ部位
  const neglectedMuscles = Object.keys(MUSCLE_LABELS).filter(
    (m) => m !== "cardio" && (muscleLastDays[m] === undefined || muscleLastDays[m] > 14)
  );

  return {
    count: valid.length,
    lastDate: sorted[0].date,
    daysSinceLast,
    weeklyAvg,
    muscleLastDays,
    lastRecordByName,
    neglectedMuscles,
    muscleLabel: (m) => MUSCLE_LABELS[m] ?? m,
  };
}

// ---------- 前回記録からの目標(ダブルプログレッション) ----------

// ケトルベルの規格のうち、記録の重量の選択肢(WEIGHT_CHOICES)にあるもの
const KB_SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40];
// 重量の選択肢の中で最も近い値(0 = 自重は除く)
const snapToChoice = (x) => WEIGHT_CHOICES.reduce((best, v) => (v > 0 && Math.abs(v - x) < Math.abs(best - x) ? v : best), 1);
// バーベル・スミスはプレートで2.5kg刻み、それ以外は選択肢の中で最も近い値
const snapFor = (x, info) =>
  (info?.load === "barbell" || info?.load === "smith") && x > 10 ? Math.round(x / 2.5) * 2.5 : snapToChoice(x);
const isLowerCompound = (info) =>
  !!info && info.kind === "compound" && ["squat", "lunge", "hinge", "glute"].includes(info.pattern);
const step25Up = (w) => Math.floor(w / 2.5 + 1e-9) * 2.5 + 2.5;
const step25Down = (w) => Math.max(2.5, Math.ceil(w / 2.5 - 1e-9) * 2.5 - 2.5);

// 1段階重い重量(器具ごとの現実的な上げ幅)
function nextWeight(w, info) {
  switch (info?.load) {
    case "barbell":
    case "smith":
      return Math.round((w + (isLowerCompound(info) ? 5 : 2.5)) / 2.5) * 2.5;
    case "dumbbell":
      if (w < 10) return Math.floor(w) + 1;
      if (w < 32) return (Math.floor(w / 2) + 1) * 2;
      return step25Up(w);
    case "kettlebell":
      return KB_SIZES.find((s) => s > w) ?? step25Up(w);
    default: // マシン・ケーブル・自重+加重
      return w < 10 ? Math.floor(w) + 1 : step25Up(w);
  }
}
// 1段階軽い重量
function prevWeight(w, info) {
  switch (info?.load) {
    case "barbell":
    case "smith":
      return Math.min(w, Math.max(2.5, Math.round((w - (isLowerCompound(info) ? 5 : 2.5)) / 2.5) * 2.5));
    case "dumbbell":
      if (w <= 10) return Math.max(1, Math.ceil(w) - 1);
      if (w <= 32) return Math.max(10, (Math.ceil(w / 2) - 1) * 2);
      return step25Down(w);
    case "kettlebell":
      return [...KB_SIZES].reverse().find((s) => s < w) ?? w;
    default:
      return w <= 10 ? Math.max(1, Math.ceil(w) - 1) : step25Down(w);
  }
}
const round25 = (m) => Math.max(25, Math.round(m / 25) * 25);

// 前回記録と今回の処方(ex.reps の回数範囲)から、今日の目標を返す。
// 戻り値: { weight: number|null, reps: number|null, text, seconds?, minutes?, distance?, unit? }
// - 回数が範囲の下限未満 → 同じ重量で下限を目指す(大きく届かなければ1段階軽く)
// - 範囲内 → 同じ重量で +1回
// - 上限に到達 → 1段階重くして下限の回数から(自重種目は難しいバリエーションへ)
export function progressionTarget(record, ex, profile, now) {
  if (!record) return null;
  const name = ex?.name ?? record.name;
  const info = NAME_TO_EXERCISE.get(name) ?? null;
  const track = entryTrack({ ...record, name });
  const levelNum = LEVEL_NUM[profile?.level] ?? 2;
  const range = parseRange(ex?.reps);

  if (track === "time") {
    const s = maxSeconds(record);
    if (!(s > 0)) return null;
    const hi = range?.hi ?? 60;
    if (s >= hi) {
      const sets = (num(record.sets) ?? 2) + 1;
      return { weight: null, reps: null, seconds: hi, text: `${hi}秒×${sets}セットか、より難しい種目へ` };
    }
    const next = Math.min(hi, s + (s < 60 ? 5 : 10));
    return { weight: null, reps: null, seconds: next, text: `${next}秒キープ` };
  }

  if (track === "cardio") {
    const minutes = num(record.minutes) ?? 0;
    const dist = num(record.distance) ?? 0;
    if (isPoolExercise(name) || record.unit === "m") {
      const meters = record.unit === "km" ? dist * 1000 : dist;
      if (meters > 0) {
        const next = round25(meters + (meters >= 1000 ? 50 : 25));
        return { weight: null, reps: null, minutes: minutes || null, distance: next, unit: "m", text: `${next}m(前回+${next - meters}m)` };
      }
    }
    if (!(minutes > 0)) return null;
    return {
      weight: null, reps: null, minutes: minutes + 2, distance: dist || null, unit: dist ? (record.unit ?? "km") : null,
      text: `${minutes + 2}分(または同じ時間で距離を少し伸ばす)`,
    };
  }

  const ws = workingSetOf(record);
  const w = ws.weight;
  const r = ws.reps;
  if (!(r > 0)) return null;
  const lo = range?.lo ?? r;
  const hi = range?.hi ?? r + 2;

  // 3週間以上あいた種目は約8割の重さから再開
  if (now && w > 0 && record.date && daysSince(record.date, now) >= 21) {
    let back = snapFor(w * 0.8, info);
    if (back >= w) back = prevWeight(w, info);
    if (back >= w) back = w;
    return { weight: back, reps: lo, text: `${fmtKg(back)}kg×${lo}回(ブランク明けは約8割の重さから)` };
  }

  if (w > 0) {
    if (info?.load === "band") {
      if (r >= hi) return { weight: null, reps: lo, text: `より強いバンドで${lo}回から` };
      return { weight: null, reps: r < lo ? lo : r + 1, text: `同じバンドで${r < lo ? lo : r + 1}回` };
    }
    if (r >= hi) {
      const next = nextWeight(w, info);
      const step = info && (info.load === "machine" || info.load === "cable") ? "(1段階重く)" : "";
      return { weight: next, reps: lo, text: `${fmtKg(next)}kg×${lo}回から${step}` };
    }
    if (r >= lo) return { weight: w, reps: r + 1, text: `${fmtKg(w)}kg×${r + 1}回` };
    if (r <= lo - 4) {
      const down = prevWeight(w, info);
      return { weight: down, reps: lo, text: `${fmtKg(down)}kg×${lo}回(1段階軽くしてフォームを整える)` };
    }
    return { weight: w, reps: lo, text: `${fmtKg(w)}kg×${lo}回(同じ重量で回数を伸ばす)` };
  }

  // 自重(重量なし)
  const harder = info?.harder ? NAME_TO_EXERCISE.get(info.harder) : null;
  const easier = info?.easier ? NAME_TO_EXERCISE.get(info.easier) : null;
  if (r >= hi) {
    if (harder && harder.level <= levelNum + 1) {
      return { weight: 0, reps: r, text: `上限に届いたので「${harder.name}」に挑戦(${lo}回〜)` };
    }
    return { weight: 0, reps: hi, text: `${hi}回を3秒かけて下ろす(ゆっくり動かして負荷UP)` };
  }
  if (r >= lo) {
    const next = Math.min(hi, r + 1);
    return { weight: 0, reps: next, text: `${next}回` };
  }
  if (easier && r <= lo - 3) {
    return { weight: 0, reps: r, text: `「${easier.name}」で${lo}回を目指す` };
  }
  const next = Math.min(lo, r + 2);
  return { weight: 0, reps: next, text: `${next}回を目標` };
}

// 前回記録の要約 + 今日の目標を1行にする
function progressionNote(record, target) {
  const track = entryTrack(record);
  const date = shortDate(record.date);
  let prev;
  if (track === "time") {
    prev = `${maxSeconds(record)}秒×${num(record.sets) ?? 1}セット`;
  } else if (track === "cardio") {
    const d = num(record.distance);
    prev = `${num(record.minutes) ?? 0}分${d ? `・${d}${record.unit ?? "km"}` : ""}`;
  } else {
    const ws = workingSetOf(record);
    const sets = num(record.sets) ?? (Array.isArray(record.setDetails) ? record.setDetails.length : 1);
    prev = `${ws.weight > 0 ? `${fmtKg(ws.weight)}kg×` : ""}${ws.reps ?? "?"}回×${sets}セット`;
  }
  return `前回(${date}): ${prev}${target ? ` → 目標 ${target.text}` : ""}`;
}

// ---------- 目的・役割別の処方 ----------

// 役割別のセット・回数・休憩。sets は中級者基準で、レベルに応じて resolveParams で増減する。
// 休憩表記は単位を1つだけ使う(タイマーが先頭の数値を読むため)
const GOAL_PARAMS = {
  hypertrophy: {
    main: { sets: 3, reps: "6〜10回", rest: "2〜3分" },
    secondary: { sets: 3, reps: "8〜12回", rest: "90〜120秒" },
    accessory: { sets: 2, reps: "10〜15回", rest: "60〜90秒" },
    scheme: "筋肥大狙い:メイン種目は6〜10回、あと1〜2回できるところで止める重量で。補助・マシン・単関節種目は限界近くまでOK。回数の上限に届いたら重量を1段階上げます。",
  },
  strength: {
    main: { sets: 4, reps: "3〜5回", rest: "3〜5分" },
    secondary: { sets: 3, reps: "6〜8回", rest: "2〜3分" },
    accessory: { sets: 2, reps: "8〜12回", rest: "60〜90秒" },
    scheme: "筋力狙い:最初の種目を重く低回数(3〜5回)で、休憩は3分以上しっかり。2種目目以降は少し回数を増やし、フォーム優先・余力1〜2回で質を保ちます。",
  },
  cut: {
    main: { sets: 3, reps: "6〜10回", rest: "2〜3分" },
    secondary: { sets: 3, reps: "8〜12回", rest: "90〜120秒" },
    accessory: { sets: 2, reps: "10〜15回", rest: "60〜90秒" },
    scheme: "減量中も重さは落とさず筋肉を守るのがコツ。セット数はやや控えめにし、消費は食事と仕上げの有酸素で作ります。",
  },
  health: {
    main: { sets: 3, reps: "8〜12回", rest: "90〜120秒" },
    secondary: { sets: 2, reps: "10〜15回", rest: "60〜90秒" },
    accessory: { sets: 2, reps: "12〜15回", rest: "60秒" },
    scheme: "健康維持:無理のない重量で中回数。あと2〜3回余裕を残して止め、関節にやさしく続けやすさを最優先します。",
  },
};
// 自重種目は重さで調整できないので、目的に関係なく8回以上・余力で強度を決める(B21)
const BW_REPS = {
  strength: ["8〜12回", "3秒かけて下ろす"],
  hypertrophy: ["10〜20回", "余力1〜2回"],
  cut: ["12〜20回", "余力1〜2回"],
  health: ["8〜15回", "余力2〜3回"],
};
// 片脚ずつ行う自重種目は左右で倍の時間がかかるので少なめ
const BW_UNI_REPS = {
  strength: ["8〜12回", "3秒かけて下ろす"],
  hypertrophy: ["8〜15回", "余力1〜2回"],
  cut: ["10〜15回", "余力1〜2回"],
  health: ["8〜12回", "余力2〜3回"],
};

function resolveParams(e, tier, ctx) {
  const g = GOAL_PARAMS[ctx.goal];
  let base = g[tier] ?? g.accessory;
  // 筋力目的の低回数はフリーウェイトの種目で行う(マシンがメインの日は6〜8回)
  if (tier === "main" && ctx.goal === "strength" && !e.heavy && e.load !== "dumbbell") {
    base = { ...g.secondary, sets: g.main.sets };
  }
  let sets = base.sets;
  // 初心者: メイン種目は3セットまで(フォーム練習の回数を確保)、それ以外は1セット減らして安全に
  if (ctx.levelNum === 1) sets = tier === "main" && ctx.goal !== "health" ? Math.min(sets, 3) : Math.max(2, sets - 1);
  else if (ctx.levelNum === 3 && tier === "main") sets = Math.min(5, sets + 1); // 上級者:メイン種目だけ1セット追加

  let range = base.reps.replace(/回$/, "");
  let unit = "回";
  const cues = [];
  let rest = base.rest;
  switch (e.style) {
    case "hold":
      range = ctx.levelNum === 1 ? "20〜40" : "30〜60";
      unit = "秒キープ";
      rest = "45〜60秒";
      sets = Math.min(sets, 3);
      break;
    case "high":
      range = ctx.goal === "strength" ? "12〜15" : "15〜20";
      rest = "45〜60秒";
      break;
    case "bw": {
      const [r, cue] = (e.uni ? BW_UNI_REPS : BW_REPS)[ctx.goal];
      range = r.replace(/回$/, "");
      cues.push(cue);
      rest = ctx.goal === "strength" ? "90秒" : "60〜90秒";
      break;
    }
    case "bw_pull":
      range = ctx.goal === "strength" ? "3〜6" : ctx.goal === "health" ? "3〜8" : "5〜10";
      cues.push("できる回数でOK");
      rest = ctx.goal === "strength" ? "2〜3分" : "90〜120秒";
      break;
    case "neg":
      range = "3〜6";
      cues.push("5秒かけて下ろす");
      rest = "90〜120秒";
      break;
    default: {
      const r = parseRange(range);
      // 背骨に負荷がかかるバーベル種目は10回まで・休憩2分以上(疲労でフォームが崩れやすいため)
      if (e.heavy && r && r.hi > 10) range = `${Math.min(r.lo, 8)}〜10`;
      if (e.heavy && parseRestSeconds(rest) < 120) rest = "2〜3分";
      // 成長期は8回未満の高重量を避ける
      const r2 = parseRange(range);
      if (ctx.youth && r2 && r2.lo < 8) range = e.heavy ? "8〜10" : "8〜12";
    }
  }
  if (e.uni) cues.unshift("左右各");
  const reps = `${range}${unit}${cues.length ? `(${cues.join("・")})` : ""}`;
  return { sets, reps, rest };
}

// ---------- 分割法(週のスケジュール) ----------

// 各日の枠。"a|b" は a が無ければ b(代替)。先頭の "?" は初心者・健康維持では省く追加枠。
// 1枠目がその日のメイン。上半身・Push・Pull の日にはヒンジ(デッドリフト系)を入れない。
const TEMPLATES = {
  full1: { split: "full", label: "全身", slots: ["squat", "h_push", "h_pull|v_pull|back_ext", "hinge|glute|knee_flex", "v_push|lateral", "?lateral|rear_delt", "core"] },
  fullA: { split: "full", label: "全身A", slots: ["squat", "h_push", "v_pull|h_pull|back_ext", "knee_flex|glute|hinge", "lateral|rear_delt|v_push", "?calf", "core"] },
  fullB: { split: "full", label: "全身B", slots: ["hinge|glute|knee_flex", "v_push|h_push", "h_pull|v_pull|back_ext", "lunge|squat", "triceps", "?chest_fly", "core"] },
  fullC: { split: "full", label: "全身C", slots: ["squat|lunge", "incline_push|h_push", "v_pull|h_pull|back_ext", "calf", "biceps", "?glute|knee_flex|hinge", "core"] },
  upperA: { split: "upper", label: "上半身A", slots: ["h_push", "h_pull|v_pull|back_ext", "v_push|lateral", "v_pull|h_pull|back_ext", "lateral|rear_delt", "triceps", "?biceps"] },
  upperB: { split: "upper", label: "上半身B", slots: ["v_push|h_push", "v_pull|h_pull|back_ext", "incline_push|h_push|chest_fly", "h_pull|v_pull|back_ext", "rear_delt|lateral", "biceps", "?triceps"] },
  lowerA: { split: "lower", label: "下半身A", slots: ["squat", "hinge|glute|knee_flex", "lunge|squat|knee_ext", "knee_flex|glute", "calf", "core", "?knee_ext|glute"] },
  lowerB: { split: "lower", label: "下半身B", slots: ["hinge|glute|knee_flex", "squat|lunge", "lunge|knee_ext|squat", "knee_flex|glute", "calf", "core", "?glute|knee_ext"] },
  pushA: { split: "push", label: "Push A(胸・肩・三頭)", slots: ["h_push", "v_push|h_push", "incline_push|chest_fly|h_push", "lateral|rear_delt", "triceps", "?chest_fly|triceps"] },
  pushB: { split: "push", label: "Push B(肩・胸・三頭)", slots: ["v_push|h_push", "incline_push|h_push", "h_push|chest_fly|incline_push", "lateral|rear_delt", "triceps", "?lateral"] },
  pullA: { split: "pull", label: "Pull A(背中・二頭)", slots: ["v_pull|h_pull|back_ext", "h_pull|v_pull|back_ext", "rear_delt|back_ext|lateral", "biceps", "?biceps", "core"] },
  pullB: { split: "pull", label: "Pull B(背中・二頭)", slots: ["h_pull|v_pull|back_ext", "v_pull|h_pull|back_ext", "?h_pull|back_ext", "rear_delt|lateral", "biceps", "core"] },
  legsA: { split: "legs", label: "Legs A(脚・体幹)", slots: null },
  legsB: { split: "legs", label: "Legs B(脚・体幹)", slots: null },
};
TEMPLATES.legsA.slots = TEMPLATES.lowerA.slots;
TEMPLATES.legsB.slots = TEMPLATES.lowerB.slots;
const NO_HINGE_SPLITS = new Set(["upper", "push", "pull"]);

// 入れ替え候補が同じパターンに無いときに広げる先(同じ筋肉を狙う近い動作)
const SWAP_SIBLINGS = {
  h_push: ["incline_push"], incline_push: ["h_push"], chest_fly: ["incline_push", "h_push"],
  v_push: ["lateral"], lateral: ["rear_delt"], rear_delt: ["lateral", "back_ext"],
  v_pull: ["h_pull"], h_pull: ["v_pull", "back_ext"], back_ext: ["h_pull", "rear_delt"],
  squat: ["lunge"], lunge: ["squat"], knee_ext: ["squat", "lunge"],
  hinge: ["glute", "knee_flex"], knee_flex: ["glute", "hinge"], glute: ["hinge", "knee_flex"],
};

const WEEKDAY_HINT = { 2: "月・木", 3: "月・水・金", 4: "月・火・木・金", 5: "月・火・木・金・土", 6: "月〜土(日曜は休み)" };

// 週頻度(と安全上の上限)から各日の種類を決める。筋トレ日の上限を超えた日はアクティブレストにする
function buildSplit(ctx) {
  const f = ctx.frequency;
  const lift = Math.min(f, ctx.liftCap);
  let chunks;
  if (lift === 1) chunks = [["full1"]];
  else if (lift === 2) chunks = [["fullA", "fullB"]];
  else if (lift === 3) chunks = [["fullA", "fullB", "fullC"]];
  else if (lift === 4) chunks = [["upperA", "lowerA"], ["upperB", "lowerB"]];
  else if (lift === 5) chunks = [["upperA", "lowerA"], ["pushA", "pullA", "legsB"]];
  else chunks = [["pushA", "pullA", "legsA"], ["pushB", "pullB", "legsB"]];
  let recovery = f - lift;
  const seq = [];
  for (const chunk of chunks) {
    seq.push(...chunk);
    if (recovery > 0) {
      seq.push("recovery");
      recovery--;
    }
  }
  while (recovery-- > 0) seq.push("recovery");

  const names = {
    1: "全身法(週1回)", 2: "全身法(A/B)", 3: "全身法(A/B/C)", 4: "上半身・下半身 2分割(A/B)",
    5: "上半身・下半身+Push/Pull/Legs", 6: "Push / Pull / Legs 3分割(A/B)",
  };
  const name = names[lift] + (f > lift ? "+アクティブレスト" : "");
  return { name, seq, liftDays: lift, recoveryDays: f - lift };
}

// ---------- 種目選び ----------

function makeContext(profile, logs, now) {
  const p = profile ?? {};
  const goal = GOAL_PARAMS[p.goal] ? p.goal : "health";
  const level = LEVEL_NUM[p.level] ? p.level : "beginner";
  const levelNum = LEVEL_NUM[level];
  const freqRaw = parseInt(p.frequency, 10);
  const frequency = Number.isFinite(freqRaw) ? clampNum(freqRaw, 1, 7) : 3;
  const weight = num(p.weight) > 0 ? num(p.weight) : 65;
  const height = num(p.height) > 0 ? num(p.height) : 170;
  const age = num(p.age) > 0 ? num(p.age) : 30;
  const bmi = calcBmi(weight, height);
  const youth = age < 18;
  const senior = age >= 60;
  const obese = bmi.value >= 30;
  const selected = expandEquipment(p.equipment);
  const focus = new Set((Array.isArray(p.focus) ? p.focus : []).filter((m) => m in MUSCLE_LABELS && m !== "cardio"));
  const analysis = analyzeLogs(logs, now);
  // 筋トレ日の上限: 初心者・成長期・60歳以上は週4日まで、それ以外も週6日まで(7日目は回復日)
  const liftCap = levelNum === 1 || youth || senior ? 4 : 6;
  return {
    profile: { ...p, goal, level, frequency, weight, height, age },
    goal, level, levelNum, frequency, bmi, youth, senior, obese, selected, focus, analysis, now, liftCap,
    known: new Set(Object.keys(analysis?.lastRecordByName ?? {})),
    strictLowImpact: senior || obese,                 // 衝撃の大きい有酸素は採用しない
    startEasy: senior || obese,                       // 自重種目はやさしいバリエーションから始める
    preferLowImpact: goal === "health" || levelNum === 1, // 低衝撃を優先する
  };
}

// 年齢・体格・レベル・器具から、この人が自動採用してよい種目か
function allowed(e, ctx) {
  if (!isAvailable(e, ctx.selected)) return false;
  if (e.level > ctx.levelNum) return false;                       // レベル制限は緩めない(B19)
  if (ctx.senior && e.avoid?.includes("senior")) return false;
  if (ctx.strictLowImpact && e.impact === "high") return false;
  return true;
}

function strengthScore(e, ctx, usage, isMain) {
  let s = e.priority;
  if (ctx.known.has(e.name)) s += 1.5;                                  // やり慣れた種目をわずかに優先
  if (usage) s -= (usage.get(e.name) ?? 0) * (isMain ? 1 : 2.5);       // 週の中で同じ種目ばかりにしない
  if (ctx.senior) {
    if (e.load === "machine" || e.load === "cable" || e.load === "smith") s += 2.5; // 60歳以上はマシン優先
    if (e.heavy) s -= 1.5;
  }
  if (ctx.startEasy && e.regression) s += 5;                           // やさしいバリエーションから
  return s;
}
const byScore = (ctx, usage, isMain) => (a, b) => strengthScore(b, ctx, usage, isMain) - strengthScore(a, ctx, usage, isMain);

// 枠(パターンの候補列)から1種目選ぶ。無ければ null(別の部位には流用しない)
// optional = 追加枠(候補が1つしかないパターンでは入れ替えができなくなるので採用しない)
function pickFromChain(chain, ctx, state, usage, isMain, optional = false) {
  const picks = [];
  for (const pat of chain) {
    if (pat === "hinge" && (state.noHinge || state.hasHinge)) continue;
    const cands = STRENGTH_POOL.filter(
      (e) => e.pattern === pat && allowed(e, ctx) && !state.used.has(e.name) && (isMain || !e.mainOnly) &&
        !(ctx.startEasy && e.easier && !e.regression && allowed(NAME_TO_EXERCISE.get(e.easier), ctx))
    ).sort(byScore(ctx, usage, isMain));
    if (cands.length > (optional ? 1 : 0)) picks.push({ ex: cands[0], pattern: pat });
  }
  if (picks.length === 0) return null;
  // 同じ種目が週に2回以上出ているなら、代替パターンのまだ使っていない種目で変化をつける
  const times = (p) => usage?.get(p.ex.name) ?? 0;
  if (!isMain && times(picks[0]) >= 2) return picks.find((p) => times(p) === 0) ?? picks[0];
  return picks[0];
}

// 強化部位の追加種目に使うパターン(その日の種類ごと。腕は Push=三頭・Pull=二頭)
function focusChain(muscle, split, rows) {
  const has = (p) => rows.some((r) => r.pattern === p);
  switch (muscle) {
    case "chest":
      return ["full", "upper", "push"].includes(split) ? ["incline_push", "chest_fly", "h_push"] : null;
    case "back":
      if (!["full", "upper", "pull"].includes(split)) return null;
      return has("v_pull") ? ["h_pull", "v_pull", "back_ext"] : ["v_pull", "h_pull", "back_ext"];
    case "shoulders":
      if (split === "push") return ["lateral", "rear_delt"];
      if (split === "pull") return ["rear_delt", "lateral"];
      return split === "full" || split === "upper" ? ["lateral", "rear_delt", "v_push"] : null;
    case "arms":
      if (split === "push") return ["triceps"];
      if (split === "pull") return ["biceps"];
      if (split !== "full" && split !== "upper") return null;
      return has("biceps") ? ["triceps", "biceps"] : ["biceps", "triceps"];
    case "legs": {
      if (!["full", "lower", "legs"].includes(split)) return null;
      const order = ["knee_flex", "calf", "lunge", "glute", "knee_ext"];
      return [...order.filter((p) => !has(p)), ...order.filter(has)];
    }
    case "core":
      return ["core"];
    default:
      return null;
  }
}

// 強化部位チップ(6部位)のどれに当たる種目か(デッドリフトは記録上は背中だが、鍛える主働筋はもも裏)
const focusGroupOf = (e) => SUB_MUSCLES[e.sub]?.group ?? e.muscle;

// 並び順の階層: 0=複合(腕以外) 1=腕の複合 2=単関節 3=体幹・キープ(常に最後)
function tierRank(e) {
  if (e.muscle === "core" || e.style === "hold") return 3;
  if (e.kind !== "compound") return 2;
  return e.muscle === "arms" ? 1 : 0;
}

function buildLiftDay(index, key, ctx, usage, stale) {
  const tpl = TEMPLATES[key];
  const state = { used: new Set(), hasHinge: false, noHinge: NO_HINGE_SPLITS.has(tpl.split) };
  const rows = [];
  // slot は「採用したパターン|残りの代替」の順で保存する(入れ替えの基準になる)
  const add = (pick, chain, order, extra) => {
    const slot = [pick.pattern, ...chain.filter((p) => p !== pick.pattern)].join("|");
    rows.push({ ex: pick.ex, pattern: pick.pattern, slot, order, extra });
    state.used.add(pick.ex.name);
    if (pick.ex.pattern === "hinge") state.hasHinge = true;
  };
  tpl.slots.forEach((raw, i) => {
    const optional = raw.startsWith("?");
    if (optional && (ctx.levelNum === 1 || ctx.goal === "health")) return;
    const chain = raw.replace(/^\?/, "").split("|");
    const pick = pickFromChain(chain, ctx, state, usage, i === 0, optional);
    if (pick) add(pick, chain, i, false);
  });
  // 強化部位はその日に1種目追加する(その部位の枠がある日だけ。全身法の日は常に)
  for (const m of ctx.focus) {
    const chain = focusChain(m, tpl.split, rows);
    if (!chain || rows.length >= 8) continue;
    const pick = pickFromChain(chain, ctx, state, usage, false);
    if (pick) add(pick, chain, 100 + rows.length, true);
  }
  // 複合→腕の複合→単関節→体幹。同じ階層の中では ★強化部位 > しばらく空いた部位 > 枠の順
  const prio = (r) => (ctx.focus.has(focusGroupOf(r.ex)) ? 2 : 0) + (stale.has(r.ex.muscle) ? 1 : 0);
  rows.sort((a, b) => tierRank(a.ex) - tierRank(b.ex) || prio(b) - prio(a) || a.order - b.order);
  let mainSet = false;
  for (const r of rows) {
    const t = tierRank(r.ex);
    if (t === 0 && !mainSet) {
      r.tier = "main";
      mainSet = true;
    } else r.tier = t <= 1 ? "secondary" : "accessory";
    usage.set(r.ex.name, (usage.get(r.ex.name) ?? 0) + 1);
  }
  const exercises = rows.map((r) => {
    const p = resolveParams(r.ex, r.tier, ctx);
    return {
      name: r.ex.name,
      muscle: r.ex.muscle,
      sub: r.ex.sub,
      pattern: r.ex.pattern,
      slot: r.slot,
      track: r.ex.track,
      tip: r.ex.tip,
      role: r.tier === "accessory" ? "accessory" : "main",
      tier: r.tier,
      sets: p.sets,
      baseSets: p.sets,
      reps: p.reps,
      rest: p.rest,
      note: null,
      focused: ctx.focus.has(focusGroupOf(r.ex)),
      extra: r.extra,
    };
  });
  return {
    title: `Day ${index + 1}:${tpl.label}`,
    type: "lift",
    split: tpl.split,
    focusSummary: "",
    warmup: [],
    cooldown: [],
    estMinutes: 0,
    exercises,
    cardio: null,
  };
}

// ---------- 週のセット数(筋肉ごとの目標帯) ----------

// 週あたりの直接セット数の目標帯 [下限, 上限](筋肥大・レベル別)。目的で倍率をかける
const WEEKLY_SETS = {
  major: { 1: [6, 10], 2: [10, 16], 3: [12, 20] },
  minor: { 1: [2, 6], 2: [4, 10], 3: [6, 12] },
  core: { 1: [2, 6], 2: [3, 8], 3: [4, 10] },
};
const GOAL_VOLUME = { hypertrophy: 1, strength: 0.8, cut: 0.8, health: 0.6 };
const DAY_SET_CAP = { 1: 16, 2: 22, 3: 25 };
const DAY_CAP_GOAL = { hypertrophy: 1, strength: 0.9, cut: 0.9, health: 0.75 };
const STRENGTH_HEAVY_BUDGET = 15; // 筋力目的の日のメイン+サブ種目の合計セット上限

// 1種目あたりのセット上限(自動調整時)
function exerciseCap(ex, ctx) {
  if (ctx.goal === "health") return 3;
  if (ctx.levelNum === 1 || (ex.tier === "accessory" && ctx.levelNum === 2)) return 4;
  return 5;
}

// プラン内の筋トレ日から、筋肉ごとの週セット数を数える
export function weeklySets(plan) {
  const totals = {};
  for (const day of plan?.days ?? []) {
    if (day.type === "recovery") continue;
    for (const ex of day.exercises ?? []) {
      const key = ex.sub ?? NAME_TO_EXERCISE.get(ex.name)?.sub;
      if (!key || !(key in SUB_MUSCLES)) continue;
      totals[key] = (totals[key] ?? 0) + (Number(ex.sets) || 0);
    }
  }
  return totals;
}

function volumeBands(days, ctx) {
  const liftDays = days.filter((d) => d.type === "lift").length;
  const present = new Set();
  for (const d of days) for (const ex of d.exercises) if (ex.sub in SUB_MUSCLES) present.add(ex.sub);
  const f = GOAL_VOLUME[ctx.goal];
  const bands = {};
  for (const key of SUB_ORDER) {
    if (!present.has(key)) continue;
    const info = SUB_MUSCLES[key];
    let [lo, hi] = WEEKLY_SETS[info.size][ctx.levelNum];
    // 週2回の全身法は1回あたりの時間に限りがあるので下限を少し下げる
    lo = Math.max(1, Math.round(lo * f * (liftDays === 2 ? 0.75 : 1)));
    hi = Math.max(lo + 2, Math.round(hi * f));
    const focused = ctx.focus.has(info.group);
    if (focused) {
      lo += 2;
      hi += 4;
    }
    const hard = Math.min(hi + 2, focused ? 24 : 22); // 「もっときつく」でも超えない上限
    bands[key] = [lo, hi, hard];
  }
  return bands;
}

// 週のセット数を目標帯へ収める(多すぎれば補助種目から削り、少なければ少ない種目から足す)
function balanceSets(liftDays, ctx, bands) {
  const refs = [];
  liftDays.forEach((d, di) => d.exercises.forEach((ex) => refs.push({ ex, di })));
  const dayCap = Math.round(DAY_SET_CAP[ctx.levelNum] * DAY_CAP_GOAL[ctx.goal]);
  const daySets = liftDays.map((d) => d.exercises.reduce((s, e) => s + e.sets, 0));
  const heavySets = liftDays.map((d) => d.exercises.filter((e) => e.tier !== "accessory").reduce((s, e) => s + e.sets, 0));
  const tierOrder = { accessory: 0, secondary: 1, main: 2 };
  const canFill = liftDays.length >= 2; // 週1回は維持向け(足さない)
  for (let guard = 0; guard < 500; guard++) {
    let changed = false;
    const totals = {};
    for (const r of refs) if (r.ex.sub in bands) totals[r.ex.sub] = (totals[r.ex.sub] ?? 0) + r.ex.sets;
    for (const key of SUB_ORDER) {
      const band = bands[key];
      if (!band) continue;
      const mine = refs.filter((r) => r.ex.sub === key);
      if (totals[key] > band[1]) {
        // 多すぎる筋肉は、メイン以外でセット数の多い種目(補助種目を優先)から削る
        const cand = mine
          .filter((r) => r.ex.sets > 2)
          .sort((a, b) => (a.ex.tier === "main") - (b.ex.tier === "main") || b.ex.sets - a.ex.sets ||
            tierOrder[a.ex.tier] - tierOrder[b.ex.tier] || b.di - a.di)[0];
        if (cand) {
          cand.ex.sets--;
          daySets[cand.di]--;
          if (cand.ex.tier !== "accessory") heavySets[cand.di]--;
          changed = true;
        }
      } else if (canFill && totals[key] < band[0]) {
        const heavyBlocked = (r) =>
          ctx.goal === "strength" && r.ex.tier !== "accessory" && heavySets[r.di] >= STRENGTH_HEAVY_BUDGET;
        const eligible = mine
          .filter((r) => r.ex.sets < exerciseCap(r.ex, ctx))
          .sort((a, b) => a.ex.sets - b.ex.sets || (tierOrder[b.ex.tier] === 1) - (tierOrder[a.ex.tier] === 1) || a.di - b.di);
        let cand = eligible.find((r) => daySets[r.di] < dayCap && !heavyBlocked(r));
        let donor = null;
        if (!cand) {
          // その日の上限に達していれば、目標帯の下限に余裕がある別の筋肉から1セット回す(メイン種目からは取らない)
          const sizeOrder = { core: 0, minor: 1, major: 2 };
          for (const r of eligible) {
            donor = refs
              .filter((d) => d.di === r.di && d.ex.sub !== key && d.ex.sets > 2 && d.ex.tier !== "main" && bands[d.ex.sub] &&
                totals[d.ex.sub] - 1 >= bands[d.ex.sub][0] && (!heavyBlocked(r) || d.ex.tier !== "accessory"))
              .sort((a, b) => sizeOrder[SUB_MUSCLES[a.ex.sub].size] - sizeOrder[SUB_MUSCLES[b.ex.sub].size] ||
                tierOrder[a.ex.tier] - tierOrder[b.ex.tier] || b.ex.sets - a.ex.sets)[0] ?? null;
            if (donor) {
              cand = r;
              break;
            }
          }
        }
        if (cand) {
          cand.ex.sets++;
          daySets[cand.di]++;
          if (cand.ex.tier !== "accessory") heavySets[cand.di]++;
          if (donor) {
            donor.ex.sets--;
            daySets[donor.di]--;
            if (donor.ex.tier !== "accessory") heavySets[donor.di]--;
            totals[donor.ex.sub]--;
          }
          totals[key]++;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

// 最低セット数(2)でも週の上限を超える筋肉は、同じ筋肉が重なっている日の補助種目を1つ外す
function pruneOne(liftDays, ctx, bands) {
  const totals = {};
  for (const d of liftDays) for (const e of d.exercises) if (e.sub in bands) totals[e.sub] = (totals[e.sub] ?? 0) + e.sets;
  for (const key of SUB_ORDER) {
    const band = bands[key];
    if (!band || !(totals[key] > band[1])) continue;
    const rows = [];
    liftDays.forEach((d, di) => d.exercises.forEach((e, i) => { if (e.sub === key) rows.push({ d, di, e, i }); }));
    if (rows.some((r) => r.e.sets > 2)) continue;
    const dup = (r) => r.d.exercises.filter((x) => x.sub === key).length;
    const cand = rows
      .filter((r) => r.e.tier !== "main" && !r.e.focused && r.d.exercises.length > 4 && totals[key] - r.e.sets >= band[0])
      .sort((a, b) => (dup(b) > 1) - (dup(a) > 1) || (b.e.tier === "accessory") - (a.e.tier === "accessory") ||
        b.di - a.di || b.i - a.i)[0];
    if (cand) {
      cand.d.exercises.splice(cand.i, 1);
      return true;
    }
  }
  return false;
}

// 筋力目的: 1日の重い種目(メイン+サブ)は合計15セットまで(サブ種目を後ろから減らす)
function applyHeavyBudget(liftDays, ctx) {
  if (ctx.goal !== "strength") return;
  for (const d of liftDays) {
    const heavy = () => d.exercises.filter((e) => e.tier !== "accessory").reduce((s, e) => s + e.sets, 0);
    for (let guard = 0; heavy() > STRENGTH_HEAVY_BUDGET && guard < 50; guard++) {
      const sec = [...d.exercises].reverse().find((e) => e.tier === "secondary" && e.sets > 2);
      if (!sec) break;
      sec.sets--;
    }
  }
}

// メイン種目(その日の1種目目)のセット数が、同じ日の他の種目より少なくならないようにする。
// 同じ筋肉の種目から1セット移す → メインを1セット増やす → 多い種目を1セット減らす、の順で試す
// (どれも週の目標帯・1日の上限・筋力目的の重い種目の上限を超えない範囲で)
function mainLeads(liftDays, ctx, bands) {
  const dayCap = Math.round(DAY_SET_CAP[ctx.levelNum] * DAY_CAP_GOAL[ctx.goal]);
  const totals = {};
  for (const d of liftDays) for (const e of d.exercises) totals[e.sub] = (totals[e.sub] ?? 0) + e.sets;
  // 増やすときは帯の上限、減らすときは帯の下限を割らないか
  const within = (sub, delta) => !bands[sub] || (delta > 0 ? totals[sub] + delta <= bands[sub][1] : totals[sub] + delta >= bands[sub][0]);
  for (const d of liftDays) {
    const main = d.exercises.find((e) => e.tier === "main");
    if (!main) continue;
    for (let guard = 0; guard < 12; guard++) {
      const top = d.exercises
        .filter((e) => e !== main && e.track === "weight")
        .sort((a, b) => b.sets - a.sets)[0];
      if (!top || top.sets <= main.sets) break;
      const mainRoom = main.sets < exerciseCap(main, ctx);
      const daySets = d.exercises.reduce((s, e) => s + e.sets, 0);
      const heavy = d.exercises.filter((e) => e.tier !== "accessory").reduce((s, e) => s + e.sets, 0);
      const heavyRoom = ctx.goal !== "strength" || heavy < STRENGTH_HEAVY_BUDGET;
      if (mainRoom && top.sub === main.sub && top.sets > 2 && (heavyRoom || top.tier !== "accessory")) {
        main.sets++;
        top.sets--;
      } else if (mainRoom && heavyRoom && daySets <= dayCap && within(main.sub, 1)) { // メインは1日の上限+1まで可
        main.sets++;
        totals[main.sub]++;
      } else if (top.sets > 2 && within(top.sub, -1)) {
        top.sets--;
        totals[top.sub]--;
      } else break;
    }
  }
}

function normalizeVolume(days, ctx, bands) {
  const liftDays = days.filter((d) => d.type === "lift");
  applyHeavyBudget(liftDays, ctx);
  balanceSets(liftDays, ctx, bands);
  for (let guard = 0; guard < 40 && pruneOne(liftDays, ctx, bands); guard++) balanceSets(liftDays, ctx, bands);
  mainLeads(liftDays, ctx, bands);
}

function weeklyVolumeSummary(plan) {
  const totals = weeklySets(plan);
  const bands = plan.volumeBands ?? {};
  return SUB_ORDER.filter((k) => totals[k] > 0).map((key) => ({
    key,
    label: SUB_MUSCLES[key].label,
    group: SUB_MUSCLES[key].group,
    sets: totals[key],
    min: bands[key]?.[0] ?? null,
    max: bands[key]?.[1] ?? null,
  }));
}

// ---------- 有酸素 ----------

const SWIM_RX = {
  1: { text: "25m×8本(各30秒休憩)=200m", distanceM: 200, minutes: 15 },
  2: { text: "50m×8本(20秒休憩)+ダウン100m=500m", distanceM: 500, minutes: 20 },
  3: { text: "100m×6本(20秒休憩)+ダウン100m=700m", distanceM: 700, minutes: 25 },
};

// 健康維持: 週150分に届くよう筋トレ日の有酸素の分数を決める(アクティブレストの日は30分歩く)
const HEALTH_RECOVERY_MIN = 30;
function healthCardioMinutes(liftDays, recoveryDays = 0) {
  const rest = Math.max(0, 150 - HEALTH_RECOVERY_MIN * recoveryDays);
  return clampNum(Math.ceil(rest / Math.max(1, liftDays) / 5) * 5, 20, 30);
}

// 目的に応じた1回分の有酸素(null = その目的では付けない)
function goalCardio(ctx, liftDays, recoveryDays = 0) {
  if (ctx.goal === "cut") return { text: "20〜30分", minutes: 25 };
  if (ctx.goal === "strength") return { text: "10〜15分(軽め)", minutes: 12 };
  if (ctx.goal === "health") {
    const m = healthCardioMinutes(liftDays, recoveryDays);
    return { text: `${m}分(会話できる程度)`, minutes: m };
  }
  return null;
}

// 種類ごとの処方(泳ぎは25m単位の本数、バーピー等はインターバル)
function cardioRx(e, ctx, cfg, mode) {
  const isPool = e.equipment.includes("pool");
  if (mode === "recovery") {
    if (e.modality === "swim") return { text: "25m×10本(ゆっくり・各30秒休憩)=250m", minutes: 20, distanceM: 250, isPool };
    return ctx.goal === "health"
      ? { text: `${HEALTH_RECOVERY_MIN}分(会話できる強さ)`, minutes: HEALTH_RECOVERY_MIN, distanceM: null, isPool }
      : { text: "20〜30分(会話できる強さ)", minutes: 25, distanceM: null, isPool };
  }
  if (e.modality === "swim") {
    const rx = SWIM_RX[mode === "optional" ? 1 : ctx.levelNum];
    return { text: mode === "optional" ? `${rx.text.replace(/=/, "(軽め・任意)=")}` : rx.text, minutes: rx.minutes, distanceM: rx.distanceM, isPool };
  }
  if (e.modality === "interval") {
    return ctx.levelNum === 1
      ? { text: "20秒運動+40秒休憩×6〜8本(約8分)", minutes: 8, distanceM: null, isPool }
      : { text: "20秒運動+40秒休憩×8〜10本(約10分)", minutes: 10, distanceM: null, isPool };
  }
  return { text: cfg.text, minutes: cfg.minutes, distanceM: null, isPool };
}

// 有酸素の候補(レベル・器具・安全条件を満たすもの)
function cardioCandidates(ctx, mode, legsDay) {
  let list = CARDIO_POOL.filter((e) => allowed(e, ctx));
  if (mode === "optional") list = list.filter((e) => e.modality === "swim");
  if (mode === "recovery") list = list.filter((e) => e.impact === "low");
  if (legsDay) {
    const soft = list.filter((e) => e.impact !== "high");
    if (soft.length) list = soft; // 脚の日は衝撃の大きい有酸素を避ける
  }
  return list;
}
function cardioScore(e, ctx, usage, mode) {
  let s = e.priority;
  if (ctx.known.has(e.name)) s += 1.5;
  if (usage) s -= (usage.get(e.name) ?? 0) * 2;
  if (ctx.preferLowImpact && e.impact === "high") s -= 4;
  if (e.equipment.includes("pool")) s += 1.5; // プールを選んだ人は泳ぎを優先
  if (mode === "recovery") s += e.modality === "walk" ? 3 : e.modality === "bike" ? 1 : 0;
  return s;
}

function makeCardio(e, ctx, cfg, mode) {
  const rx = cardioRx(e, ctx, cfg, mode);
  const record = ctx.analysis?.lastRecordByName[e.name];
  const target = record ? progressionTarget(record, { name: e.name }, ctx.profile, ctx.now) : null;
  return {
    name: e.name,
    duration: rx.text,
    minutes: rx.minutes,
    distanceM: rx.distanceM,
    isPool: rx.isPool,
    optional: mode === "optional",
    note: record ? progressionNote(record, target) : null,
    ...(target ? { target } : {}),
  };
}

function pickCardio(ctx, cfg, mode, legsDay, usage) {
  const list = cardioCandidates(ctx, mode, legsDay);
  if (list.length === 0) return null;
  const best = [...list].sort((a, b) => cardioScore(b, ctx, usage, mode) - cardioScore(a, ctx, usage, mode))[0];
  if (usage) usage.set(best.name, (usage.get(best.name) ?? 0) + 1);
  return makeCardio(best, ctx, cfg, mode);
}

// ---------- ウォームアップ・クールダウン ----------

const RAMP_PREFIX = "ウォームアップセット";
const hasAny = (pats, list) => list.some((p) => pats.has(p));

// 動作パターンに合わせた動的ウォームアップ(器具が無い人に器具を使うドリルは出さない)
function warmupDrills(exercises, meta, shortened) {
  const pats = new Set(exercises.map((e) => e.pattern ?? NAME_TO_EXERCISE.get(e.name)?.pattern));
  const items = [shortened ? "軽い有酸素 3分で体を温める" : "軽い有酸素 5分(早歩き・バイクなど)で体を温める"];
  if (hasAny(pats, ["squat", "lunge", "knee_ext"])) items.push("股関節・足首回し+自重スクワット 10回(深さの確認)");
  if (hasAny(pats, ["hinge", "glute", "knee_flex"])) items.push("ヒップヒンジ練習 10回(お尻を後ろへ引く)+ヒップリフト 10回");
  if (hasAny(pats, ["h_push", "incline_push", "chest_fly", "triceps"])) items.push("肩甲骨プッシュアップ 10回(腕立て姿勢で肩甲骨を寄せる・離す)");
  if (hasAny(pats, ["v_push", "lateral", "rear_delt"])) {
    items.push(meta.band ? "バンドプルアパート 15回・腕回し前後 各10回" : "腕回し前後 各10回・壁スライド 10回(壁に背をつけて腕を上げ下げ)");
  }
  if (hasAny(pats, ["v_pull", "h_pull", "back_ext", "biceps"])) {
    items.push(meta.bar ? "キャット&カウ 10回・ぶら下がり 20秒" : "キャット&カウ 10回・肩甲骨の寄せ 10回");
  }
  if (items.length === 1 && pats.has("core")) items.push("体幹ひねり・腰回し 各10回");
  if (meta.senior) items.push("片脚立ち 左右30秒(壁や椅子のそばで・転倒予防)");
  return items;
}

// その日の最初の種目だけ段階的に重さを上げる(前回記録があれば kg で示す)
function rampItem(exercises, ctx) {
  const first = exercises.find((e) => e.tier === "main") ?? exercises.find((e) => e.track === "weight");
  if (!first) return null;
  const info = NAME_TO_EXERCISE.get(first.name);
  if (!info || info.load === "bodyweight" || info.load === "band") {
    return `${RAMP_PREFIX}(${first.name}): 本番前にゆっくり5回で動きと可動域を確認`;
  }
  const W = first.target?.weight ?? num(ctx.analysis?.lastRecordByName[first.name]?.weight);
  // 段階の数は本番の回数で決める(5回以下の高重量ほど細かく上げる)
  const heavyRamp = (parseRange(first.reps)?.lo ?? 8) <= 5;
  const scheme = heavyRamp
    ? [[0.4, 5], [0.6, 3], [0.75, 2], [0.85, 1]]
    : ctx.goal === "health" ? [[0.5, 10]] : [[0.5, 8], [0.7, 4]];
  if (W > 0) {
    // 重さは記録の選択肢にある値へ丸める。バーベルはバー(20kg)より軽くしない
    const bar = info.load === "barbell" ? 20 : 0;
    const parts = [];
    if (heavyRamp && bar && W > bar * 1.5) parts.push(`${bar}kg(バーのみ)×10`);
    let last = bar && parts.length ? bar : 0;
    for (const [pct, reps] of scheme) {
      const kg = snapFor(W * pct, info);
      if (kg <= last || kg >= W || kg < bar) continue;
      parts.push(`${fmtKg(kg)}kg×${reps}`);
      last = kg;
    }
    if (parts.length === 0) return `${RAMP_PREFIX}(${first.name}): 本番より軽い重量で1セット(8回)`;
    return `${RAMP_PREFIX}(${first.name}): ${parts.join(" → ")} → 本番${fmtKg(W)}kg`;
  }
  const text = heavyRamp
    ? "軽い重量×10 → 本番の40%×5 → 60%×3 → 75%×2 → 85%×1"
    : ctx.goal === "health" ? "本番より軽い重量で1セット(10回)" : "本番の約50%×8 → 70%×4";
  return `${RAMP_PREFIX}(${first.name}): ${text}`;
}

const COOLDOWN_BY_SUB = {
  chest: "大胸筋ストレッチ(壁に手をついて胸を開く)",
  back: "広背筋ストレッチ(両手を前に伸ばし背中を丸める)",
  front_delt: "三角筋ストレッチ(腕を体の前で抱える)",
  side_delt: "三角筋ストレッチ(腕を体の前で抱える)",
  rear_delt: "三角筋ストレッチ(腕を体の前で抱える)",
  triceps: "上腕三頭筋ストレッチ(肘を頭の後ろへ)",
  biceps: "上腕二頭筋・前腕ストレッチ(手のひらを前に向けて腕を伸ばす)",
  quads: "もも前ストレッチ(かかとをお尻へ引き寄せる)",
  hamstrings: "もも裏・お尻のストレッチ(長座で前屈・脚を組んで胸へ)",
  glutes: "もも裏・お尻のストレッチ(長座で前屈・脚を組んで胸へ)",
  calves: "ふくらはぎストレッチ(壁を押してかかとを床へ)",
  core: "腹筋ストレッチ(うつ伏せで上体を反らす)",
};
function cooldownItems(exercises) {
  const subs = new Set(exercises.map((e) => e.sub ?? NAME_TO_EXERCISE.get(e.name)?.sub).filter(Boolean));
  const items = [...new Set(SUB_ORDER.filter((k) => subs.has(k)).map((k) => COOLDOWN_BY_SUB[k]))];
  items.push("深呼吸を数回。水分補給を忘れずに");
  return items;
}

const RECOVERY_WARMUP = ["首・肩・股関節をゆっくり回す 各10回"];
const RECOVERY_COOLDOWN = [
  "キャット&カウ 10回",
  "ワールドグレイテストストレッチ 左右5回",
  "胸・もも裏・ふくらはぎのストレッチ 各30秒",
  "深呼吸を数回。疲れが強い日は完全休養でOK",
];

function focusSummaryOf(day) {
  if (day.type === "recovery") return "軽い有酸素+ストレッチで回復";
  const groups = [];
  for (const e of day.exercises) {
    const g = focusGroupOf(e);
    if (g && g !== "cardio" && !groups.includes(g)) groups.push(g);
  }
  return groups.map((g) => MUSCLE_LABELS[g]).join("・");
}

// 種目の増減後にウォームアップ・クールダウン・所要時間を作り直す(除いた部位の準備は残さない)
function refreshDay(day, meta) {
  if (day.type === "recovery") {
    day.estMinutes = estimateMinutes(day);
    return;
  }
  const ramp = (day.warmup ?? []).find((s) => s.startsWith(RAMP_PREFIX));
  const rampStill = ramp && day.exercises.some((e) => ramp.startsWith(`${RAMP_PREFIX}(${e.name})`));
  day.warmup = [...warmupDrills(day.exercises, meta ?? {}, !!day.shortened), ...(rampStill ? [ramp] : [])];
  day.cooldown = cooldownItems(day.exercises);
  day.focusSummary = focusSummaryOf(day);
  day.estMinutes = estimateMinutes(day);
}

// ---------- 所要時間 ----------

function workSeconds(ex) {
  const reps = String(ex.reps ?? "");
  const r = parseRange(reps);
  const sides = /左右/.test(reps) ? 2 : 1;
  if (!r) return 40;
  const mid = (r.lo + r.hi) / 2;
  if (/秒/.test(reps.split("(")[0])) return clampNum(mid * sides + 5, 15, 150);
  const perRep = /5秒かけて/.test(reps) ? 7 : /3秒かけて/.test(reps) ? 5 : 3;
  return clampNum(mid * perRep * sides + 10, 20, 150);
}
function cardioMinutesOf(cardio) {
  if (!cardio || cardio.optional) return 0;
  if (Number.isFinite(cardio.minutes)) return cardio.minutes;
  const d = String(cardio.duration ?? "");
  const r = parseRange(d);
  return r && d.includes("分") ? (r.lo + r.hi) / 2 : 0;
}

// 1日の所要時間の目安(分・5分単位で切り上げ)。
// 各種目 = セット×動作時間 + (セット−1)×休憩(範囲の中央)+ 準備1分、+ウォームアップ・クールダウン・有酸素
export function estimateMinutes(day) {
  if (!day) return 0;
  const exercises = Array.isArray(day.exercises) ? day.exercises : [];
  let sec = 0;
  for (const ex of exercises) {
    const sets = Math.max(1, Number(ex.sets) || 1);
    sec += sets * workSeconds(ex) + (sets - 1) * restMidSeconds(ex.rest) + 60;
  }
  let min = sec / 60;
  if (exercises.length > 0 && day.type !== "recovery") min += day.shortened ? 7 : 11; // ウォームアップ+クールダウン
  else min += 10;                                                                     // 回復日のモビリティ
  min += cardioMinutesOf(day.cardio);
  return Math.ceil(min / 5 - 1e-9) * 5;
}

// ---------- アドバイス ----------

function buildAdvice(ctx, split, cardioWeekMinutes) {
  const p = ctx.profile;
  const refW = ctx.obese ? Math.round(25 * (p.height / 100) ** 2) : p.weight;
  const refNote = refW !== p.weight ? `(BMIが高いため身長からの目安体重${refW}kgで計算)` : "";
  const tips = [];
  let protein;
  let calories;
  const range = (a, b, label) => `1日あたり ${Math.round(refW * a)}〜${Math.round(refW * b)}g(${label})${refNote}`;

  switch (ctx.goal) {
    case "hypertrophy":
      protein = range(1.6, 2.2, "体重×1.6〜2.2g");
      calories = "メンテナンスカロリー+200〜300kcal を目安に、少しずつ増量しましょう。";
      tips.push("ダブルプログレッション:回数が範囲の上限に届いたら、次回は重量を1段階上げて下限の回数からやり直します。");
      break;
    case "cut":
      protein = range(1.8, 2.2, "筋肉量を守るため多めに");
      calories = "メンテナンスカロリー−300〜500kcal を目安に。急激な減量は筋肉も落ちるので避けましょう。";
      tips.push("筋トレ後の有酸素運動は脂肪燃焼に効果的です。無理のない強度で継続しましょう。");
      break;
    case "strength":
      protein = range(1.6, 2.0, "体重×1.6〜2.0g");
      calories = "メンテナンスカロリー前後を維持し、トレーニング前は炭水化物をしっかり摂りましょう。";
      tips.push(ctx.youth
        ? "重さより正しいフォームを優先し、8回以上できる重量で少しずつ伸ばしましょう。"
        : "高重量・低回数では正しいフォームが最重要です。重量を欲張らず段階的に伸ばしましょう。");
      break;
    default:
      protein = range(1.2, 1.6, "体重×1.2〜1.6g");
      calories = "バランスの良い食事を心がけ、極端な増減は不要です。";
      tips.push("「続けること」が最大の効果を生みます。きつい日はセット数を減らしてもOKです。");
  }
  if (ctx.youth) {
    protein = range(1.2, 1.6, "体重×1.2〜1.6g・成長期は食事量をしっかり");
    calories = "成長期なので極端な食事制限はせず、食事の質(主食・主菜・副菜・乳製品)を整えましょう。";
  }

  tips.push("ウォームアップセットはその日の最初の種目(と重量が大きく変わる種目)だけでOK。2種目目以降はすぐ本番へ。");
  tips.push(ctx.youth ? "成長期は8〜10時間の睡眠を目安にしましょう。" : "睡眠を7時間以上確保すると回復と成長が促進されます。");
  if (ctx.youth) tips.push("フォーム習得を優先し、できれば指導者や大人に見てもらいながら行いましょう。");
  if (ctx.bmi.value > 0 && ctx.bmi.value < 18.5 && ctx.goal === "cut") {
    tips.push("BMIが低体重の範囲です。減量よりも筋肉をつける方向(食事量アップ)を検討してください。");
  }
  if (ctx.obese) {
    tips.push("腕立ては膝つきや台に手をついて、スクワットは椅子スクワットから始めてOK。膝や腰に痛みがあれば中止しましょう。");
  }
  if (p.age >= 50) {
    const rest = split.recoveryDays > 0
      ? "アクティブレストの日は散歩程度でOK。疲れが残る日は完全に休みましょう。"
      : "週1回以上は完全休養日を設けましょう。";
    tips.push(`関節への負担に注意し、痛みを感じたらすぐ中止してください。${rest}`);
  }
  if (ctx.senior) tips.push("転倒予防に、片脚立ち(左右30秒)や椅子スクワットを日常にも取り入れましょう。");
  if (ctx.goal === "health") {
    const more = cardioWeekMinutes < 150 ? "トレーニングのない日にも早歩き20〜30分を足しましょう。" : "この調子で続けましょう。";
    tips.push(`有酸素は週150分が目安です(このメニューの合計 約${cardioWeekMinutes}分)。${more}`);
  }
  if (ctx.selected.has("pool") && ctx.goal === "hypertrophy") {
    tips.push("休養日に軽い水泳や水中ウォーキング(25m×8〜12本・20〜30分)を行うと、関節に優しく回復(アクティブレスト)に役立ちます。");
  }
  return { protein, calories, tips };
}

function buildWeekNote(ctx, split) {
  const parts = [];
  if (split.recoveryDays > 0) {
    if (ctx.frequency > 6 && ctx.liftCap === 6) {
      parts.push("7日のうち1日はアクティブレスト(軽い有酸素とストレッチ)で回復にあてます。");
    } else {
      const who = ctx.youth ? "成長期" : ctx.senior ? "60歳以上" : "初心者";
      parts.push(`回復のため週${ctx.frequency}回のうち${split.recoveryDays}日は軽めの日(アクティブレスト)にしています(${who}は週${ctx.liftCap}回までの筋トレがおすすめ)。`);
    }
  }
  if (split.liftDays === 1) parts.push("週1回は維持向けのボリュームです。余裕があれば週2回以上にすると効果が上がります。");
  if (WEEKDAY_HINT[ctx.frequency]) parts.push(`おすすめの曜日: ${WEEKDAY_HINT[ctx.frequency]}(筋トレ日の間を空けると回復しやすい)。`);
  return parts.join("");
}

// ---------- メイン:プロフィール(+トレーニング記録)から1週間のメニューを生成する ----------
// profile: { weight, height, age, gender, goal, level, frequency, focus: string[], equipment: string[] }
// logs:    [{ date, entries: [{ name, track, weight, sets, reps, ... }] }](省略可)
export function generatePlan(profile, logs = [], now = new Date()) {
  const ctx = makeContext(profile, logs, now);
  const analysis = ctx.analysis;
  const split = buildSplit(ctx);
  const stale = new Set((analysis?.neglectedMuscles ?? []).filter((m) => m in (analysis?.muscleLastDays ?? {})));
  const meta = {
    goal: ctx.goal, level: ctx.level, levelNum: ctx.levelNum, frequency: ctx.frequency,
    senior: ctx.senior, band: ctx.selected.has("band"), bar: ctx.selected.has("pullup_bar"),
  };

  const usage = new Map();
  const days = split.seq.map((key, i) => {
    if (key !== "recovery") return buildLiftDay(i, key, ctx, usage, stale);
    return {
      title: `Day ${i + 1}:アクティブレスト`,
      type: "recovery",
      split: "recovery",
      focusSummary: "",
      warmup: [...RECOVERY_WARMUP],
      cooldown: [...RECOVERY_COOLDOWN],
      estMinutes: 0,
      exercises: [],
      cardio: null,
    };
  });

  // 週のセット数を目標帯へ
  const bands = volumeBands(days, ctx);
  normalizeVolume(days, ctx, bands);

  // 60歳以上の回復日はバランス練習(片脚立ち・椅子スクワット)を入れる
  if (ctx.senior) {
    for (const day of days.filter((d) => d.type === "recovery")) {
      for (const name of ["片脚立ち", "椅子スクワット"]) {
        const e = NAME_TO_EXERCISE.get(name);
        const p = resolveParams(e, "accessory", ctx);
        day.exercises.push({
          name, muscle: e.muscle, sub: e.sub, pattern: e.pattern, slot: e.pattern, track: e.track, tip: e.tip,
          role: "accessory", tier: "accessory", sets: 2, baseSets: 2, reps: p.reps, rest: p.rest,
          note: null, focused: false, extra: false,
        });
      }
    }
  }

  // 確定したセット数を基準値として保存し、前回記録から今日の目標を付ける
  for (const day of days) {
    for (const ex of day.exercises) {
      ex.baseSets = ex.sets;
      const record = analysis?.lastRecordByName[ex.name];
      if (record) {
        const target = progressionTarget(record, ex, ctx.profile, now);
        ex.note = progressionNote(record, target);
        if (target) ex.target = target;
      }
    }
  }

  // 有酸素: 目的に応じて筋トレ日に付ける(日ごとに種類を回し、脚の日は衝撃の小さいものに)
  const cfg = goalCardio(ctx, split.liftDays, split.recoveryDays);
  const cardioUsage = new Map();
  const poolOptional = !cfg && ctx.selected.has("pool");
  for (const day of days) {
    if (day.type === "recovery") {
      day.cardio = pickCardio(ctx, null, "recovery", false, cardioUsage);
    } else if (cfg || poolOptional) {
      const legsDay = day.split === "lower" || day.split === "legs";
      day.cardio = pickCardio(ctx, cfg, cfg ? "normal" : "optional", legsDay, cardioUsage);
    }
  }

  // ウォームアップ(最初の種目のランプアップ付き)・クールダウン・所要時間
  for (const day of days) {
    if (day.type === "lift") day.warmup = [...warmupDrills(day.exercises, meta, false)];
    const ramp = day.type === "lift" ? rampItem(day.exercises, ctx) : null;
    if (ramp) day.warmup.push(ramp);
    if (day.type === "lift") day.cooldown = cooldownItems(day.exercises);
    day.focusSummary = focusSummaryOf(day);
    day.estMinutes = estimateMinutes(day);
  }

  const cardioWeekMinutes = days.reduce((s, d) => s + cardioMinutesOf(d.cardio), 0);
  const advice = buildAdvice(ctx, split, cardioWeekMinutes);
  let historySummary = null;
  if (analysis) {
    historySummary = [
      `トレーニング記録 ${analysis.count}件を反映しました`,
      `前回のトレーニング: ${shortDate(analysis.lastDate)}(${analysis.daysSinceLast === 0 ? "今日" : `${analysis.daysSinceLast}日前`})`,
      `直近4週間の頻度: 週あたり約${analysis.weeklyAvg}回`,
    ];
    if (stale.size > 0) {
      historySummary.push(`しばらく鍛えていない部位: ${[...stale].map(analysis.muscleLabel).join("・")}(同じ種類の中で優先して配置)`);
    }
    if (analysis.daysSinceLast >= 21) {
      advice.tips.unshift("3週間以上のブランクがあります。重量は以前の70〜80%程度から再開し、1〜2週間かけて戻しましょう。");
    }
  }

  const weekNote = buildWeekNote(ctx, split);
  const scheme = GOAL_PARAMS[ctx.goal].scheme + (ctx.youth ? " 成長期のため、どの種目も8回以上できる重さで行います。" : "");
  const plan = {
    bmi: ctx.bmi,
    splitName: split.name,
    repScheme: scheme,
    focusLabels: [...ctx.focus].map((m) => MUSCLE_LABELS[m] ?? m),
    advice,
    historySummary,
    ...(weekNote ? { weekNote } : {}),
    days,
    meta,
    maintenance: split.liftDays === 1,
    volumeBands: bands,
    weeklyVolume: [],
    weeklyCardioMinutes: cardioWeekMinutes,
  };
  plan.weeklyVolume = weeklyVolumeSummary(plan);
  return plan;
}

// ---------- メニューへの相談(調整)機能 ----------

// 入れ替え候補(同じ動作パターン → 足りなければ同じ枠の代替パターン → 近い動作)。
// レベル・器具・年齢の条件は生成時と同じ。上半身・Push・Pull の日と、別のヒンジがある日はヒンジ不可。
function swapCandidates(ctx, day, exIndex) {
  const current = day.exercises[exIndex];
  const info = NAME_TO_EXERCISE.get(current.name);
  // 基準は枠のパターン(slot の先頭)。入れ替えた後も同じ候補の輪で回るようにする
  const chain = String(current.slot ?? "").split("|").filter(Boolean);
  const pattern = chain[0] ?? current.pattern ?? info?.pattern ?? null;
  const others = new Set(day.exercises.filter((_, i) => i !== exIndex).map((e) => e.name));
  const noHinge = NO_HINGE_SPLITS.has(day.split) || /上半身|Push|Pull/.test(day.title ?? "");
  const otherHinge = day.exercises.some(
    (e, i) => i !== exIndex && (e.pattern ?? NAME_TO_EXERCISE.get(e.name)?.pattern) === "hinge"
  );
  // アクティブレストの日は器具を使わない軽い種目の中だけで入れ替える
  const recovery = day.type === "recovery";
  const ok = (e) =>
    allowed(e, ctx) && !others.has(e.name) && !(e.pattern === "hinge" && (noHinge || otherHinge)) &&
    !(recovery && e.equipment.length > 0);
  const sorter = byScore(ctx, null, current.tier === "main");
  const list = [];
  const addPattern = (p) => {
    for (const e of STRENGTH_POOL.filter((x) => x.pattern === p && ok(x)).sort(sorter)) {
      if (!list.includes(e)) list.push(e);
    }
  };
  if (pattern) {
    addPattern(pattern);
    if (list.length < 2) for (const p of chain.slice(1)) addPattern(p);
    if (list.length < 2) for (const p of SWAP_SIBLINGS[pattern] ?? []) addPattern(p);
  } else if (current.muscle) {
    // 旧形式の行(パターン情報なし)は同じ部位から選ぶ
    for (const e of STRENGTH_POOL.filter((x) => x.muscle === current.muscle && x.pattern !== "balance" && ok(x)).sort(sorter)) list.push(e);
  }
  return list;
}

function buildSwapRow(next, current, ctx, day) {
  const tier = day.type !== "recovery" && next.kind === "compound" && tierRank(next) <= 1
    ? (current.tier === "main" && tierRank(next) === 0 ? "main" : "secondary")
    : "accessory";
  const p = resolveParams(next, tier, ctx);
  const row = {
    name: next.name,
    muscle: next.muscle,
    sub: next.sub,
    pattern: next.pattern,
    slot: current.slot ?? current.pattern ?? NAME_TO_EXERCISE.get(current.name)?.pattern ?? next.pattern,
    track: next.track,
    tip: next.tip,
    role: tier === "accessory" ? "accessory" : "main",
    tier,
    // もっときつく/楽に・時短で調整したセット数を引き継ぐ(B23)
    sets: clampNum(Number(current.sets) || p.sets, 1, 6),
    baseSets: Number(current.baseSets) || Number(current.sets) || p.sets,
    reps: p.reps,
    rest: day.shortened ? cappedRest({ ...current, name: next.name, tier, rest: p.rest }, ctx.goal) : p.rest,
    note: null,
    focused: ctx.focus.has(focusGroupOf(next)),
    extra: !!current.extra,
  };
  const record = ctx.analysis?.lastRecordByName[next.name];
  if (record) {
    const target = progressionTarget(record, row, ctx.profile, ctx.now);
    row.note = progressionNote(record, target);
    if (target) row.target = target;
  }
  return row;
}

// 現在の種目を、同じ動作パターン・使える器具・レベル内の「次の候補種目」に差し替えた行を返す。
// タップするたびに候補を順に切り替えられる(一周すると元に戻る)。候補が無ければ null。
export function alternativeExercise(profile, logs, day, exIndex, now = new Date()) {
  const current = day?.exercises?.[exIndex];
  if (!current?.name) return null;
  const ctx = makeContext(profile, logs, now);
  const list = swapCandidates(ctx, day, exIndex);
  if (list.length === 0) return null;
  const idx = list.findIndex((e) => e.name === current.name);
  const next = list[(idx + 1) % list.length];
  if (!next || next.name === current.name) return null;
  return buildSwapRow(next, current, ctx, day);
}

// ↻ ボタンを押して別の種目があるか(無ければボタンを無効表示にできる)
export function hasAlternative(profile, day, exIndex) {
  const current = day?.exercises?.[exIndex];
  if (!current?.name) return false;
  const ctx = makeContext(profile, [], new Date());
  return swapCandidates(ctx, day, exIndex).some((e) => e.name !== current.name);
}

// 有酸素種目を次の候補に差し替える(プールがあれば泳法の切替などに使える)。
// 戻り値は日の cardio をそのまま置き換えられる完全なオブジェクト(候補が無ければ null)。
// opts.day を渡すと、脚の日・回復日の条件も考慮する。
export function alternativeCardio(profile, logs, currentName, now = new Date(), opts = {}) {
  const ctx = makeContext(profile, logs, now);
  const day = opts.day ?? null;
  const mode = day?.type === "recovery" ? "recovery" : day?.cardio?.optional ? "optional" : "normal";
  const legsDay = day?.split === "lower" || day?.split === "legs";
  const list = [...cardioCandidates(ctx, mode, legsDay)].sort((a, b) => b.priority - a.priority);
  if (list.length <= 1 && list[0]?.name === currentName) return null;
  if (list.length === 0) return null;
  const idx = list.findIndex((e) => e.name === currentName);
  const next = list[(idx + 1) % list.length];
  if (next.name === currentName) return null;
  const liftDays = Math.min(ctx.frequency, ctx.liftCap);
  const cfg = goalCardio(ctx, liftDays, ctx.frequency - liftDays) ?? { text: "20〜30分", minutes: 25 };
  const cardio = makeCardio(next, ctx, cfg, mode);
  if (day?.shortened && mode === "normal") shortenCardio(cardio);
  return cardio;
}

function planGoal(plan) {
  return plan?.meta?.goal ?? "hypertrophy";
}

// 全種目のセット数を増減する。戻り値は変更した種目数(0 = これ以上は調整できない)。
// きつく: 各種目+1(1種目5セットまで、筋肉ごとの週の上限を超えない)/ 楽に: 各種目−1(2セットまで)
export function adjustPlanVolume(plan, delta) {
  let changes = 0;
  const bands = plan?.volumeBands;
  if (!bands) {
    // 旧形式のプラン(目標帯なし)
    for (const day of plan?.days ?? []) {
      for (const ex of day.exercises ?? []) {
        const next = Math.max(2, Math.min(6, ex.sets + delta));
        if (next !== ex.sets) changes++;
        ex.sets = next;
      }
    }
    return changes;
  }
  const totals = weeklySets(plan);
  const cap = planGoal(plan) === "health" ? 4 : 5;
  for (const day of plan.days) {
    if (day.type === "recovery") continue;
    for (const ex of day.exercises) {
      const key = ex.sub;
      if (delta > 0) {
        if (ex.sets >= cap) continue;
        if (key && bands[key] && (totals[key] ?? 0) + 1 > bands[key][2]) continue;
        ex.sets++;
        if (key) totals[key] = (totals[key] ?? 0) + 1;
        changes++;
      } else if (delta < 0 && ex.sets > 2) {
        ex.sets--;
        if (key) totals[key] = (totals[key] ?? 0) - 1;
        changes++;
      }
    }
    day.estMinutes = estimateMinutes(day);
  }
  plan.weeklyVolume = weeklyVolumeSummary(plan);
  return changes;
}

// もっときつく/楽に がまだ効くか(ボタンの無効表示用)
export function canAdjustVolume(plan, delta) {
  return adjustPlanVolume(JSON.parse(JSON.stringify(plan)), delta) > 0;
}

// 時短版の休憩の上限(重いバーベル種目は2分未満にしない)
function cappedRest(ex, goal) {
  const info = NAME_TO_EXERCISE.get(ex.name);
  const cur = parseRestSeconds(ex.rest);
  let cap;
  let text;
  if (ex.tier === "main") {
    [cap, text] = goal === "strength" ? [120, "2〜3分"] : info?.heavy ? [120, "2分"] : [90, "90秒"];
  } else if (ex.tier === "secondary") {
    [cap, text] = info?.heavy ? [120, "2分"] : [90, "90秒"];
  } else {
    [cap, text] = info?.style === "hold" || info?.style === "high" ? [45, "45秒"] : [60, "60秒"];
  }
  return cur > cap ? text : ex.rest;
}

function shortenCardio(cardio) {
  const info = NAME_TO_EXERCISE.get(cardio.name);
  if (info?.modality === "swim") {
    Object.assign(cardio, { duration: "25m×6本(各30秒休憩)=150m", minutes: 10, distanceM: 150 });
  } else if (info?.modality === "interval") {
    Object.assign(cardio, { duration: "20秒運動+40秒休憩×6本(約6分)", minutes: 6 });
  } else if (!(cardio.minutes <= 10)) {
    Object.assign(cardio, { duration: "10分", minutes: 10 });
  }
}

// 時間を短くする(目安: 筋力目的は1日50分・その他は45分以内)。何度押しても結果は同じ。
// メイン種目は3セット・他は2セット、休憩を短縮、有酸素は10分。まだ長ければ ★強化部位とメイン以外の
// 補助種目を後ろから外す(最低3種目は残す)。外した部位のウォームアップ・ストレッチも除く。
export function shortenPlan(plan, targetMin) {
  const goal = planGoal(plan);
  const target = targetMin ?? (goal === "strength" ? 50 : 45);
  let cardioMoved = false;
  for (const day of plan.days) {
    if (!day.exercises?.length || day.type === "recovery") continue;
    day.shortened = true;
    day.exercises.forEach((ex, i) => {
      // 旧形式の行(tier なし)は先頭をメイン、複合種目をサブとみなす
      const tier = ex.tier ?? (i === 0 ? "main" : NAME_TO_EXERCISE.get(ex.name)?.kind === "compound" ? "secondary" : "accessory");
      ex.sets = Math.min(ex.sets, tier === "main" ? 3 : 2);
      ex.rest = cappedRest({ ...ex, tier }, goal);
    });
    if (day.cardio && !day.cardio.optional) shortenCardio(day.cardio);
    const droppable = () => {
      const idxs = day.exercises
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => !e.focused && (e.tier ? e.tier !== "main" : i !== 0));
      const acc = idxs.filter(({ e }) => (e.tier ?? "accessory") === "accessory");
      const pool = acc.length ? acc : idxs;
      return pool.length ? pool[pool.length - 1].i : -1;
    };
    while (estimateMinutes(day) > target && day.exercises.length > 3) {
      const i = droppable();
      if (i < 0) break;
      day.exercises.splice(i, 1);
    }
    if (estimateMinutes(day) > target && day.cardio && !day.cardio.optional) {
      day.cardio = null;
      cardioMoved = true;
    }
    refreshDay(day, plan.meta);
  }
  plan.shortened = true;
  if (cardioMoved) {
    const note = "時短版では有酸素を休養日に回しています。";
    if (!String(plan.weekNote ?? "").includes(note)) plan.weekNote = `${plan.weekNote ?? ""}${note}`;
  }
  if (plan.volumeBands) plan.weeklyVolume = weeklyVolumeSummary(plan);
}
