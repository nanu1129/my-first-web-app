// 設定画面: プロフィール(体格・目的・頻度・強化部位・使える器具)の確認と編集、
// データのバックアップ(書き出し・読み込み・取り消し)、アプリの情報(バージョン・更新の確認)と注意事項。
// 入力はすべて選択式(セレクト・ラジオ・チップ・チェック)。編集中の値は draft に持ち、保存するまで反映しない。
import { EQUIPMENT_GROUPS, PRESETS, MACHINE_KEYS, MUSCLE_LABELS, GOALS, LEVELS } from "../planner.js?v=14";
import { EQUIPMENT_SVG, uiIcon } from "../icons.js?v=14";
import { escapeHtml, numRange, formatJaDate, localDateStr } from "../util.js?v=14";

const DEFAULT_PROFILE = {
  weight: 65, height: 170, age: 30, gender: "その他・回答しない",
  goal: "hypertrophy", level: "beginner", frequency: 3, focus: [], equipment: [],
};
const GENDER_OPTIONS = [
  ["男性", "男性"],
  ["女性", "女性"],
  ["その他・回答しない", "その他", "回答しない"],
];
const GOAL_OPTIONS = [
  ["hypertrophy", "筋肥大", "筋肉を大きく"],
  ["cut", "減量・引き締め", "脂肪を落とす"],
  ["strength", "筋力・体力向上", "強く動ける体に"],
  ["health", "健康維持", "無理なく続ける"],
];
const LEVEL_OPTIONS = [
  ["beginner", "初心者", "〜1年"],
  ["intermediate", "中級者", "1〜3年"],
  ["advanced", "上級者", "3年以上"],
];
const WEIGHTS = numRange(30, 150);
const HEIGHTS = numRange(130, 210);
const AGES = numRange(10, 90);
const FREQUENCIES = numRange(1, 7);
const FOCUS_KEYS = Object.keys(MUSCLE_LABELS).filter((m) => m !== "cardio");

// 器具の表示名(短い名前+補足)。グループ名が「ジムマシン」なので「〜マシン」は省く(I12)。
// 「|」は改行してよい位置(狭い画面で語の途中や1文字だけの行で折り返さないように)
const EQUIP_LABEL = {
  barbell: ["バーベル", "ラック・|プレート"],
  dumbbell: ["ダンベル"],
  kettlebell: ["ケトルベル"],
  machine: ["すべての|マシン", "下の個別マシンを|まとめて選択"],
  mc_chest_press: ["チェスト|プレス"],
  mc_pec_fly: ["ペック|フライ", "チェスト|フライ"],
  mc_lat_pulldown: ["ラット|プルダウン"],
  mc_seated_row: ["シーテッド|ロー", "ローイング"],
  mc_shoulder_press: ["ショルダー|プレス"],
  mc_leg_press: ["レッグ|プレス"],
  mc_leg_extension: ["レッグ|エクステンション"],
  mc_leg_curl: ["レッグ|カール"],
  mc_smith: ["スミス|マシン"],
  mc_abdominal: ["アブドミナル|クランチ"],
  cable: ["ケーブル|マシン"],
  pullup_bar: ["懸垂バー"],
  bench: ["トレーニング|ベンチ"],
  band: ["レジスタンス|バンド"],
  pool: ["プール", "クロール・|平泳ぎなど"],
  treadmill: ["ランニング|マシン", "屋外ランニング|も可"],
  bike: ["エアロ|バイク"],
  mc_rowing: ["ローイング|エルゴ"],
};
const phraseHtml = (t) => escapeHtml(t).replaceAll("|", "<wbr>");

const UPDATE_MSG = {
  installing: ["新しいバージョンを取得しています。準備ができたらお知らせします。", "info"],
  latest: ["最新のバージョンです。", "ok"],
  unsupported: ["この環境では更新を確認できません。", "info"],
  error: ["更新を確認できませんでした(オフラインの可能性があります)。", "error"],
};

let ctx = null;
let body = null;
let editing = false;
let draft = null;
const openGroups = new Set();

// ---------- 器具・プリセット ----------

const equipCount = (keys) => keys.filter((k) => k !== "machine").length;

function presetOf(equipment) {
  const set = new Set(equipment);
  for (const [id, p] of Object.entries(PRESETS)) {
    if (p.keys.length === set.size && p.keys.every((k) => set.has(k))) return id;
  }
  return null;
}

function equipmentText(equipment) {
  const preset = presetOf(equipment);
  if (preset) return PRESETS[preset].label;
  return `カスタム(${equipCount(equipment)}点)`;
}

// ---------- 描画 ----------

function withValue(values, v) {
  if (!Number.isFinite(v) || values.includes(v)) return values;
  return [...values, v].sort((a, b) => a - b);
}

function selectField(name, label, values, value, fmt) {
  const opts = withValue(values, value).map((v) => `<option value="${escapeHtml(v)}"${v === value ? " selected" : ""}>${escapeHtml(fmt(v))}</option>`).join("");
  return `<label class="field"><span class="field-label">${label}</span>` +
    `<select name="${name}" data-key="pf-${name}">${opts}</select></label>`;
}

function radios(name, options, value) {
  return options.map(([v, main, subText]) =>
    `<label class="seg-opt"><input type="radio" name="pf-${name}" value="${v}"${v === value ? " checked" : ""}>` +
    `<span class="seg-main">${main}</span>${subText ? `<span class="seg-sub">${subText}</span>` : ""}</label>`).join("");
}

function welcomeHtml() {
  return `<section class="welcome" aria-labelledby="welcome-title">` +
    `<p class="eyebrow"><span class="eyebrow-en" lang="en">WELCOME</span></p>` +
    `<h2 id="welcome-title" class="welcome-title">あなた専用の1週間メニューを作りましょう</h2>` +
    `<ol class="steps"><li><span class="step-n" aria-hidden="true">1</span>体格と目的を選ぶ</li>` +
    `<li><span class="step-n" aria-hidden="true">2</span>使える器具を選ぶ</li>` +
    `<li><span class="step-n" aria-hidden="true">3</span>「保存してメニュー作成」を押す</li></ol>` +
    `<p class="welcome-note">すべてタップで選べます。あとからいつでも変更できます。</p></section>`;
}

function summaryHtml(p) {
  const focus = p.focus.length ? `★ ${p.focus.map((m) => MUSCLE_LABELS[m]).join("・")}` : "なし";
  const equip = p.equipment.length ? equipmentText(p.equipment) : "自重のみ";
  const rows = [
    ["体格", `${p.weight}kg · ${p.height}cm · ${p.age}歳 · ${p.gender}`],
    ["目的", `${GOALS[p.goal]} · ${LEVELS[p.level]} · 週${p.frequency}回`],
    ["強化", focus],
    ["器具", equip],
  ];
  return `<div class="card-head"><h2 id="profile-title" class="card-title">プロフィール</h2>` +
    `<button type="button" class="btn btn-ghost btn-sm" data-act="edit" data-key="pf-edit">${uiIcon("edit")}編集</button></div>` +
    `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` +
    `<button type="button" class="btn btn-secondary btn-block" data-act="regen" data-key="pf-regen">${uiIcon("refresh")}メニューを作り直す</button>`;
}

function equipGroupsHtml() {
  const checked = new Set(draft.equipment);
  return EQUIPMENT_GROUPS.map((g, gi) => {
    const items = g.keys.map((key) => {
      const [main, subText] = EQUIP_LABEL[key] ?? [key];
      return `<label class="equip-item"><input type="checkbox" class="equip-input" name="equipment" value="${key}"` +
        `${checked.has(key) ? " checked" : ""} data-key="eq-${key}">` +
        `<span class="equip-icon" aria-hidden="true">${EQUIPMENT_SVG[key] ?? ""}</span>` +
        `<span class="equip-text"><span class="equip-main">${phraseHtml(main)}</span>` +
        `${subText ? `<small class="equip-sub">${phraseHtml(subText)}</small>` : ""}</span>` +
        `<span class="equip-check" aria-hidden="true">${uiIcon("check")}</span></label>`;
    }).join("");
    return `<details class="fold equip-group" data-group="${gi}"${openGroups.has(gi) ? " open" : ""}>` +
      `<summary><span class="fold-label">${escapeHtml(g.label)}</span><span class="fold-count eg-count"></span>` +
      `${uiIcon("chevronDown", "fold-chev")}</summary><div class="equip-list">${items}</div></details>`;
  }).join("");
}

function editorHtml(profile) {
  const d = draft;
  const chips = FOCUS_KEYS.map((m) =>
    `<button type="button" class="chip" data-act="focus" data-muscle="${m}" data-key="focus-${m}" ` +
    `aria-pressed="${d.focus.includes(m)}">${MUSCLE_LABELS[m]}</button>`).join("");
  const presets = Object.entries(PRESETS).map(([id, p]) =>
    `<button type="button" class="chip preset-btn" data-act="preset" data-preset="${id}" data-key="preset-${id}" ` +
    `aria-pressed="false">${escapeHtml(p.label)}</button>`).join("");
  const freq = FREQUENCIES.map((n) => [String(n), `${n}`, "回/週"]);
  return `<div class="card-head"><h2 id="profile-title" class="card-title">プロフィール</h2></div>` +
    `<form class="profile-form" novalidate>` +
    `<fieldset class="field-group"><legend class="field-legend">体格</legend><div class="field-grid">` +
    selectField("weight", "体重", WEIGHTS, d.weight, (v) => `${v}kg`) +
    selectField("height", "身長", HEIGHTS, d.height, (v) => `${v}cm`) +
    selectField("age", "年齢", AGES, d.age, (v) => `${v}歳`) +
    `</div><div class="seg seg-3" role="radiogroup" aria-label="性別">${radios("gender", GENDER_OPTIONS, d.gender)}</div></fieldset>` +
    `<fieldset class="field-group"><legend class="field-legend">目的</legend>` +
    `<div class="seg seg-2 seg-goal">${radios("goal", GOAL_OPTIONS, d.goal)}</div></fieldset>` +
    `<fieldset class="field-group"><legend class="field-legend">経験レベル</legend>` +
    `<div class="seg seg-3">${radios("level", LEVEL_OPTIONS, d.level)}</div></fieldset>` +
    `<fieldset class="field-group"><legend class="field-legend">週のトレーニング回数</legend>` +
    `<div class="seg seg-freq">${radios("frequency", freq, String(d.frequency))}</div></fieldset>` +
    `<div class="field-group" role="group" aria-labelledby="pf-focus-label">` +
    `<p id="pf-focus-label" class="field-legend">特に鍛えたい部位<span class="field-opt">任意・複数選択可</span></p>` +
    `<div class="chips">${chips}</div></div>` +
    `<div class="field-group" role="group" aria-labelledby="pf-equip-label">` +
    `<p id="pf-equip-label" class="field-legend">使える器具・施設<span class="field-opt">未選択なら自重のみ</span></p>` +
    `<div class="chips preset-row">${presets}<span class="chip-static preset-custom" hidden>カスタム</span></div>` +
    `<div class="equip-groups">${equipGroupsHtml()}</div></div>` +
    `<div class="form-actions">` +
    (profile ? `<button type="button" class="btn btn-secondary" data-act="cancel" data-key="pf-cancel">キャンセル</button>` : "") +
    `<button type="submit" class="btn btn-primary btn-lg" data-key="pf-save">${uiIcon("check")}保存してメニュー作成</button>` +
    `</div></form>`;
}

function backupHtml() {
  const st = ctx.storage.backupStatus();
  const meta = ctx.storage.getMeta();
  let status;
  if (st.lastBackupAt) {
    const when = st.daysSince === 0 ? "今日" : `${st.daysSince}日前`;
    status = `最終バックアップ: ${when}(${formatJaDate(localDateStr(new Date(st.lastBackupAt)))})` +
      (st.newLogs > 0 ? ` · その後の記録 ${st.newLogs}件` : "");
  } else {
    status = st.logCount > 0 ? `まだバックアップしていません(記録 ${st.logCount}件)` : "まだ記録はありません";
  }
  const undoAt = meta.lastImportUndo?.at ? new Date(meta.lastImportUndo.at) : null;
  const undo = undoAt && !Number.isNaN(undoAt.getTime())
    ? `<button type="button" class="link-btn" data-act="undo-import" data-key="undo-import">` +
      `直前の読み込み(${escapeHtml(formatJaDate(localDateStr(undoAt)))})を取り消す</button>`
    : "";
  const iosNote = ctx.env.ios
    ? `<p class="card-note">${ctx.env.standalone
      ? "Safari で付けた記録がある場合は、Safari で「書き出す」→ このアプリで「読み込む」で移せます。"
      : "iPhone では、Safari とホーム画面に追加したアプリで記録が別々に保存されます。ホーム画面に追加したら、ここで「書き出す」→ アプリ側で「読み込む」で移せます。"}</p>`
    : "";
  return `<div class="card-head"><h2 id="backup-title" class="card-title">データのバックアップ</h2></div>` +
    `<p class="backup-status${st.shouldNudge ? " is-nudge" : ""}">${uiIcon(st.shouldNudge ? "alert" : "shield", "bs-ico")}` +
    `<span>${escapeHtml(status)}</span></p>` +
    `<div class="btn-row">` +
    `<button type="button" id="export-btn" class="btn btn-secondary" data-act="export" data-key="export">${uiIcon("download")}書き出す</button>` +
    `<button type="button" id="import-btn" class="btn btn-secondary" data-act="import" data-key="import">${uiIcon("upload")}読み込む</button>` +
    `</div>` +
    `<input type="file" class="import-file" accept="application/json,.json" hidden>` +
    undo +
    `<p class="card-note">記録はこの端末の、このアプリ(ブラウザ)の中にだけ保存されています。機種変更やデータの削除に備えて、ときどき書き出しておきましょう。</p>` +
    iosNote;
}

function appHtml() {
  return `<div class="card-head"><h2 id="app-title" class="card-title">アプリ</h2></div>` +
    `<dl class="kv"><div><dt>バージョン</dt><dd>v${escapeHtml(ctx.env.version)}</dd></div>` +
    `<div><dt>表示</dt><dd>${ctx.env.standalone ? "ホーム画面のアプリ" : "ブラウザ"}</dd></div></dl>` +
    `<div class="btn-row">` +
    `<button type="button" class="btn btn-secondary" data-act="check-update" data-key="check-update">${uiIcon("refresh")}更新を確認</button>` +
    (ctx.env.standalone ? `<button type="button" class="btn btn-secondary" data-act="reload" data-key="reload">再読み込み</button>` : "") +
    `</div>`;
}

function aboutHtml() {
  return `<div class="card-head"><h2 id="about-title" class="card-title">このアプリについて</h2></div>` +
    `<p class="card-text">メニューは端末の中の内蔵アルゴリズムで作成しています。入力した内容や記録が外部に送信されることはありません。</p>` +
    `<p class="card-text disclaimer">本アプリの提案は一般的なフィットネス情報であり、医療アドバイスではありません。持病のある方や、痛み・体調に不安がある方は医師に相談してください。</p>` +
    `<p class="fine-print">数字の書体: Bebas Neue(SIL Open Font License 1.1)</p>`;
}

function render() {
  const profile = ctx.storage.loadProfile();
  if (!profile) editing = true;
  if (editing && !draft) draft = structuredClone(profile ?? DEFAULT_PROFILE);
  const active = document.activeElement;
  const key = active && body.contains(active) ? active.dataset.key : null;
  body.innerHTML =
    (profile ? "" : welcomeHtml()) +
    `<section class="card profile-card" aria-labelledby="profile-title">${editing ? editorHtml(profile) : summaryHtml(profile)}</section>` +
    `<section id="backup" class="card" aria-labelledby="backup-title">${backupHtml()}</section>` +
    `<section class="card" aria-labelledby="app-title">${appHtml()}</section>` +
    `<section class="card" aria-labelledby="about-title">${aboutHtml()}</section>`;
  if (editing) syncEquipment();
  if (key) body.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
}

function renderBackup() {
  const box = body.querySelector("#backup");
  if (!box) return;
  const active = document.activeElement;
  const key = active && box.contains(active) ? active.dataset.key : null;
  box.innerHTML = backupHtml();
  if (key) box.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
}

// 器具の件数表示・プリセットの選択状態を、チェックの状態に合わせる
function syncEquipment() {
  const inputs = [...body.querySelectorAll(".equip-input")];
  const checked = inputs.filter((i) => i.checked).map((i) => i.value);
  draft.equipment = checked;
  for (const det of body.querySelectorAll(".equip-group")) {
    const keys = EQUIPMENT_GROUPS[Number(det.dataset.group)].keys.filter((k) => k !== "machine");
    const n = keys.filter((k) => checked.includes(k)).length;
    const count = det.querySelector(".eg-count");
    count.textContent = `${n}/${keys.length}`;
    count.classList.toggle("is-some", n > 0);
  }
  const active = presetOf(checked);
  for (const b of body.querySelectorAll(".preset-btn")) b.setAttribute("aria-pressed", String(b.dataset.preset === active));
  const custom = body.querySelector(".preset-custom");
  if (custom) custom.hidden = active != null;
}

// ---------- 操作 ----------

function setEquipment(keys) {
  const set = new Set(keys);
  for (const input of body.querySelectorAll(".equip-input")) input.checked = set.has(input.value);
  syncEquipment();
}

function onEquipmentChange(input) {
  const machines = [...body.querySelectorAll(".equip-input")].filter((i) => MACHINE_KEYS.includes(i.value));
  const master = body.querySelector('.equip-input[value="machine"]');
  // 「すべてのマシン」で個別マシンを一括選択。個別の変更は「すべて」に反映する
  if (input.value === "machine") machines.forEach((m) => { m.checked = input.checked; });
  else if (master && MACHINE_KEYS.includes(input.value)) master.checked = machines.every((m) => m.checked);
  syncEquipment();
}

function startEdit() {
  editing = true;
  draft = structuredClone(ctx.storage.loadProfile() ?? DEFAULT_PROFILE);
  render();
  body.querySelector("#profile-title")?.scrollIntoView({ behavior: ctx.motion() ? "smooth" : "auto", block: "start" });
  body.querySelector('[data-key="pf-weight"]')?.focus({ preventScroll: true });
}

function cancelEdit() {
  editing = false;
  draft = null;
  render();
  body.querySelector('[data-key="pf-edit"]')?.focus({ preventScroll: true });
}

async function saveProfile() {
  const rec = ctx.getPlan();
  if (rec?.modified) {
    const ok = await ctx.confirm({
      title: "メニューを作り直しますか?",
      message: "保存すると新しいメニューを作ります。差し替えや調整をした今のメニューは置き換わります。",
      ok: "保存して作り直す",
    });
    if (!ok) return;
  }
  if (!ctx.storage.saveProfile(draft)) return; // 失敗の理由は storage が通知する
  editing = false;
  draft = null;
  ctx.refresh("profile");
  const next = ctx.createPlan(ctx.storage.loadProfile());
  ctx.navigate("menu");
  ctx.toast(`1週間のメニューを作成しました(${next.plan.days.length}日分)`, { tone: "ok" });
}

async function regenerate() {
  const profile = ctx.storage.loadProfile();
  if (!profile) return;
  if (ctx.getPlan()?.modified) {
    const ok = await ctx.confirm({
      title: "メニューを作り直しますか?",
      message: "差し替えや調整をした今のメニューは、新しいメニューに置き換わります。",
      ok: "作り直す",
    });
    if (!ok) return;
  }
  const next = ctx.createPlan(profile);
  ctx.navigate("menu");
  ctx.toast(`メニューを作り直しました(${next.plan.days.length}日分)`, { tone: "ok" });
}

// ---------- バックアップ ----------

function backupDone(name) {
  ctx.storage.markBackup();
  ctx.storage.requestPersistentStorage();
  renderBackup();
  ctx.toast(`バックアップを書き出しました(${name})`, { tone: "ok" });
}

function download(json, name) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // すぐに破棄すると Safari で保存に失敗することがあるので、少し待ってから
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  backupDone(name);
}

// iPhone では共有シート(「ファイルに保存」・AirDrop など)を優先し、使えなければダウンロード
function onExport() {
  const json = JSON.stringify(ctx.storage.buildBackup(), null, 2);
  const name = ctx.storage.backupFileName();
  const file = typeof File === "function" ? new File([json], name, { type: "application/json" }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    // 共有はタップの直後(await より前)に呼ぶ必要がある
    navigator.share({ files: [file], title: "ワークアウト記録のバックアップ" })
      .then(() => backupDone(name))
      .catch((err) => { if (err?.name !== "AbortError") download(json, name); });
    return;
  }
  download(json, name);
}

function applyImport(data, mode) {
  const r = ctx.storage.applyBackup(data, mode);
  if (!r.ok) {
    ctx.toast(r.error ?? "読み込めませんでした。", { tone: "error" });
    return;
  }
  editing = false;
  draft = null;
  ctx.refresh("import");
  const message = mode === "merge"
    ? `${r.added}件を追加しました${r.updated ? `・${r.updated}件を更新` : ""}${r.skipped ? `(重複${r.skipped}件はスキップ)` : ""}`
    : `記録${r.total}件で置き換えました`;
  ctx.toast(message, {
    tone: "ok",
    action: "元に戻す",
    onAction: () => {
      if (r.undo()) {
        ctx.refresh("import");
        ctx.toast("読み込みを取り消しました", { tone: "info" });
      } else {
        ctx.toast("取り消せませんでした。", { tone: "error" });
      }
    },
  });
}

function openImportSheet(result, fileName) {
  const { data } = result;
  const c = data.counts;
  const exported = data.exportedAt ? formatJaDate(localDateStr(new Date(data.exportedAt))) : "不明";
  const localCount = ctx.storage.loadLogs().length;
  const sheetBody = document.createElement("div");
  sheetBody.innerHTML =
    `<p class="sheet-text">「${escapeHtml(fileName)}」の内容です。</p>` +
    `<dl class="kv">` +
    `<div><dt>記録</dt><dd>${c.logs}件</dd></div>` +
    `<div><dt>体重</dt><dd>${c.bodyweight}件</dd></div>` +
    `<div><dt>プロフィール</dt><dd>${data.profile ? "あり" : "なし"}</dd></div>` +
    `<div><dt>メニュー</dt><dd>${data.plan ? "あり" : "なし"}</dd></div>` +
    `<div><dt>書き出した日</dt><dd>${escapeHtml(exported)}</dd></div></dl>` +
    (result.warnings.length ? `<ul class="warn-list">${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : "") +
    `<ul class="choice-help">` +
    `<li><b>統合する</b>: この端末の記録(${localCount}件)を残したまま、無い記録だけを追加します。</li>` +
    `<li><b>置き換える</b>: この端末のデータをすべて、ファイルの内容に置き換えます。</li></ul>`;
  const foot = document.createElement("div");
  foot.className = "sheet-actions sheet-actions--stack";
  foot.innerHTML =
    `<button type="button" class="btn btn-primary btn-lg" data-mode="merge">統合する(おすすめ)</button>` +
    `<button type="button" class="btn btn-danger" data-mode="replace">置き換える</button>`;
  const sheet = ctx.openSheet({ title: "バックアップの読み込み", body: sheetBody, footer: foot });
  foot.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    sheet.close();
    applyImport(data, b.dataset.mode);
  });
}

async function onImportFile(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch {
    ctx.toast("ファイルを読み込めませんでした。", { tone: "error" });
    return;
  }
  const result = ctx.storage.validateBackup(text);
  if (!result.ok) {
    ctx.toast(result.errors.join(" "), { tone: "error" });
    return;
  }
  openImportSheet(result, file.name);
}

async function undoImport() {
  const ok = await ctx.confirm({
    title: "直前の読み込みを取り消しますか?",
    message: "読み込む前の記録・体重・プロフィール・メニューに戻します。",
    ok: "取り消す",
    danger: true,
  });
  if (!ok) return;
  if (ctx.storage.undoLastImport()) {
    editing = false;
    draft = null;
    ctx.refresh("import");
    ctx.toast("読み込みを取り消しました", { tone: "ok" });
  } else {
    ctx.toast("取り消せませんでした。", { tone: "error" });
  }
}

async function checkUpdate() {
  const status = await ctx.checkForUpdate();
  const msg = UPDATE_MSG[status];
  if (msg) ctx.toast(msg[0], { tone: msg[1] });
}

// ---------- イベント ----------

function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || !body.contains(btn)) return;
  switch (btn.dataset.act) {
    case "edit": startEdit(); break;
    case "cancel": cancelEdit(); break;
    case "regen": regenerate(); break;
    case "focus": {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      const m = btn.dataset.muscle;
      draft.focus = on ? [...new Set([...draft.focus, m])] : draft.focus.filter((x) => x !== m);
      break;
    }
    case "preset": {
      const p = PRESETS[btn.dataset.preset];
      setEquipment(p.keys);
      ctx.announce(`${p.label}の器具を選びました`);
      break;
    }
    case "export": onExport(); break;
    case "import": body.querySelector(".import-file")?.click(); break;
    case "undo-import": undoImport(); break;
    case "check-update": checkUpdate(); break;
    case "reload": location.reload(); break;
    default: break;
  }
}

function onChange(e) {
  const t = e.target;
  if (t.matches(".import-file")) {
    onImportFile(t);
    return;
  }
  if (!draft) return;
  if (t.matches(".equip-input")) onEquipmentChange(t);
  else if (t.name === "pf-gender") draft.gender = t.value;
  else if (["weight", "height", "age"].includes(t.name)) draft[t.name] = Number(t.value);
  else if (t.name === "pf-goal") draft.goal = t.value;
  else if (t.name === "pf-level") draft.level = t.value;
  else if (t.name === "pf-frequency") draft.frequency = Number(t.value);
}

function onToggle(e) {
  const det = e.target;
  if (!det.matches?.(".equip-group")) return;
  const gi = Number(det.dataset.group);
  if (det.open) openGroups.add(gi);
  else openGroups.delete(gi);
}

// ---------- ビューの約束(js/app.js 参照) ----------

export function mount(section, c) {
  ctx = c;
  body = section.querySelector(".view-body");
  body.addEventListener("click", onClick);
  body.addEventListener("change", onChange);
  body.addEventListener("toggle", onToggle, true);
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    saveProfile();
  });
  render();
}

export function update(reason) {
  if (reason === "logs" || reason === "day") {
    renderBackup();
    return;
  }
  if (reason === "import") {
    editing = false;
    draft = null;
  }
  if (reason === "profile" || reason === "import") render();
}
