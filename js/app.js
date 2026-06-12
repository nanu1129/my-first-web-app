// UI の配線:フォーム入力 → メニュー生成(Claude / 内蔵ロジック)→ 描画
import {
  generatePlan, allExerciseNames, exerciseChoices, getExerciseTrack, getDistanceUnit,
  alternativeExercise, alternativeCardio, adjustPlanVolume, shortenPlan,
  EQUIPMENT, EQUIPMENT_GROUPS, PRESETS, MACHINE_KEYS, MUSCLE_LABELS,
} from "./planner.js?v=9";
import { EQUIPMENT_SVG } from "./icons.js?v=9";

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

// セレクトの選択肢から、指定値に最も近いものを選ぶ
function selectNearest(select, value) {
  if (!select || value == null || Number.isNaN(value)) return;
  let best = null;
  let bestDiff = Infinity;
  for (const opt of select.options) {
    if (opt.value === "") continue;
    const diff = Math.abs(parseFloat(opt.value) - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt.value;
    }
  }
  if (best != null) select.value = best;
}

// "8〜12回" "30〜60秒キープ" "20〜30分" 等の文字列から代表値(中央)を取り出す
function midNumber(text) {
  const nums = String(text).match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length === 0) return null;
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

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
      icon.innerHTML = EQUIPMENT_SVG[key] ?? "";
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
    focus: [...document.querySelectorAll("#focus-chips .focus-chip.active")].map((b) => b.dataset.muscle),
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

  if (plan.focusLabels?.length > 0) {
    html += `<p class="focus-note">🎯 強化部位: ${escapeHtml(plan.focusLabels.join("・"))} — ★の種目を前半に配置し、1種目追加しています</p>`;
  }

  if (plan.historySummary) {
    html += `<div class="history-summary"><strong>📒 記録の反映</strong><ul>`;
    for (const line of plan.historySummary) html += `<li>${escapeHtml(line)}</li>`;
    html += `</ul></div>`;
  }

  html += `<div class="consult-bar">` +
    `<span class="consult-label">🛠 メニューの相談・調整${plan.shortened ? "(時短版: 各日最大4種目)" : ""}</span>` +
    `<div class="consult-btns">` +
    `<button type="button" class="consult-btn" data-act="harder">💪 もっときつく</button>` +
    `<button type="button" class="consult-btn" data-act="easier">🌙 もっと楽に</button>` +
    `<button type="button" class="consult-btn" data-act="shorter">⏱ 時間を短く</button>` +
    `<button type="button" class="consult-btn" data-act="reset">↺ 最初の提案に戻す</button>` +
    `</div>` +
    `<p class="consult-hint">種目の横の「↻」を押すと、同じ部位の別種目に差し替えられます</p>` +
    `</div>`;

  for (const [i, day] of plan.days.entries()) {
    html += `<section class="day-block"><h3>${escapeHtml(day.title)}</h3>`;
    html += `<table><thead><tr><th>種目</th><th>セット</th><th>回数</th><th>休憩</th></tr></thead><tbody>`;
    for (const ex of day.exercises) {
      const note = ex.note ? `<br><small class="ex-note">${escapeHtml(ex.note)}</small>` : "";
      const star = ex.focused ? `<span class="focus-star">★</span> ` : "";
      const j = day.exercises.indexOf(ex);
      const swap = `<button type="button" class="swap-btn" data-day="${i}" data-ex="${j}" aria-label="別の種目に替える" title="別の種目に替える">↻</button>`;
      html += `<tr><td>${star}${escapeHtml(ex.name)} ${swap}${note}</td><td>${ex.sets}</td><td>${escapeHtml(ex.reps)}</td><td>${escapeHtml(ex.rest)}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (day.cardio) {
      const cnote = day.cardio.note ? `<br><small class="ex-note">${escapeHtml(day.cardio.note)}</small>` : "";
      const cswap = `<button type="button" class="swap-btn cardio-swap" data-day="${i}" aria-label="別の有酸素に替える" title="別の有酸素に替える">↻</button>`;
      html += `<p class="cardio-note">🏃 有酸素:${escapeHtml(day.cardio.name)} ${escapeHtml(day.cardio.duration)} ${cswap}${cnote}</p>`;
    }
    html += `<button type="button" class="secondary-btn day-record-btn" data-day="${i}">📝 この日をやったので記録する</button>`;
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

// ---------- 生成フロー ----------

function showResultSection() {
  $("#result-section").hidden = false;
  $("#result-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function runBuiltin(profile, logs) {
  let plan = generatePlan(profile, logs);
  const content = $("#result-content");

  const render = () => {
    content.innerHTML = renderBuiltinPlan(plan);

    // 「この日をやったので記録する」→ その日の内容を記録フォームへ転記
    content.querySelectorAll(".day-record-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        prefillLogFromDay(plan.days[parseInt(btn.dataset.day, 10)]);
      })
    );

    // 種目の差し替え(同じ部位・使える器具の別候補に切替)
    content.querySelectorAll(".swap-btn:not(.cardio-swap)").forEach((btn) =>
      btn.addEventListener("click", () => {
        const d = parseInt(btn.dataset.day, 10);
        const e = parseInt(btn.dataset.ex, 10);
        const alt = alternativeExercise(profile, logs, plan.days[d], e);
        if (alt) {
          plan.days[d].exercises[e] = alt;
          render();
        }
      })
    );

    // 有酸素の差し替え(泳法の切替など)
    content.querySelectorAll(".cardio-swap").forEach((btn) =>
      btn.addEventListener("click", () => {
        const d = parseInt(btn.dataset.day, 10);
        const alt = alternativeCardio(profile, logs, plan.days[d].cardio.name);
        if (alt) {
          plan.days[d].cardio.name = alt.name;
          plan.days[d].cardio.note = alt.note;
          render();
        }
      })
    );

    // メニュー全体の調整
    content.querySelectorAll(".consult-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        switch (btn.dataset.act) {
          case "harder": adjustPlanVolume(plan, 1); break;
          case "easier": adjustPlanVolume(plan, -1); break;
          case "shorter": shortenPlan(plan); break;
          case "reset": plan = generatePlan(profile, logs); break;
        }
        render();
      })
    );
  };

  render();
  showResultSection();
}

function onGenerate(event) {
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

  runBuiltin(profile, loadLogs());
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

// 記録方式ごとの入力欄(すべて選択式)を組み立てる。
// distUnit: 有酸素の距離単位。プール種目は "m"(25m刻み)、それ以外は "km"
function fieldsHtml(track, distUnit = "km") {
  if (track === "cardio") {
    const dist = distUnit === "m"
      ? optionsHtml(numRange(25, 2000, 25), "", (v) => `${v}m`)
      : optionsHtml(numRange(0.5, 20, 0.5), "", (v) => `${v}km`);
    return (
      `<select class="f-min" aria-label="時間">${optionsHtml(numRange(5, 120, 5), 20, (v) => `${v}分`)}</select>` +
      `<select class="f-dist" data-unit="${distUnit}" aria-label="距離"><option value="">距離なし</option>${dist}</select>`
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

// 種目名の選択肢(記録方式に応じたリスト+自由入力)
function nameOptionsHtml(track) {
  let html = `<option value="">種目を選択…</option>`;
  for (const group of exerciseChoices(track)) {
    html += `<optgroup label="${group.label}">`;
    for (const name of group.names) html += `<option value="${name}">${name}</option>`;
    html += `</optgroup>`;
  }
  html += `<option value="__custom__">✏️ その他(自由入力)</option>`;
  return html;
}

// prefill: { track, name, weight, sets, reps, seconds, minutes, distance }(任意)
function addLogRow(prefill = null) {
  const row = document.createElement("div");
  row.className = "log-row";
  row.innerHTML =
    `<select class="log-track" aria-label="種類">` +
    `<option value="weight">🏋️ 筋トレ</option>` +
    `<option value="time">🧘 体幹・キープ</option>` +
    `<option value="cardio">🏃 有酸素</option>` +
    `</select>` +
    `<select class="log-name" aria-label="種目">${nameOptionsHtml("weight")}</select>` +
    `<input type="text" class="log-name-custom" list="exercise-names" placeholder="種目名を入力" hidden>` +
    `<span class="log-fields">${fieldsHtml("weight")}</span>` +
    `<button type="button" class="row-delete" aria-label="この行を削除">✕</button>`;

  const trackSel = row.querySelector(".log-track");
  const nameSel = row.querySelector(".log-name");
  const customInput = row.querySelector(".log-name-custom");
  const fieldsBox = row.querySelector(".log-fields");

  const rebuildFields = (track, name = "") => {
    fieldsBox.innerHTML = fieldsHtml(track, getDistanceUnit(name));
  };
  // 種類の切り替え:種目リストと入力欄を丸ごと差し替える
  const setTrack = (track, keepName = false) => {
    if (track !== trackSel.value) trackSel.value = track;
    if (!keepName) {
      nameSel.innerHTML = nameOptionsHtml(track);
      customInput.hidden = true;
      customInput.value = "";
    }
    rebuildFields(track, keepName ? nameSel.value : "");
  };

  trackSel.addEventListener("change", () => setTrack(trackSel.value));
  // 種目を選んだら、距離単位など入力欄を種目に合わせる
  nameSel.addEventListener("change", () => {
    const custom = nameSel.value === "__custom__";
    customInput.hidden = !custom;
    if (custom) {
      customInput.focus();
      return;
    }
    if (nameSel.value) rebuildFields(trackSel.value, nameSel.value);
  });
  // 自由入力の種目名がデータベースにあれば、種類と入力欄を自動調整
  customInput.addEventListener("change", () => {
    const name = customInput.value.trim();
    const t = getExerciseTrack(name);
    if (t !== trackSel.value) {
      trackSel.value = t;
      nameSel.innerHTML = nameOptionsHtml(t);
      nameSel.value = "__custom__";
      customInput.hidden = false;
    }
    fieldsBox.innerHTML = fieldsHtml(t, getDistanceUnit(name));
  });
  row.querySelector(".row-delete").addEventListener("click", () => row.remove());

  if (prefill) {
    const track = prefill.track ?? "weight";
    setTrack(track);
    if ([...nameSel.options].some((o) => o.value === prefill.name)) {
      nameSel.value = prefill.name;
      rebuildFields(track, prefill.name);
    } else {
      nameSel.value = "__custom__";
      customInput.hidden = false;
      customInput.value = prefill.name ?? "";
    }
    selectNearest(row.querySelector(".f-weight"), prefill.weight);
    selectNearest(row.querySelector(".f-sets"), prefill.sets);
    selectNearest(row.querySelector(".f-reps"), prefill.reps);
    selectNearest(row.querySelector(".f-sec"), prefill.seconds);
    selectNearest(row.querySelector(".f-min"), prefill.minutes);
  }

  $("#log-entries").appendChild(row);
}

// 生成メニューの1日分を記録フォームに転記する(重量は前回記録があればそれを初期値に)
function prefillLogFromDay(day) {
  // 種目名 → 前回の重量(最新の記録を優先)
  const lastWeight = new Map();
  const sorted = loadLogs().sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const log of sorted) {
    for (const e of log.entries) {
      if (!lastWeight.has(e.name) && parseFloat(e.weight) > 0) lastWeight.set(e.name, parseFloat(e.weight));
    }
  }

  $("#log-entries").innerHTML = "";
  for (const ex of day.exercises) {
    const rep = midNumber(ex.reps);
    addLogRow({
      track: ex.track,
      name: ex.name,
      weight: ex.track === "weight" ? (lastWeight.get(ex.name) ?? 0) : null,
      sets: ex.sets,
      reps: ex.track === "weight" ? rep : null,
      seconds: ex.track === "time" ? rep : null,
    });
  }
  if (day.cardio) {
    addLogRow({
      track: "cardio",
      name: day.cardio.name,
      minutes: midNumber(day.cardio.duration),
    });
  }
  $("#log-date").value = new Date().toISOString().slice(0, 10);
  $("#log-error").textContent = "";
  $("#log-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function entrySummary(e) {
  if (e.track === "cardio") {
    const dist = e.distance ? `・${e.distance}${e.unit ?? "km"}` : "";
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
        const distSel = row.querySelector(".f-dist");
        return {
          name, track,
          minutes: val(".f-min") || "0",
          distance: distSel?.value ?? "",
          unit: distSel?.dataset.unit ?? "km",
        };
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

// 「特に鍛えたい部位」のタップ選択チップ
function setupFocusChips() {
  const box = $("#focus-chips");
  for (const [muscle, label] of Object.entries(MUSCLE_LABELS)) {
    if (muscle === "cardio") continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "focus-chip";
    btn.dataset.muscle = muscle;
    btn.textContent = label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const active = btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", String(active));
    });
    box.appendChild(btn);
  }
}

// 体重・身長・年齢をタップで選べるセレクトにする
function setupProfileSelects() {
  fillSelect($("#weight"), numRange(30, 150), 65, (v) => `${v}kg`);
  fillSelect($("#height"), numRange(130, 210), 170, (v) => `${v}cm`);
  fillSelect($("#age"), numRange(10, 90), 30, (v) => `${v}歳`);
}

// ---------- 初期化 ----------

buildEquipmentCheckboxes();
setupProfileSelects();
setupFocusChips();
setupLogSection();
$("#menu-form").addEventListener("submit", onGenerate);
