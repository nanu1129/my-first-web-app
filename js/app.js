// UI の配線:フォーム入力 → メニュー生成(Claude / 内蔵ロジック)→ 描画
import { generatePlan, EQUIPMENT, EQUIPMENT_GROUPS, PRESETS } from "./planner.js";

const STORAGE_KEY_API = "anthropic_api_key";
const STORAGE_KEY_FORCE_BUILTIN = "force_builtin";

const $ = (sel) => document.querySelector(sel);

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
      label.appendChild(input);
      label.appendChild(document.createTextNode(EQUIPMENT[key]));
      fieldset.appendChild(label);
    }
    container.appendChild(fieldset);
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

  for (const day of plan.days) {
    html += `<section class="day-block"><h3>${escapeHtml(day.title)}</h3>`;
    html += `<table><thead><tr><th>種目</th><th>セット</th><th>回数</th><th>休憩</th></tr></thead><tbody>`;
    for (const ex of day.exercises) {
      html += `<tr><td>${escapeHtml(ex.name)}</td><td>${ex.sets}</td><td>${escapeHtml(ex.reps)}</td><td>${escapeHtml(ex.rest)}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (day.cardio) {
      html += `<p class="cardio-note">🏃 有酸素:${escapeHtml(day.cardio.name)} ${escapeHtml(day.cardio.duration)}</p>`;
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

function runBuiltin(profile) {
  const plan = generatePlan(profile);
  setResultMode("builtin");
  $("#result-content").innerHTML = renderBuiltinPlan(plan);
  showResultSection();
}

async function runAi(profile, apiKey) {
  const content = $("#result-content");
  setResultMode("ai");
  content.innerHTML = `<p class="generating">Claude がメニューを考えています…</p>`;
  showResultSection();

  const showError = (msg) => {
    content.innerHTML =
      `<p class="error-msg">${escapeHtml(msg)}</p>` +
      `<button type="button" id="fallback-btn" class="secondary-btn">内蔵ロジックで生成する</button>`;
    $("#fallback-btn").addEventListener("click", () => runBuiltin(profile));
  };

  // 動的 import:API キーを使う人だけが SDK(CDN)を読み込む
  let aiModule;
  try {
    aiModule = await import("./ai.js");
  } catch (error) {
    console.error(error);
    showError("AI モジュールの読み込みに失敗しました。ネットワーク接続を確認してください。");
    return;
  }

  let buffer = "";
  try {
    await aiModule.generateWithClaude(profile, apiKey, (delta) => {
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
  const btn = $("#generate-btn");
  btn.disabled = true;
  try {
    if (apiKey && !forceBuiltin) {
      await runAi(profile, apiKey);
    } else {
      runBuiltin(profile);
    }
  } finally {
    btn.disabled = false;
  }
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
setupSettings();
updateModeIndicator();
$("#menu-form").addEventListener("submit", onGenerate);
