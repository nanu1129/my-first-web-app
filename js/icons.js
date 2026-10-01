// 器具・施設の線画アイコン(SVG)。
// stroke は currentColor を使い、CSS の color で着色する。
const svg = (inner) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const EQUIPMENT_SVG = {
  // バーベル:シャフト+左右のプレート
  barbell: svg(
    `<line x1="4" y1="24" x2="44" y2="24"/>` +
    `<rect x="9" y="14" width="5" height="20" rx="1.5"/>` +
    `<rect x="15" y="10" width="5" height="28" rx="1.5"/>` +
    `<rect x="28" y="10" width="5" height="28" rx="1.5"/>` +
    `<rect x="34" y="14" width="5" height="20" rx="1.5"/>`
  ),
  // ダンベル
  dumbbell: svg(
    `<line x1="15" y1="24" x2="33" y2="24"/>` +
    `<rect x="8" y="14" width="7" height="20" rx="2"/>` +
    `<rect x="33" y="14" width="7" height="20" rx="2"/>` +
    `<line x1="4" y1="19" x2="4" y2="29"/>` +
    `<line x1="44" y1="19" x2="44" y2="29"/>`
  ),
  // ケトルベル:丸い本体+ハンドル
  kettlebell: svg(
    `<circle cx="24" cy="29" r="11"/>` +
    `<path d="M16 21 C13 10 35 10 32 21"/>`
  ),
  // マシン一式:フレーム+ウエイトスタック
  machine: svg(
    `<path d="M8 42 V8 H30"/>` +
    `<rect x="27" y="20" width="14" height="22"/>` +
    `<line x1="27" y1="27" x2="41" y2="27"/>` +
    `<line x1="27" y1="34" x2="41" y2="34"/>` +
    `<line x1="34" y1="8" x2="34" y2="20"/>`
  ),
  // チェストプレス:シート+前方への押し手
  mc_chest_press: svg(
    `<line x1="12" y1="12" x2="12" y2="36"/>` +
    `<line x1="12" y1="36" x2="22" y2="36"/>` +
    `<line x1="16" y1="36" x2="16" y2="43"/>` +
    `<line x1="14" y1="18" x2="36" y2="18"/>` +
    `<line x1="14" y1="26" x2="36" y2="26"/>` +
    `<line x1="36" y1="14" x2="36" y2="30"/>`
  ),
  // ペックフライ:左右から閉じるアーム
  mc_pec_fly: svg(
    `<line x1="24" y1="14" x2="24" y2="42"/>` +
    `<line x1="17" y1="42" x2="31" y2="42"/>` +
    `<path d="M24 16 C12 16 7 24 10 33"/>` +
    `<path d="M24 16 C36 16 41 24 38 33"/>` +
    `<circle cx="10" cy="36" r="2.6"/>` +
    `<circle cx="38" cy="36" r="2.6"/>`
  ),
  // ラットプルダウン:頭上のワイドバー+シート
  mc_lat_pulldown: svg(
    `<circle cx="24" cy="7" r="2.4"/>` +
    `<line x1="24" y1="9" x2="24" y2="15"/>` +
    `<path d="M6 12 L17 16 H31 L42 12"/>` +
    `<line x1="17" y1="29" x2="31" y2="29"/>` +
    `<line x1="15" y1="35" x2="33" y2="35"/>` +
    `<line x1="20" y1="35" x2="20" y2="43"/>` +
    `<line x1="28" y1="35" x2="28" y2="43"/>`
  ),
  // シーテッドロー:座って水平に引く
  mc_seated_row: svg(
    `<line x1="6" y1="40" x2="42" y2="40"/>` +
    `<line x1="11" y1="24" x2="11" y2="36"/>` +
    `<line x1="11" y1="30" x2="20" y2="30"/>` +
    `<line x1="20" y1="25" x2="20" y2="35"/>` +
    `<rect x="27" y="31" width="10" height="5" rx="1.5"/>` +
    `<line x1="32" y1="36" x2="32" y2="40"/>`
  ),
  // ショルダープレス:シート+頭上への押し手
  mc_shoulder_press: svg(
    `<line x1="24" y1="22" x2="24" y2="38"/>` +
    `<line x1="17" y1="38" x2="31" y2="38"/>` +
    `<line x1="19" y1="38" x2="19" y2="44"/>` +
    `<line x1="29" y1="38" x2="29" y2="44"/>` +
    `<path d="M13 22 V10 H20"/>` +
    `<path d="M35 22 V10 H28"/>`
  ),
  // レッグプレス:斜めのフットプレート+リクライニングシート
  mc_leg_press: svg(
    `<line x1="5" y1="41" x2="43" y2="41"/>` +
    `<path d="M7 36 L18 29 L27 33"/>` +
    `<line x1="36" y1="9" x2="42" y2="30"/>` +
    `<line x1="20" y1="29" x2="36" y2="16"/>`
  ),
  // レッグエクステンション:座って脚を前に上げる
  mc_leg_extension: svg(
    `<line x1="12" y1="12" x2="14" y2="24"/>` +
    `<line x1="14" y1="24" x2="28" y2="24"/>` +
    `<line x1="26" y1="24" x2="26" y2="43"/>` +
    `<line x1="20" y1="43" x2="32" y2="43"/>` +
    `<line x1="27" y1="31" x2="42" y2="25"/>` +
    `<circle cx="43" cy="24" r="2.6"/>`
  ),
  // レッグカール:脚を後ろ(下)に曲げる
  mc_leg_curl: svg(
    `<line x1="12" y1="12" x2="14" y2="24"/>` +
    `<line x1="14" y1="24" x2="28" y2="24"/>` +
    `<line x1="26" y1="24" x2="26" y2="43"/>` +
    `<line x1="20" y1="43" x2="32" y2="43"/>` +
    `<line x1="27" y1="31" x2="38" y2="41"/>` +
    `<circle cx="39" cy="42" r="2.6"/>`
  ),
  // スミスマシン:固定レール+バー
  mc_smith: svg(
    `<line x1="11" y1="44" x2="11" y2="6"/>` +
    `<line x1="37" y1="44" x2="37" y2="6"/>` +
    `<line x1="11" y1="6" x2="37" y2="6"/>` +
    `<line x1="6" y1="26" x2="42" y2="26"/>` +
    `<line x1="15" y1="26" x2="15" y2="21"/>` +
    `<line x1="33" y1="26" x2="33" y2="21"/>`
  ),
  // アブドミナルクランチ:上体を丸める
  mc_abdominal: svg(
    `<line x1="14" y1="44" x2="14" y2="32"/>` +
    `<line x1="10" y1="32" x2="26" y2="32"/>` +
    `<line x1="24" y1="32" x2="26" y2="16"/>` +
    `<path d="M26 14 C36 14 38 22 33 28"/>` +
    `<line x1="30" y1="24" x2="35" y2="27"/>`
  ),
  // ケーブルマシン:支柱+プーリー+ハンドル
  cable: svg(
    `<line x1="13" y1="44" x2="13" y2="6"/>` +
    `<circle cx="13" cy="9" r="2.8"/>` +
    `<line x1="15" y1="11" x2="35" y2="31"/>` +
    `<line x1="31" y1="35" x2="39" y2="27"/>`
  ),
  // 懸垂バー
  pullup_bar: svg(
    `<line x1="6" y1="12" x2="42" y2="12"/>` +
    `<line x1="9" y1="12" x2="9" y2="30"/>` +
    `<line x1="39" y1="12" x2="39" y2="30"/>` +
    `<line x1="19" y1="12" x2="19" y2="19"/>` +
    `<line x1="29" y1="12" x2="29" y2="19"/>`
  ),
  // トレーニングベンチ
  bench: svg(
    `<rect x="6" y="20" width="36" height="7" rx="2.5"/>` +
    `<line x1="13" y1="27" x2="13" y2="37"/>` +
    `<line x1="35" y1="27" x2="35" y2="37"/>` +
    `<line x1="9" y1="37" x2="17" y2="37"/>` +
    `<line x1="31" y1="37" x2="39" y2="37"/>`
  ),
  // レジスタンスバンド:輪ゴム状のループ
  band: svg(
    `<ellipse cx="24" cy="25" rx="16" ry="10"/>` +
    `<path d="M10 22 C18 32 30 32 38 22"/>`
  ),
  // プール:波+はしご
  pool: svg(
    `<path d="M5 22 q4 -5 8 0 t8 0"/>` +
    `<path d="M5 32 q4 -5 8 0 t8 0 t8 0"/>` +
    `<line x1="33" y1="10" x2="33" y2="28"/>` +
    `<line x1="41" y1="10" x2="41" y2="28"/>` +
    `<line x1="33" y1="15" x2="41" y2="15"/>` +
    `<line x1="33" y1="22" x2="41" y2="22"/>`
  ),
  // ランニングマシン:ベルト+コンソール
  treadmill: svg(
    `<rect x="5" y="34" width="29" height="6" rx="3"/>` +
    `<line x1="32" y1="34" x2="39" y2="11"/>` +
    `<line x1="36" y1="11" x2="44" y2="13"/>`
  ),
  // エアロバイク
  bike: svg(
    `<circle cx="13" cy="34" r="8"/>` +
    `<circle cx="36" cy="34" r="8"/>` +
    `<path d="M13 34 L21 19 H29 L36 34"/>` +
    `<path d="M21 19 L25 34 H13"/>` +
    `<line x1="29" y1="19" x2="32" y2="13"/>` +
    `<line x1="29" y1="13" x2="35" y2="13"/>` +
    `<line x1="18" y1="14" x2="24" y2="14"/>` +
    `<line x1="21" y1="14" x2="21" y2="19"/>`
  ),
  // ローイングエルゴメーター:レール+フライホイール+シート
  mc_rowing: svg(
    `<line x1="5" y1="37" x2="43" y2="37"/>` +
    `<circle cx="12" cy="27" r="7"/>` +
    `<rect x="27" y="31" width="8" height="5" rx="1.5"/>` +
    `<line x1="18" y1="25" x2="33" y2="22"/>` +
    `<line x1="33" y1="19" x2="33" y2="26"/>`
  ),
};

// ---------- UI の線画アイコン ----------
// 器具アイコンと同じ作法(線のみ・currentColor・丸い端)で、24 グリッド・線幅 2。
// ボタンの意味は aria-label や隣の文字で伝えるので、アイコン自体は読み上げない(aria-hidden)。
const dot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="1.1" fill="currentColor" stroke="none"/>`;

export const UI_ICONS = {
  // タブ
  dumbbell: `<path d="M6.5 7.5v9M3.5 10v4M17.5 7.5v9M20.5 10v4M6.5 12h11"/>`,
  clipboard: `<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 3h6v3.5H9zM9 11.5h6M9 15.5h4"/>`,
  chart: `<path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/>`,
  sliders: `<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>`,
  // 種目の操作
  swap: `<path d="M4.5 8.5h14M15 5l3.5 3.5L15 12M19.5 15.5h-14M9 12l-3.5 3.5L9 19"/>`,
  info: `<path d="M12 10.5v7"/>${dot(12, 6.8)}`,
  infoCircle: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/>${dot(12, 8)}`,
  timer: `<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M12 2.5V6M18.2 6.8l1.6-1.6"/>`,
  play: `<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  chevronDown: `<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>`,
  chevronRight: `<path d="M9.5 6l6 6-6 6"/>`,
  // メニューの構成要素
  flame: `<path d="M12 21c-3.6 0-6-2.4-6-5.8 0-2.9 1.9-4.6 3.2-6.4.4 1.6 1.1 2.6 2.1 3.1.2-2.9 1.4-5.2 3.4-6.9-.1 2.6.9 4.4 2.3 6.1 1 1.3 1.6 2.6 1.6 4.1 0 3.4-2.4 5.8-6.6 5.8z"/>`,
  wind: `<path d="M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h6"/>`,
  pulse: `<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>`,
  wave: `<path d="M3 9.5c1.5 0 2-1.5 4.5-1.5S10 9.5 12 9.5s2-1.5 4.5-1.5S19.5 9.5 21 9.5M3 15c1.5 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19.5 15 21 15"/>`,
  trend: `<path d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5M15 7.5h5.5V13"/>`,
  bulb: `<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>`,
  leaf: `<path d="M5 19c0-8.5 5.5-13.5 14-14-.5 8.5-5.5 14-14 14z"/><path d="M5 19l6.5-6.5"/>`,
  // 相談(調整)
  bolt: `<path d="M13.5 3L5.5 13.5h6L10.5 21l8-10.5h-6z"/>`,
  moon: `<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  undo: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5V9H9"/>`,
  // 設定・その他
  refresh: `<path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12a7.5 7.5 0 0 1 13.2-4.9"/><path d="M18 3.5v4h-4M6 20.5v-4h4"/>`,
  download: `<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>`,
  upload: `<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14"/>`,
  edit: `<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M13 7l4 4"/>`,
  trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.8 3.9M16 6h2.5a2.5 2.5 0 0 1-2.8 3.9M12 13v3.5M9 20h6M10 16.5h4"/>`,
  alert: `<path d="M12 4l9 16H3z"/><path d="M12 10v4.5"/>${dot(12, 17.3)}`,
  shield: `<path d="M12 3.5l7 2.5v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>`,
  // 記録・進捗
  minus: `<path d="M5 12h14"/>`,
  trash: `<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>`,
  repeat: `<path d="M4.5 11.5V10a3.5 3.5 0 0 1 3.5-3.5h11M15.5 3l3.5 3.5-3.5 3.5M19.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H5M8.5 21L5 17.5 8.5 14"/>`,
  calendar: `<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`,
  scale: `<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M7.5 11a5.5 5.5 0 0 1 9 0M12 11.5l1.8-2.8"/>`,
  body: `<circle cx="12" cy="5" r="2"/><path d="M5.5 9.5L12 11l6.5-1.5M12 11v4.5l-3 5M12 15.5l3 5"/>`,
  sprout: `<path d="M12 20.5V11.5"/><path d="M12 13.5C12 9 9.2 6.5 4.5 6.5c0 4.5 2.8 7 7.5 7zM12 11.5c0-3.8 2.5-6.5 7.5-6.5 0 3.8-2.5 6.5-7.5 6.5z"/>`,
  medal: `<circle cx="12" cy="15" r="5.5"/><path d="M8.7 10.6L6 3.5h4l2 5 2-5h4l-2.7 7.1"/>`,
  crown: `<path d="M4 8.5l4 3.5 4-6.5 4 6.5 4-3.5-1.8 10H5.8z"/>`,
  star: `<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>`,
};

// アイコンの SVG 文字列。cls で大きさなどを CSS から調整する
export function uiIcon(name, cls = "") {
  return `<svg class="ico${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `${UI_ICONS[name] ?? ""}</svg>`;
}
