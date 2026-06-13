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
  { name: "ウォールシット(空気椅子)", muscle: "legs", equipment: [], level: 1, priority: 4, kind: "isolation" },

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
  { name: "サイドプランク", muscle: "core", equipment: [], level: 1, priority: 6, kind: "isolation" },
  { name: "クランチ", muscle: "core", equipment: [], level: 1, priority: 5, kind: "isolation" },
  { name: "レッグレイズ", muscle: "core", equipment: [], level: 1, priority: 5, kind: "isolation" },
  { name: "ロシアンツイスト", muscle: "core", equipment: [], level: 1, priority: 4, kind: "isolation" },
  { name: "ハンギングレッグレイズ", muscle: "core", equipment: ["pullup_bar"], level: 2, priority: 6, kind: "isolation" },
  { name: "ケーブルクランチ", muscle: "core", equipment: ["cable"], level: 2, priority: 5, kind: "isolation" },
  { name: "アブドミナルクランチ(マシン)", muscle: "core", equipment: ["mc_abdominal"], level: 1, priority: 6, kind: "isolation" },

  // --- 有酸素 ---
  { name: "水泳(クロール)", muscle: "cardio", equipment: ["pool"], level: 2, priority: 10, kind: "cardio" },
  { name: "水泳(平泳ぎ)", muscle: "cardio", equipment: ["pool"], level: 1, priority: 9, kind: "cardio" },
  { name: "水泳(背泳ぎ)", muscle: "cardio", equipment: ["pool"], level: 2, priority: 7, kind: "cardio" },
  { name: "水泳(バタフライ)", muscle: "cardio", equipment: ["pool"], level: 3, priority: 5, kind: "cardio" },
  { name: "ビート板キック", muscle: "cardio", equipment: ["pool"], level: 1, priority: 6, kind: "cardio" },
  { name: "水中ウォーキング", muscle: "cardio", equipment: ["pool"], level: 1, priority: 8, kind: "cardio" },
  { name: "ランニング", muscle: "cardio", equipment: ["treadmill"], level: 1, priority: 8, kind: "cardio" },
  { name: "エアロバイク", muscle: "cardio", equipment: ["bike"], level: 1, priority: 7, kind: "cardio" },
  { name: "ローイングエルゴメーター", muscle: "cardio", equipment: ["mc_rowing"], level: 1, priority: 7, kind: "cardio" },
  { name: "バーピー", muscle: "cardio", equipment: [], level: 2, priority: 6, kind: "cardio" },
  { name: "ジャンピングジャック+その場ジョギング", muscle: "cardio", equipment: [], level: 1, priority: 5, kind: "cardio" },
];

const EXERCISE_TIPS = {"ベンチプレス": "肩甲骨を寄せて胸を張り、バーをみぞおち付近へ。お尻はベンチに着けたまま。", "インクラインベンチプレス": "30〜45度の傾斜で上部胸を狙う。バーは鎖骨のやや下へ下ろす。", "ダンベルプレス": "手首を立て、ダンベルを胸の高さまで下ろして大きく動かす。", "ダンベルフライ": "肘を軽く曲げたまま弧を描く。胸のストレッチを感じる位置で止める。", "チェストプレス(マシン)": "グリップは胸の高さ。押し切っても肘は完全にロックしない。", "ペックフライ(マシン)": "肘の角度を保ち、胸を寄せる意識で正面へ。戻しはゆっくり。", "ケーブルクロスオーバー": "やや前傾し、みぞおち前で手を交差。胸の収縮を意識。", "バンドチェストプレス": "背中にバンドを回し、肩の高さから前方へ。戻しも効かせる。", "スミスマシンベンチプレス": "軌道が固定される分、足の踏ん張りと胸の張りに集中。", "腕立て伏せ": "体を一直線に保ち、胸が床ギリギリまで。お尻が落ちないように。", "ワイドプッシュアップ": "手幅を肩より広めに。胸の外側に効かせる。", "デクラインプッシュアップ": "足を台に乗せて上部胸・肩へ負荷。体幹をまっすぐ。", "デッドリフト": "背中を丸めない。バーは体に沿わせ、股関節を使って立ち上がる。", "ベントオーバーロー": "上体を45度前傾し背中はまっすぐ。みぞおちへ引く。", "ラットプルダウン": "胸を張り、肘を下げる意識でバーを鎖骨へ。反動を使わない。", "シーテッドロー(マシン)": "背中を立て、肩甲骨を寄せてお腹へ引く。", "ケーブルロー": "背中を丸めず、肘を体側に沿わせて引く。", "懸垂(チンニング)": "肩を下げて胸を張り、顎がバーを越えるまで。きつければ補助を使う。", "斜め懸垂(インバーテッドロー)": "体を一直線に保ち胸をバーへ。角度で強度を調整。", "ワンハンドダンベルロー": "ベンチに片手片膝。背中はまっすぐ、肘を後ろへ引く。", "ダンベルデッドリフト": "背中を丸めず股関節から曲げる。すねに沿って下ろす。", "バンドロー": "バンドを足や柱に固定し、肩甲骨を寄せて引く。", "スーパーマン(バックエクステンション)": "うつ伏せで手脚を同時に上げ、背中で反る。反動を使わない。", "バーベルスクワット": "足は肩幅、つま先やや外。太ももが床と平行まで。膝とつま先は同方向。", "ルーマニアンデッドリフト": "膝を軽く曲げ股関節を後ろへ。もも裏のストレッチを感じる。", "レッグプレス": "足はプレート中央。膝を胸方向へ深く曲げ、押し切ってもロックしない。", "レッグエクステンション": "反動を使わず膝を伸ばし切る。一瞬止めて戻す。", "レッグカール": "かかとをお尻へ引きつける。骨盤を浮かせない。", "ゴブレットスクワット": "ダンベルを胸前で持ち、背中を立てて深くしゃがむ。", "ダンベルランジ": "一歩踏み出し前膝を90度。上体は垂直、膝はつま先より前に出しすぎない。", "ブルガリアンスクワット": "後ろ足をベンチに乗せ、前足重心で深くしゃがむ。", "ケトルベルスイング": "股関節の蝶番動作で振る。腕で持ち上げず、お尻の力で。", "スミスマシンスクワット": "軌道固定なので深さとフォームに集中。膝を内に入れない。", "自重スクワット": "足は肩幅、太もも平行まで。かかと重心で立ち上がる。", "フォワードランジ": "前に踏み出し前膝90度。体幹をまっすぐ保つ。", "ヒップリフト": "仰向けで膝を立て、お尻を締めて持ち上げる。腰で反らない。", "カーフレイズ": "つま先立ちでかかとを最大限上げ、一瞬止めてゆっくり下ろす。", "ウォールシット(空気椅子)": "壁に背中をつけ、太ももが床と平行になる姿勢をキープ。", "オーバーヘッドプレス": "体幹を締め、バーを真上へ。腰を反りすぎない。", "ダンベルショルダープレス": "肘を軽く前に、耳の横から真上へ。手首を立てる。", "サイドレイズ": "小指側をやや上に、肩の高さまで。反動を使わずゆっくり。", "リアレイズ": "前傾して肩甲骨は動かさず、後方の三角筋で開く。", "ショルダープレス(マシン)": "グリップは肩の高さから。押し切っても肘はロックしない。", "ケーブルサイドレイズ": "体の後ろからケーブルを引き、肩の高さへ。", "バンドサイドレイズ": "バンドを踏んで肩の高さまで。下ろす時も効かせる。", "パイクプッシュアップ": "お尻を高く上げ、頭を床へ近づける。肩に効かせる。", "バーベルカール": "肘を固定し反動を使わず巻き上げる。下ろしもゆっくり。", "ナローベンチプレス": "手幅を狭め、肘を体側に。上腕三頭筋を意識。", "ダンベルカール": "肘を固定し小指を巻き込むように。左右交互でも可。", "ハンマーカール": "手のひらを内側に向けたまま巻き上げる。前腕も鍛える。", "ダンベルフレンチプレス": "肘を頭の横で固定し、後頭部の後ろへ下ろして伸ばす。", "トライセプスプレスダウン": "肘を体側に固定し、下まで押し切る。戻しもゆっくり。", "バンドカール": "バンドを踏み、肘を固定して巻き上げる。", "ディップス(椅子・台を利用)": "手を台につき、肘を後ろへ曲げて体を落とす。肩をすくめない。", "プランク": "肘は肩の真下、頭〜かかとを一直線に。お尻を上げ下げしない。", "サイドプランク": "肘を肩の下に、体を横一直線に保つ。腰を落とさない。", "クランチ": "おへそを覗き込むように背中を丸める。首は引っ張らない。", "レッグレイズ": "仰向けで脚を伸ばし、腰を反らせず脚を上げ下げ。", "ロシアンツイスト": "上体を起こして左右にひねる。体幹で動かす。", "ハンギングレッグレイズ": "ぶら下がり、反動を使わず脚を持ち上げる。", "ケーブルクランチ": "ひざ立ちでロープを持ち、背中を丸めて引き下ろす。", "アブドミナルクランチ(マシン)": "背中を丸めて上体を倒す。反動を使わない。", "水泳(クロール)": "息継ぎは横向きで。大きくゆったり、一定ペースで。", "水泳(平泳ぎ)": "かえる足のキックとひとかきを合わせ、伸びる時間を作る。", "水泳(背泳ぎ)": "仰向けで腰を反らさず、まっすぐ伸びて交互に腕を回す。", "水泳(バタフライ)": "上級者向け。うねりを使い、無理なら他の泳法を。", "ビート板キック": "板を持ち足だけで進む。脚と心肺の良い運動。", "水中ウォーキング": "姿勢を正し大股で。関節に優しく初心者向き。", "ランニング": "会話できる程度のペースから。着地は足裏全体で。", "エアロバイク": "サドル高は脚が軽く伸びる位置。一定の負荷で漕ぐ。", "ローイングエルゴメーター": "脚→体→腕の順で引き、戻りは逆順。背中を丸めない。", "バーピー": "しゃがむ→足を伸ばす→戻る→ジャンプ。無理ない速さで。", "ジャンピングジャック+その場ジョギング": "リズムよく。心拍を上げるウォームアップにも最適。"};

// 記録・表示の方式を種目ごとに分類する。
// weight = 重量×セット×回数 / time = 時間キープ×セット / cardio = 時間(+距離)
const TIME_HOLD = new Set(["プランク", "サイドプランク", "ウォールシット(空気椅子)"]);
// 高回数が向く種目(腹筋・カーフ・自重の補助種目など)
const HIGH_REP = new Set([
  "カーフレイズ", "クランチ", "レッグレイズ", "ロシアンツイスト",
  "ハンギングレッグレイズ", "ケーブルクランチ", "アブドミナルクランチ(マシン)",
  "スーパーマン(バックエクステンション)", "ヒップリフト",
]);

function trackOf(ex) {
  if (ex.kind === "cardio") return "cardio";
  if (TIME_HOLD.has(ex.name)) return "time";
  return "weight";
}
function repStyleOf(ex) {
  if (TIME_HOLD.has(ex.name)) return "hold";
  if (HIGH_REP.has(ex.name)) return "high";
  return "normal";
}
for (const ex of EXERCISES) {
  ex.track = trackOf(ex);
  ex.repStyle = repStyleOf(ex);
  ex.tip = EXERCISE_TIPS[ex.name] ?? "";
}

// 種目名から記録方式を判定する(記録フォームの自動切り替え用)。未知の種目は weight 扱い。
const NAME_TO_EXERCISE = new Map(EXERCISES.map((e) => [e.name, e]));
export function getExerciseTrack(name) {
  return NAME_TO_EXERCISE.get(name)?.track ?? "weight";
}

export function getExerciseTip(name) {
  return NAME_TO_EXERCISE.get(name)?.tip ?? "";
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
  const ex = NAME_TO_EXERCISE.get(name);
  return ex?.equipment.includes("pool") ? "m" : "km";
}

// 記録フォームの種目リストを記録方式(筋トレ/キープ/有酸素)別に返す
export function exerciseChoices(track) {
  if (track === "cardio") {
    return [{ label: "有酸素", names: EXERCISES.filter((e) => e.track === "cardio").map((e) => e.name) }];
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

// 目的別のセット・レップ・休憩設定。sets は中級者基準で、レベルに応じて後述の resolveParams で増減する。
const GOAL_PARAMS = {
  hypertrophy: {
    compound: { sets: 4, reps: "8〜12回", rest: "90秒" },
    isolation: { sets: 3, reps: "10〜12回", rest: "60秒" },
    cardioMin: null,
    scheme: "筋肥大狙い:コンパウンド(多関節)種目は8〜12回でギリギリ挙がる重量を選び、最後まで追い込みます。補助種目はやや軽めで10回前後。",
  },
  cut: {
    compound: { sets: 3, reps: "12〜15回", rest: "45〜60秒" },
    isolation: { sets: 3, reps: "15回", rest: "30〜45秒" },
    cardioMin: "20〜30分",
    scheme: "減量狙い:やや軽い重量で回数を多めに、休憩を短くして心拍を保ち消費カロリーを高めます。仕上げに有酸素を追加。",
  },
  strength: {
    compound: { sets: 5, reps: "4〜6回", rest: "2〜3分" },
    isolation: { sets: 3, reps: "8〜10回", rest: "90秒" },
    cardioMin: "15〜20分",
    scheme: "筋力狙い:重い重量×低回数(4〜6回)。フォームを最優先し、休憩はしっかり2〜3分取って毎セット高い質を保ちます。",
  },
  health: {
    compound: { sets: 3, reps: "10〜15回", rest: "60秒" },
    isolation: { sets: 2, reps: "12〜15回", rest: "60秒" },
    cardioMin: "10〜15分(軽め)",
    scheme: "健康維持:無理のない重量で中〜高回数。関節に優しく、続けやすさを最優先します。",
  },
};

// 種目・レベルに応じて実際のセット数・回数・休憩を決める。
// レベルでセット数を調整し(初心者は控えめ・上級者は複合種目を増量)、
// キープ系・高回数系の種目は専用の回数表記にする。
function resolveParams(ex, params, levelNum) {
  const base = ex.kind === "compound" ? params.compound : params.isolation;
  let sets = base.sets;
  if (levelNum === 1) sets = Math.max(2, sets - 1);               // 初心者:1セット減らして安全に
  else if (levelNum === 3 && ex.kind === "compound") sets += 1;   // 上級者:複合種目を1セット追加

  let reps = base.reps;
  if (ex.repStyle === "hold") reps = "30〜60秒キープ";
  else if (ex.repStyle === "high") reps = "15〜20回";

  return { sets, reps, rest: base.rest };
}

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

// 記録入力のサジェスト用に全種目名を返す
export function allExerciseNames() {
  return EXERCISES.map((e) => e.name);
}

// 記録フォームの選択リスト用に、部位ごとにグループ化した種目名を返す
export function exercisesByMuscle() {
  const order = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"];
  const labels = { chest: "胸", back: "背中", legs: "脚", shoulders: "肩", arms: "腕", core: "体幹", cardio: "有酸素" };
  return order.map((m) => ({
    label: labels[m],
    names: EXERCISES.filter((e) => e.muscle === m).map((e) => e.name),
  }));
}

export const MUSCLE_LABELS = {
  chest: "胸", back: "背中", legs: "脚",
  shoulders: "肩", arms: "腕", core: "体幹", cardio: "有酸素",
};

// トレーニング記録を分析する。
// logs: [{ date: "YYYY-MM-DD", entries: [{ name, weight, sets, reps }] }]
export function analyzeLogs(logs, now = new Date()) {
  if (!logs || logs.length === 0) return null;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysAgo = (dateStr) => Math.floor((now - new Date(`${dateStr}T00:00:00`)) / DAY_MS);
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい順

  const daysSinceLast = daysAgo(sorted[0].date);
  const recentCount = sorted.filter((l) => daysAgo(l.date) <= 28).length;
  const weeklyAvg = Math.round((recentCount / 4) * 10) / 10;

  const nameToMuscle = new Map(EXERCISES.map((e) => [e.name, e.muscle]));
  const muscleLastDays = {};   // 部位 -> 最後に鍛えてからの日数
  const lastRecordByName = {}; // 種目名 -> 最新の記録
  for (const log of sorted) {
    const days = daysAgo(log.date);
    for (const entry of log.entries) {
      const muscle = nameToMuscle.get(entry.name);
      if (muscle && !(muscle in muscleLastDays)) muscleLastDays[muscle] = days;
      if (!lastRecordByName[entry.name]) lastRecordByName[entry.name] = { ...entry, date: log.date };
    }
  }

  // 記録上、14日以上鍛えていない(または一度も出てこない)筋トレ部位
  const neglectedMuscles = Object.keys(MUSCLE_LABELS).filter(
    (m) => m !== "cardio" && (muscleLastDays[m] === undefined || muscleLastDays[m] > 14)
  );

  return {
    count: logs.length,
    lastDate: sorted[0].date,
    daysSinceLast,
    weeklyAvg,
    muscleLastDays,
    lastRecordByName,
    neglectedMuscles,
    muscleLabel: (m) => MUSCLE_LABELS[m] ?? m,
  };
}

// 前回記録から「次の一歩」の目標を文章にする
function progressionNote(record) {
  const track = record.track ?? "weight";
  if (track === "time") {
    return `前回(${record.date}): ${record.seconds}秒×${record.sets}セット → +5〜10秒を目標に`;
  }
  if (track === "cardio") {
    const dist = record.distance ? `・${record.distance}${record.unit ?? "km"}` : "";
    return `前回(${record.date}): ${record.minutes}分${dist} → 時間か距離を少しずつ伸ばす`;
  }
  const weight = parseFloat(record.weight);
  if (weight > 0) {
    return `前回(${record.date}): ${weight}kg×${record.reps}回×${record.sets}セット → 重量+2.5kgか回数+1を目標に`;
  }
  return `前回(${record.date}): ${record.reps}回×${record.sets}セット → 回数+1〜2を目標に`;
}

// 指定部位から、使える器具とレベルに合う種目を優先度順に1つ選ぶ。
// 記録に登場する種目(=やり慣れている種目)はわずかに優先する。
function pickExercise(muscle, selectedSet, levelNum, used, knownNames = new Set()) {
  const score = (e) => e.priority + (knownNames.has(e.name) ? 1.5 : 0);
  const candidates = EXERCISES.filter(
    (e) => e.muscle === muscle && isAvailable(e, selectedSet) && !used.has(e.name)
  ).sort((a, b) => score(b) - score(a));
  // レベルに合うものを優先し、無ければレベル制限を緩めて選ぶ
  const fit = candidates.find((e) => e.level <= levelNum) ?? candidates[0];
  if (fit) used.add(fit.name);
  return fit ?? null;
}

function pickCardio(selectedSet, levelNum, knownNames) {
  const used = new Set();
  return pickExercise("cardio", selectedSet, levelNum, used, knownNames);
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

// メイン:プロフィール(+トレーニング記録)から1週間のメニューを生成する
// profile: { weight, height, age, gender, goal, level, frequency, equipment: string[] }
// logs:    [{ date, entries: [{ name, weight, sets, reps }] }](省略可)
// ---------- メニューへの相談(調整)機能 ----------

// 現在の種目を、同じ部位・使える器具の「次の候補種目」に差し替えた行を返す。
// タップするたびに候補を順に切り替えられる。候補が無ければ null。
export function alternativeExercise(profile, logs, day, exIndex, now = new Date()) {
  const current = day.exercises[exIndex];
  if (!current?.muscle) return null;
  const levelNum = LEVEL_NUM[profile.level] ?? 1;
  const selectedSet = expandEquipment(profile.equipment);
  const params = GOAL_PARAMS[profile.goal] ?? GOAL_PARAMS.health;
  const others = new Set(day.exercises.filter((_, i) => i !== exIndex).map((e) => e.name));

  let candidates = EXERCISES.filter(
    (e) => e.muscle === current.muscle && isAvailable(e, selectedSet) && !others.has(e.name) && e.level <= levelNum
  );
  if (candidates.length <= 1) {
    candidates = EXERCISES.filter(
      (e) => e.muscle === current.muscle && isAvailable(e, selectedSet) && !others.has(e.name)
    );
  }
  candidates.sort((a, b) => b.priority - a.priority);
  if (candidates.length <= 1) return null;

  const idx = candidates.findIndex((e) => e.name === current.name);
  const next = candidates[(idx + 1) % candidates.length];
  if (next.name === current.name) return null;

  const p = resolveParams(next, params, levelNum);
  const analysis = analyzeLogs(logs, now);
  const record = analysis?.lastRecordByName[next.name];
  return {
    name: next.name,
    muscle: next.muscle,
    track: next.track,
    tip: next.tip,
    sets: p.sets,
    reps: p.reps,
    rest: p.rest,
    note: record ? progressionNote(record) : null,
    focused: current.focused,
  };
}

// 有酸素種目を次の候補に差し替える(プールがあれば泳法の切替などに使える)
export function alternativeCardio(profile, logs, currentName, now = new Date()) {
  const levelNum = LEVEL_NUM[profile.level] ?? 1;
  const selectedSet = expandEquipment(profile.equipment);
  let candidates = EXERCISES.filter(
    (e) => e.muscle === "cardio" && isAvailable(e, selectedSet) && e.level <= levelNum
  );
  if (candidates.length <= 1) {
    candidates = EXERCISES.filter((e) => e.muscle === "cardio" && isAvailable(e, selectedSet));
  }
  candidates.sort((a, b) => b.priority - a.priority);
  if (candidates.length <= 1) return null;

  const idx = candidates.findIndex((e) => e.name === currentName);
  const next = candidates[(idx + 1) % candidates.length];
  if (next.name === currentName) return null;

  const analysis = analyzeLogs(logs, now);
  const record = analysis?.lastRecordByName[next.name];
  return { name: next.name, note: record ? progressionNote(record) : null };
}

// 全種目のセット数を増減する(2〜6セットでクランプ)
export function adjustPlanVolume(plan, delta) {
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      ex.sets = Math.max(2, Math.min(6, ex.sets + delta));
    }
  }
}

// 各日を最大4種目に短縮する(強化部位・コンパウンド優先の並び順を保ったまま先頭から残す)
export function shortenPlan(plan) {
  for (const day of plan.days) {
    day.exercises = day.exercises.slice(0, 4);
  }
  plan.shortened = true;
}

// その日の対象部位に応じたウォームアップ(動的・5〜10分)
function buildWarmup(muscles) {
  const items = ["軽い有酸素 5分(その場足踏み・バイクなど)で体温を上げる"];
  const map = {
    chest: "腕回し・肩のスイング 各10回",
    back: "肩甲骨の寄せ・キャット&カウ 10回",
    legs: "自重スクワット 10回・足首回し",
    shoulders: "肩回し前後 各10回・チューブ肩ほぐし",
    arms: "手首回し・肘の曲げ伸ばし 各10回",
    core: "体幹ひねり・腰回し 各10回",
  };
  for (const m of muscles) if (map[m]) items.push(map[m]);
  items.push("本番の重量より軽い重さで1〜2セット練習(メイン種目)");
  return items;
}

// クールダウン(静的ストレッチ・各20〜30秒)
function buildCooldown(muscles) {
  const map = {
    chest: "大胸筋ストレッチ(壁に手をついて胸を開く)",
    back: "広背筋ストレッチ(両手を前に伸ばし背中を丸める)",
    legs: "もも前・もも裏・ふくらはぎのストレッチ",
    shoulders: "三角筋ストレッチ(腕を体の前で抱える)",
    arms: "上腕三頭筋ストレッチ(肘を頭の後ろへ)",
    core: "腹筋ストレッチ(うつ伏せで上体を反らす)",
  };
  const items = muscles.map((m) => map[m]).filter(Boolean);
  items.push("深呼吸を数回。水分補給を忘れずに");
  return items;
}

// 器具タグを実際に使える集合へ展開(「マシン一式」は個別マシンすべてに展開)
function expandEquipment(keys) {
  const set = new Set(keys);
  if (set.has("machine")) {
    for (const key of MACHINE_KEYS) set.add(key);
  }
  return set;
}

export function generatePlan(profile, logs = [], now = new Date()) {
  const levelNum = LEVEL_NUM[profile.level] ?? 1;
  const selectedSet = expandEquipment(profile.equipment);
  const bmi = calcBmi(profile.weight, profile.height);
  const split = buildSplit(profile.frequency);
  const params = GOAL_PARAMS[profile.goal] ?? GOAL_PARAMS.health;

  const analysis = analyzeLogs(logs, now);
  const knownNames = new Set(Object.keys(analysis?.lastRecordByName ?? {}));
  const cardio = params.cardioMin ? pickCardio(selectedSet, levelNum, knownNames) : null;
  // 特に鍛えたい部位(有酸素は対象外)
  const focus = new Set((profile.focus ?? []).filter((m) => m !== "cardio"));
  const isFullBody = profile.frequency <= 2;

  const days = split.days.map((day) => {
    // 並べ替えの優先度: 強化部位 > しばらく空いている部位 > 通常順。
    // 強化部位・空き部位は疲れていない前半に配置する。
    let muscles = day.muscles;
    const stale = new Set(
      (analysis?.neglectedMuscles ?? []).filter((m) => m in (analysis?.muscleLastDays ?? {}))
    );
    if (focus.size > 0 || stale.size > 0) {
      const rank = (m) => (focus.has(m) ? 2 : 0) + (stale.has(m) ? 1 : 0);
      muscles = [...muscles].sort((a, b) => rank(b) - rank(a));
    }

    const used = new Set();
    const exercises = [];
    const pushExercise = (muscle) => {
      const ex = pickExercise(muscle, selectedSet, levelNum, used, knownNames);
      if (!ex) return;
      const p = resolveParams(ex, params, levelNum);
      const record = analysis?.lastRecordByName[ex.name];
      exercises.push({
        name: ex.name,
        muscle: ex.muscle,
        track: ex.track,
        tip: ex.tip,
        sets: p.sets,
        reps: p.reps,
        rest: p.rest,
        note: record ? progressionNote(record) : null,
        focused: focus.has(muscle),
      });
    };
    for (const muscle of muscles) pushExercise(muscle);
    // 強化部位はその日に1種目追加する(全身法の日は対象部位が
    // メニューに無くても追加し、確実に週内で鍛えられるようにする)
    for (const m of focus) {
      if ((day.muscles.includes(m) || isFullBody) && exercises.length < 8) {
        pushExercise(m);
      }
    }
    const cardioRecord = cardio ? analysis?.lastRecordByName[cardio.name] : null;
    // その日に鍛える部位に応じたウォームアップ/クールダウン
    const dayMuscles = [...new Set(exercises.map((e) => e.muscle).filter((m) => m && m !== "cardio"))];
    const warmup = buildWarmup(dayMuscles);
    const cooldown = buildCooldown(dayMuscles);
    return {
      title: day.title,
      warmup,
      cooldown,
      exercises,
      cardio: cardio
        ? {
            name: cardio.name,
            duration: params.cardioMin,
            note: cardioRecord ? progressionNote(cardioRecord) : null,
          }
        : null,
    };
  });

  const advice = buildAdvice(profile, bmi);
  let historySummary = null;
  if (analysis) {
    historySummary = [
      `トレーニング記録 ${analysis.count}件を反映しました`,
      `前回のトレーニング: ${analysis.lastDate}(${analysis.daysSinceLast}日前)`,
      `直近4週間の頻度: 週あたり約${analysis.weeklyAvg}回`,
    ];
    const neglectedTrained = analysis.neglectedMuscles.filter((m) => m in analysis.muscleLastDays);
    if (neglectedTrained.length > 0) {
      historySummary.push(
        `しばらく鍛えていない部位: ${neglectedTrained.map(analysis.muscleLabel).join("・")}(各日の前半に配置)`
      );
    }
    if (analysis.daysSinceLast >= 21) {
      advice.tips.unshift(
        "3週間以上のブランクがあります。重量は以前の70〜80%程度から再開し、1〜2週間かけて戻しましょう。"
      );
    }
  }

  return {
    bmi,
    splitName: split.name,
    repScheme: params.scheme,
    focusLabels: [...focus].map((m) => MUSCLE_LABELS[m] ?? m),
    days,
    advice,
    historySummary,
  };
}
