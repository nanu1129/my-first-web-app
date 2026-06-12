// UI の配線:フォーム入力 → メニュー生成(Claude / 内蔵ロジック)→ 描画
import {
  generatePlan, allExerciseNames, exercisesByMuscle, getExerciseTrack,
  EQUIPMENT, EQUIPMENT_ICONS, EQUIPMENT_GROUPS, PRESETS, MACHINE_KEYS,
} from "./planner.js?v=4";

const STORAGE_KEY_API = "anthropic_api_key";
const STORAGE_KEY_FORCE_BUILTIN = "force_builtin";
const STORAGE_KEY_LOGS = "workout_logs";

const $ = (sel) => document.querySelector(sel);

// ---------- 選択式入力のヘルパー ----------

// start〜end を step 刻みで並べた数値配列(0.5 等の小数 step にも対応)
function numRange(start, end, step = 1) {
  const values = [];
  for (let v = start; v <= end + 1e-9; v = Math.round((v + step) * 100) / 100) values.push(v);
  return values;
}

// <option> 群の HTML を作る。labelFor で表示文字列を変えられる
function optionsHtml(values, selected, labelFor = (v) => String(v)) {
  return values
    .map((v) => `<option value="${v}"${String(v) === String(selected) ? " selected" : ""}>${labelFor(v)}</option>`)
    .join("");
}

function fillSelect(select, values, selected, labelFor) {
  select.innerHTML = optionsHtml(values, selected, labelFor);
}

// 重量の選択肢: 自重(0) / 1〜10kg は1kg刻み / それ以上は2.5kg刻み
const WEIGHT_CHOICES = [0, ...numRange(1, 10, 1), ...numRange(12.5, 200, 2.5)];
const weightLabel = (v) => (v === 0 ? "自重・なし" : `${v}kg`);

// ---------- 器具チェックボックスの構築 ----------

function buildEquipmentCheckboxes() {
  const container = $("#equipment-groups");
  for (const group of EQUIPMENT_GROUPS) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "equip-group";
    const legend = document.createElement("legend");
    legend.textContent = group.label;
    fieldset.appendChild(legend);
    for (const key of group.keys) {
      const label = document.createElement("label");
      label.className = "equip-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "equipment";
      input.value = key;
      const icon = document.createElement("span");
      icon.className = "equip-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = EQUIPMENT_ICONS[key] ?? "";
      const text = document.createElement("span");
      text.className = "equip-text";
      text.textContent = EQUIPMENT[key];
      label.append(input, icon, text);
      fieldset.appendChild(label);
    }
    container.appendChild(fieldset);
  }

  // 「マシン一式」のチェックで個別マシンを一括チェック/解除。
  // 逆に個別マシンの選択状態が変わったら「一式」のチェックを追従させる。
  const machineToggle = document.querySelector('input[name="equipment"][value="machine"]');
  const machineItems = [...document.querySelectorAll('input[name="equipment"]')].filter((cb) =>
    MACHINE_KEYS.includes(cb.value)
  );
  if (machineToggle) {
    machineToggle.addEventListener("change", () => {
      machineItems.forEach((cb) => { cb.checked = machineToggle.checked; });
    });
    machineItems.forEach((cb) =>
      cb.addEventListener("change", () => {
        machineToggle.checked = machineItems.every((item) => item.checked);
      })
    );
  }

  const presetBar = $("#preset-buttons");
  for (const [, preset] of Object.entries(PRESETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      document.querySelectorAll('input[name="equipment"]').forEach((cb) => {
        cb.checked = preset.keys.includes(cb.value);
      });
    });
    presetBar.appendChild(btn);
  }
}

// ---------- フォーム読み取り ----------

function readProfile() {
  const weight = parseFloat($("#weight").value);
  const height = parseFloat($("#height").value);
  const age = parseInt($("#age").value, 10);
  if (!(weight > 0) || !(height > 0) || !(age > 0)) {
    throw new Error("体重・身長・年齢を正しく入力してください。");
  }
  return {
    weight,
    height,
    age,
    gender: $("#gender").value,
    goal: $("#goal").value,
    level: $("#level").value,
    frequency: parseInt($("#frequency").value, 10),
    equipment: [...document.querySelectorAll('input[name="equipment"]:checked')].map((cb) => cb.value),
  };
}

// ---------- 描画(内蔵ロジックの構造化結果) ----------

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBuiltinPlan(plan) {
  let html = "";
  html += `<div class="summary-cards">`;
  html += `<div class="card"><span class="card-label">BMI</span><span class="card-value">${plan.bmi.value}</span><span class="card-sub">${escapeHtml(plan.bmi.category)}</span></div>`;
  html += `<div class="card"><span class="card-label">分割法</span><span class="card-value small">${escapeHtml(plan.splitName)}</span></div>`;
  html += `</div>`;

  if (plan.repScheme) {
    html += `<p class="rep-scheme">💡 ${escapeHtml(plan.repScheme)}</p>`;
  }

  if (plan.historySummary) {
    html += `<div class="history-summary"><strong>📒 記録の反映</strong><ul>`;
    for (const line of plan.historySummary) html += `<li>${escapeHtml(line)}</li>`;
    html += `</ul></div>`;
  }

  for (const day of plan.days) {
    html += `<section class="day-block"><h3>${escapeHtml(day.title)}</h3>`;
    html += `<table><thead><tr><th>種目</th><th>セット</th><th>回数</th><th>休憩</th></tr></thead><tbody>`;
    for (const ex of day.exercises) {
      const note = ex.note ? `<br><small class="ex-note">${escapeHtml(ex.note)}</small>` : "";
      html += `<tr><td>${escapeHtml(ex.name)}${note}</td><td>${ex.sets}</td><td>${escapeHtml(ex.reps)}</td><td>${escapeHtml(ex.rest)}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (day.cardio) {
      const cnote = day.cardio.note ? `<br><small class="ex-note">${escapeHtml(day.cardio.note)}</small>` : "";
      html += `<p class="cardio-note">🏃 有酸素:${escapeHtml(day.cardio.name)} ${escapeHtml(day.cardio.duration)}${cnote}</p>`;
    }
    html += `</section>`;
  }

  html += `<section class="day-block advice"><h3>栄養・生活アドバイス</h3><ul>`;
  html += `<li><strong>タンパク質目安:</strong>${escapeHtml(plan.advice.protein)}</li>`;
  html += `<li><strong>カロリー方針:</strong>${escapeHtml(plan.advice.calories)}</li>`;
  for (const tip of plan.advice.tips) {
    html += `<li>${escapeHtml(tip)}</li>`;
  }
  html += `</ul></section>`;
  return html;
}

// ---------- 簡易 Markdown レンダラ(見出し・リスト・表・太字のみ) ----------

function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let tableRows = [];

  const inline = (text) =>
    escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, ...body] = tableRows;
    html += "<table><thead><tr>";
    for (const cell of header) html += `<th>${inline(cell)}</th>`;
    html += "</tr></thead><tbody>";
    for (const row of body) {
      html += "<tr>";
      for (const cell of row) html += `<td>${inline(cell)}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table>";
    tableRows = [];
  };

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      closeList();
      const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      // 区切り行(|---|---|)はスキップ
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (trimmed.startsWith("### ")) { closeList(); html += `<h4>${inline(trimmed.slice(4))}</h4>`; continue; }
    if (trimmed.startsWith("## ")) { closeList(); html += `<h3>${inline(trimmed.slice(3))}</h3>`; continue; }
    if (trimmed.startsWith("# ")) { closeList(); html += `<h2>${inline(trimmed.slice(2))}</h2>`; continue; }
    if (/^[-*] /.test(trimmed)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(trimmed.slice(2))}</li>`;
      continue;
    }
    closeList();
    if (trimmed.length > 0) html += `<p>${inline(trimmed)}</p>`;
  }
  closeList();
  flushTable();
  return html;
}

// ---------- 生成フロー ----------

function setResultMode(mode) {
  const badge = $("#result-badge");
  if (mode === "ai") {
    badge.textContent = "Claude AI 生成";
    badge.className = "badge badge-ai";
  } else {
    badge.textContent = "内蔵アルゴリズム";
    badge.className = "badge badge-builtin";
  }
}

function showResultSection() {
  $("#result-section").hidden = false;
  $("#result-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function runBuiltin(profile, logs) {
  const plan = generatePlan(profile, logs);
  setResultMode("builtin");
  $("#result-content").innerHTML = renderBuiltinPlan(plan);
  showResultSection();
}

async function runAi(profile, apiKey, logs) {
  const content = $("#result-content");
  setResultMode("ai");
  content.innerHTML = `<p class="generating">Claude がメニューを考えています…</p>`;
  showResultSection();

  const showError = (msg) => {
    content.innerHTML =
      `<p class="error-msg">${escapeHtml(msg)}</p>` +
      `<button type="button" id="fallback-btn" class="secondary-btn">内蔵ロジックで生成する</button>`;
    $("#fallback-btn").addEventListener("click", () => runBuiltin(profile, logs));
  };

  // 動的 import:API キーを使う人だけが SDK(CDN)を読み込む
  let aiModule;
  try {
    aiModule = await import("./ai.js?v=4");
  } catch (error) {
    console.error(error);
    showError("AI モジュールの読み込みに失敗しました。ネットワーク接続を確認してください。");
    return;
  }

  let buffer = "";
  try {
    await aiModule.generateWithClaude(profile, apiKey, logs, (delta) => {
      buffer += delta;
      content.innerHTML = renderMarkdown(buffer);
    });
    content.innerHTML = renderMarkdown(buffer);
  } catch (error) {
    console.error(error);
    showError(aiModule.describeApiError(error));
  }
}

async function onGenerate(event) {
  event.preventDefault();
  const errorBox = $("#form-error");
  errorBox.textContent = "";

  let profile;
  try {
    profile = readProfile();
  } catch (e) {
    errorBox.textContent = e.message;
    return;
  }

  const apiKey = localStorage.getItem(STORAGE_KEY_API);
  const forceBuiltin = localStorage.getItem(STORAGE_KEY_FORCE_BUILTIN) === "1";
  const logs = loadLogs();
  const btn = $("#generate-btn");
  btn.disabled = true;
  try {
    if (apiKey && !forceBuiltin) {
      await runAi(profile, apiKey, logs);
    } else {
      runBuiltin(profile, logs);
    }
  } finally {
    btn.disabled = false;
  }
}

// ---------- トレーニング記録 ----------

function loadLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) ?? "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
}

// 記録方式ごとの入力欄(すべて選択式)を組み立てる
function fieldsHtml(track) {
  if (track === "cardio") {
    return (
      `<select class="f-min" aria-label="時間">${optionsHtml(numRange(5, 120, 5), 20, (v) => `${v}分`)}</select>` +
      `<select class="f-dist" aria-label="距離"><option value="">距離なし</option>${optionsHtml(numRange(0.5, 20, 0.5), "", (v) => `${v}km`)}</select>`
    );
  }
  if (track === "time") {
    return (
      `<select class="f-sec" aria-label="時間(秒)">${optionsHtml(numRange(10, 300, 10), 30, (v) => `${v}秒`)}</select>` +
      `<select class="f-sets" aria-label="セット">${optionsHtml(numRange(1, 10), 3, (v) => `${v}セット`)}</select>`
    );
  }
  return (
    `<select class="f-weight" aria-label="重量">${optionsHtml(WEIGHT_CHOICES, 0, weightLabel)}</select>` +
    `<select class="f-sets" aria-label="セット">${optionsHtml(numRange(1, 10), 3, (v) => `${v}セット`)}</select>` +
    `<select class="f-reps" aria-label="回数">${optionsHtml(numRange(1, 30), 10, (v) => `${v}回`)}</select>`
  );
}

// 種目名の選択リスト(部位ごとにグループ化+自由入力)
function nameSelectHtml() {
  let html = `<select class="log-name" aria-label="種目"><option value="">種目を選択…</option>`;
  for (const group of exercisesByMuscle()) {
    html += `<optgroup label="${group.label}">`;
    for (const name of group.names) html += `<option value="${name}">${name}</option>`;
    html += `</optgroup>`;
  }
  html += `<option value="__custom__">✏️ その他(自由入力)</option></select>`;
  return html;
}

function addLogRow() {
  const row = document.createElement("div");
  row.className = "log-row";
  row.innerHTML =
    `<select class="log-track" aria-label="種類">` +
    `<option value="weight">🏋️ 筋トレ</option>` +
    `<option value="time">🧘 体幹・キープ</option>` +
    `<option value="cardio">🏃 有酸素</option>` +
    `</select>` +
    nameSelectHtml() +
    `<input type="text" class="log-name-custom" list="exercise-names" placeholder="種目名を入力" hidden>` +
    `<span class="log-fields">${fieldsHtml("weight")}</span>` +
    `<button type="button" class="row-delete" aria-label="この行を削除">✕</button>`;

  const trackSel = row.querySelector(".log-track");
  const nameSel = row.querySelector(".log-name");
  const customInput = row.querySelector(".log-name-custom");
  const fieldsBox = row.querySelector(".log-fields");
  const setTrack = (track) => {
    if (track !== trackSel.value) trackSel.value = track;
    fieldsBox.innerHTML = fieldsHtml(track);
  };

  trackSel.addEventListener("change", () => setTrack(trackSel.value));
  // 種目を選んだら、記録方式(筋トレ/キープ/有酸素)を自動で切り替える
  nameSel.addEventListener("change", () => {
    const custom = nameSel.value === "__custom__";
    customInput.hidden = !custom;
    if (custom) {
      customInput.focus();
      return;
    }
    if (nameSel.value) setTrack(getExerciseTrack(nameSel.value));
  });
  customInput.addEventListener("change", () => {
    const t = getExerciseTrack(customInput.value.trim());
    setTrack(t);
  });
  row.querySelector(".row-delete").addEventListener("click", () => row.remove());
  $("#log-entries").appendChild(row);
}

function entrySummary(e) {
  if (e.track === "cardio") {
    const dist = e.distance ? `・${e.distance}km` : "";
    return `${e.name} ${e.minutes || 0}分${dist}`;
  }
  if (e.track === "time") {
    return `${e.name} ${e.seconds || 0}秒×${e.sets || 1}セット`;
  }
  const w = parseFloat(e.weight) > 0 ? `${e.weight}kg×` : "";
  return `${e.name} ${w}${e.reps || 1}回×${e.sets || 1}セット`;
}

function renderLogList() {
  const logs = loadLogs().sort((a, b) => (a.date < b.date ? 1 : -1));
  const box = $("#log-list");
  if (logs.length === 0) {
    box.innerHTML = `<p class="log-empty">まだ記録がありません。トレーニングをしたら記録してみましょう。</p>`;
    return;
  }
  let html = `<h3 class="log-list-title">これまでの記録(${logs.length}件)</h3>`;
  for (const log of logs) {
    const summary = log.entries.map(entrySummary).join(" / ");
    html +=
      `<div class="log-item" data-id="${log.id}">` +
      `<div class="log-item-body"><span class="log-item-date">${escapeHtml(log.date)}</span>` +
      `<span class="log-item-summary">${escapeHtml(summary)}</span></div>` +
      `<button type="button" class="row-delete log-item-delete" aria-label="この記録を削除">✕</button></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll(".log-item-delete").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = e.target.closest(".log-item").dataset.id;
      saveLogs(loadLogs().filter((l) => String(l.id) !== id));
      renderLogList();
    })
  );
}

function onLogSubmit(event) {
  event.preventDefault();
  const errorBox = $("#log-error");
  errorBox.textContent = "";

  const date = $("#log-date").value;
  if (!date) {
    errorBox.textContent = "日付を入力してください。";
    return;
  }
  const entries = [...document.querySelectorAll("#log-entries .log-row")]
    .map((row) => {
      const track = row.querySelector(".log-track").value;
      const selected = row.querySelector(".log-name").value;
      const name = selected === "__custom__"
        ? row.querySelector(".log-name-custom").value.trim()
        : selected;
      const val = (cls) => row.querySelector(cls)?.value ?? "";
      if (track === "cardio") {
        return { name, track, minutes: val(".f-min") || "0", distance: val(".f-dist") };
      }
      if (track === "time") {
        return { name, track, seconds: val(".f-sec") || "0", sets: val(".f-sets") || "1" };
      }
      return { name, track, weight: val(".f-weight"), sets: val(".f-sets") || "1", reps: val(".f-reps") || "1" };
    })
    .filter((e) => e.name.length > 0);
  if (entries.length === 0) {
    errorBox.textContent = "少なくとも1つ、種目を選択してください。";
    return;
  }

  const logs = loadLogs();
  logs.push({ id: Date.now(), date, entries });
  saveLogs(logs);
  $("#log-entries").innerHTML = "";
  addLogRow();
  renderLogList();
}

function setupLogSection() {
  // 種目名のサジェスト
  const datalist = $("#exercise-names");
  for (const name of allExerciseNames()) {
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  }
  const dateOf = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };
  $("#log-date").value = dateOf(0);
  // 「今日」「昨日」のワンタップ指定
  document.querySelectorAll(".date-quick [data-days-ago]").forEach((btn) =>
    btn.addEventListener("click", () => {
      $("#log-date").value = dateOf(parseInt(btn.dataset.daysAgo, 10));
    })
  );
  addLogRow();
  $("#log-add-row").addEventListener("click", () => addLogRow());
  $("#log-form").addEventListener("submit", onLogSubmit);
  renderLogList();
}

// 体重・身長・年齢をタップで選べるセレクトにする
function setupProfileSelects() {
  fillSelect($("#weight"), numRange(30, 150), 65, (v) => `${v}kg`);
  fillSelect($("#height"), numRange(130, 210), 170, (v) => `${v}cm`);
  fillSelect($("#age"), numRange(10, 90), 30, (v) => `${v}歳`);
}

// ---------- 設定モーダル ----------

function updateModeIndicator() {
  const hasKey = !!localStorage.getItem(STORAGE_KEY_API);
  const forceBuiltin = localStorage.getItem(STORAGE_KEY_FORCE_BUILTIN) === "1";
  $("#mode-indicator").textContent =
    hasKey && !forceBuiltin ? "現在のモード:Claude AI 生成" : "現在のモード:内蔵アルゴリズム";
}

function setupSettings() {
  const modal = $("#settings-modal");
  $("#settings-btn").addEventListener("click", () => {
    $("#api-key-input").value = localStorage.getItem(STORAGE_KEY_API) ?? "";
    $("#force-builtin").checked = localStorage.getItem(STORAGE_KEY_FORCE_BUILTIN) === "1";
    modal.showModal();
  });
  $("#settings-close").addEventListener("click", () => modal.close());
  $("#api-key-save").addEventListener("click", () => {
    const key = $("#api-key-input").value.trim();
    if (key) localStorage.setItem(STORAGE_KEY_API, key);
    else localStorage.removeItem(STORAGE_KEY_API);
    localStorage.setItem(STORAGE_KEY_FORCE_BUILTIN, $("#force-builtin").checked ? "1" : "0");
    updateModeIndicator();
    modal.close();
  });
  $("#api-key-delete").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY_API);
    $("#api-key-input").value = "";
    updateModeIndicator();
  });
}

// ---------- 初期化 ----------

buildEquipmentCheckboxes();
setupProfileSelects();
setupSettings();
setupLogSection();
updateModeIndicator();
$("#menu-form").addEventListener("submit", onGenerate);
