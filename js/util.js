// 汎用の純粋ヘルパー(日付・エスケープ・数値範囲・書式)。DOM にも localStorage にも触れない。
// 日付は常に「端末のローカル日付」の "YYYY-MM-DD" 文字列で扱う(toISOString は UTC なので使わない)。
// 暦日の加減算は Date.UTC 上で行い、タイムゾーンや夏時間の影響を受けないようにする。

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

const pad2 = (n) => String(n).padStart(2, "0");

// 端末のローカル時刻での日付文字列 "YYYY-MM-DD"
export const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// "YYYY-MM-DD" を [年, 月, 日] に分解する。実在しない日付(2026-02-30 等)は null
function parts(str) {
  const m = typeof str === "string" ? DATE_RE.exec(str) : null;
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return [y, mo, d];
}

const utcOf = (str) => {
  const p = parts(str);
  return p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN;
};

const fromUtc = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

// 実在する暦日の "YYYY-MM-DD" か
export function isDateStr(str) {
  return parts(str) !== null;
}

// "2026/9/20" "2026-9-20" などのゆれを "2026-09-20" にそろえる。解釈できなければ null
export function toDateStr(value) {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(value);
  if (!m) return null;
  const s = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return isDateStr(s) ? s : null;
}

// "YYYY-MM-DD" → その日のローカル 0:00 の Date(不正なら null)
export function parseLocalDate(str) {
  const p = parts(str);
  return p ? new Date(p[0], p[1] - 1, p[2]) : null;
}

// 暦日で n 日後(負なら前)の "YYYY-MM-DD"
export function addDays(str, n) {
  const t = utcOf(str);
  if (Number.isNaN(t)) return null;
  return fromUtc(t + Math.round(n) * DAY_MS);
}

// a から b までの暦日数(b - a)。どちらかが不正なら NaN
export function daysBetween(a, b) {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

// 曜日(月曜=0 … 日曜=6)
export function weekdayMon(str) {
  const t = utcOf(str);
  return Number.isNaN(t) ? NaN : (new Date(t).getUTCDay() + 6) % 7;
}

// その週の月曜日の "YYYY-MM-DD"(週は月曜始まり)
export function mondayOf(str) {
  const dow = weekdayMon(str);
  return Number.isNaN(dow) ? null : addDays(str, -dow);
}

// "2026-09-29" → "9/29(火)"。withYear=true なら "2026/9/29(火)"
export function formatJaDate(str, { withYear = false } = {}) {
  const p = parts(str);
  if (!p) return "";
  const dow = WEEKDAYS_JA[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  return `${withYear ? `${p[0]}/` : ""}${p[1]}/${p[2]}(${dow})`;
}

// "2026-09-29" → "9/29"(グラフの軸など短い表記)
export function formatShortDate(str) {
  const p = parts(str);
  return p ? `${p[1]}/${p[2]}` : "";
}

// HTML 本文・属性値のどちらに埋め込んでも安全な文字列にする
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 小数の桁数(0.25 → 2)。浮動小数の誤差を丸めるために使う
function decimalsOf(n) {
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

// start〜end を step 刻みで並べた数値配列(0.1 や 2.5 刻みでも誤差なし)
export function numRange(start, end, step = 1) {
  if (!(step > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const dec = Math.max(decimalsOf(start), decimalsOf(step));
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  const values = [];
  for (let i = 0; i < count; i++) values.push(Number((start + i * step).toFixed(dec)));
  return values;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// 数値を指定桁で丸めて返す(表示・比較用)
export function roundTo(v, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

// 3 桁区切り+末尾の 0 を省いた表記(1250 → "1,250"、62.50 → "62.5")
export function formatNum(v, maxDecimals = 1) {
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("ja-JP", { maximumFractionDigits: maxDecimals });
}

// 短い一意 ID(時刻+連番+乱数)。英小文字・数字・ハイフンのみ
let uidCounter = 0;
export function uid() {
  uidCounter = (uidCounter + 1) % 1679616; // 36^4
  const rand = Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
  return `${Date.now().toString(36)}-${uidCounter.toString(36).padStart(4, "0")}${rand}`;
}
