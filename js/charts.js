// SVG 折れ線グラフの文字列を生成する純粋関数(DOM 不要・Node でも動作)。
// points: [{ date: "YYYY-MM-DD", value: number, pr?: boolean }]
// - 縦軸はきりのよい目盛り(重複ラベルなし)で、目盛り線はラベルの値ちょうどに引く
// - 横軸は日付の間隔どおりに配置する
// - role="img" と <title>/<desc>・aria-label で内容を読み上げられる
// - width を渡すと 1 SVG 単位 = 1 CSS px で描くので、文字がどの画面でも同じ大きさになる
//   (CSS 側は .line-chart { max-width:100%; height:auto; } で縮小のみ許可する)
import { escapeHtml, formatShortDate } from "./util.js?v=14";

const DAY_MS = 24 * 60 * 60 * 1000;
const NICE_STEPS = [1, 2, 2.5, 5];
const MAX_INTERVALS = 4;
const AXIS_FONT = 12;
const LABEL_FONT = 13;

let chartSeq = 0;

function decimalsOf(n) {
  const s = String(Number(n.toPrecision(12)));
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

// きりのよい目盛り。{ lo, hi, step, ticks: number[], decimals }
// minSpan: 変化が小さいときに縦軸がそれ以上狭くならない幅(0.5kg の差が全高に広がるのを防ぐ)
export function niceTicks(min, max, { minSpan = null } = {}) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  const span0 = minSpan ?? Math.max(1, Math.abs(hi) * 0.04);
  if (hi - lo < span0) {
    const c = (lo + hi) / 2;
    lo = c - span0 / 2;
    hi = c + span0 / 2;
    // 値がすべて 0 以上なら、軸を負の側にはみ出させない
    if (Math.min(min, max) >= 0 && lo < 0) {
      hi -= lo;
      lo = 0;
    }
  }
  const span = hi - lo;
  let mag = 10 ** Math.floor(Math.log10(span / (MAX_INTERVALS * 10)));
  for (let guard = 0; guard < 40; guard++) {
    for (const m of NICE_STEPS) {
      const step = Number((m * mag).toPrecision(12));
      const a = Math.floor(lo / step + 1e-9) * step;
      const b = Math.ceil(hi / step - 1e-9) * step;
      const intervals = Math.round((b - a) / step);
      if (intervals <= MAX_INTERVALS) {
        const decimals = decimalsOf(step);
        const ticks = [];
        for (let k = 0; k <= intervals; k++) ticks.push(Number((a + k * step).toFixed(decimals)));
        return { lo: ticks[0], hi: ticks[ticks.length - 1], step, ticks, decimals };
      }
    }
    mag *= 10;
  }
  return { lo, hi, step: span, ticks: [lo, hi], decimals: 0 };
}

const fmt = (v, decimals) =>
  Number(v.toFixed(decimals)).toLocaleString("ja-JP", { maximumFractionDigits: decimals });

// 色の指定は CSS の値として安全なものだけ許可する(属性・style への埋め込み対策)
const safeColor = (c, fallback) => (typeof c === "string" && /^[#a-zA-Z0-9(),.%\s-]{1,64}$/.test(c) ? c : fallback);

const utcOf = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// 文字列のおおよその表示幅(px)。全角 1em、幅広の英字 0.9em、その他の半角 0.62em(太字は 1.08 倍)
const WIDE = new Set([..."mwMW%"]);
const textWidth = (s, size, bold = false) =>
  [...s].reduce((w, ch) => w + size * (ch.charCodeAt(0) > 0xff ? 1 : WIDE.has(ch) ? 0.9 : 0.62), 0) * (bold ? 1.08 : 1);

/**
 * @param {Array<{date:string, value:number, pr?:boolean}>} points 古い順でなくてもよい
 * @param {object} opts
 *   color     線の色(既定: var(--accent))
 *   unit      単位("kg" "回" "m" など)。最新値ラベル・一番上の目盛り・読み上げ文に付く
 *   decimals  値の表示桁数(既定: 目盛りに合わせる/最大 2 桁)
 *   title     グラフの名前(例 "ベンチプレスの最大重量")。<title> と読み上げの先頭に使う
 *   ariaLabel 読み上げ文全体を置き換えたいときに指定
 *   width     描画幅(px)。コンテナの実幅を渡すと文字が実寸になる(既定 360)
 *   height    描画高さ(既定: 幅の 0.5 倍、160〜260)
 *   minSpan   縦軸の最小幅(既定: 最大値の 4% と 1 の大きい方)
 *   highlight 強調する日付の Set/配列(points の pr:true も強調される)
 *   emptyText データが無いときの文言
 */
export function lineChartSVG(points, opts = {}) {
  const {
    color, unit = "", decimals, title = "推移グラフ", ariaLabel, width = 360, height, minSpan = null,
    highlight = null, emptyText = "データがありません",
  } = opts;
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => p && typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
    .map((p) => ({ ...p, t: utcOf(p.date) }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) return `<p class="chart-empty">${escapeHtml(emptyText)}</p>`;

  const lineColor = safeColor(color, "var(--accent, #cbf24f)");
  const gridColor = "var(--line, #343943)";
  const dimColor = "var(--text-dim, #9aa0ab)";
  const haloColor = "var(--bg-panel, #1b1e25)";
  const u = String(unit);

  const values = pts.map((p) => p.value);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const axis = niceTicks(vMin, vMax, { minSpan });
  const valueDecimals = decimals ?? Math.min(2, Math.max(axis.decimals, ...values.map(decimalsOf)));
  const tickLabels = axis.ticks.map((v, i) => fmt(v, axis.decimals) + (i === axis.ticks.length - 1 ? u : ""));

  const W = Math.round(Math.min(1200, Math.max(240, Number(width) || 360)));
  const H = Math.round(height ?? Math.min(260, Math.max(160, W * 0.5)));
  const first = pts[0];
  const last = pts[pts.length - 1];
  const val = (v) => `${fmt(v, valueDecimals)}${u}`;
  const lastText = val(last.value);
  const padL = Math.ceil(Math.max(...tickLabels.map((s) => textWidth(s, AXIS_FONT)))) + 12;
  // 最新値は最後の点の右に置く(線は必ず左から来るので重ならない)。その分の余白を右に取る
  const padR = Math.ceil(textWidth(lastText, LABEL_FONT, true)) + 14;
  const padT = 22;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const t0 = pts[0].t;
  const tN = pts[pts.length - 1].t;
  const x = (t) => padL + (tN === t0 ? innerW / 2 : (innerW * (t - t0)) / (tN - t0));
  const y = (v) => padT + innerH - (innerH * (v - axis.lo)) / (axis.hi - axis.lo || 1);
  const f1 = (n) => n.toFixed(1);

  // 読み上げ用の要約
  const hl = new Set(highlight ? [...highlight] : []);
  const isHl = (p) => p.pr === true || hl.has(p.date);
  const prCount = pts.filter(isHl).length;
  const summary = pts.length === 1
    ? `${formatShortDate(first.date)} ${val(first.value)}(記録1件)`
    : `${formatShortDate(first.date)} ${val(first.value)} → ${formatShortDate(last.date)} ${val(last.value)}、` +
      `最高 ${val(vMax)}、最低 ${val(vMin)}、記録${pts.length}件` +
      (prCount > 0 ? `、自己ベスト更新${prCount}回` : "");
  const label = ariaLabel ?? `${title}: ${summary}`;
  const id = `chart-${++chartSeq}`;

  let svg = `<svg class="line-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"` +
    ` style="display:block;max-width:100%;height:auto" role="img" aria-label="${escapeHtml(label)}" aria-describedby="${id}-desc">` +
    `<title>${escapeHtml(title)}</title><desc id="${id}-desc">${escapeHtml(summary)}</desc>`;
  svg += `<g aria-hidden="true" font-family="inherit">`;

  // 横の目盛り線+ラベル(ラベルの値ちょうどに線を引く)
  axis.ticks.forEach((v, i) => {
    const yy = f1(y(v));
    svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" style="stroke:${gridColor}" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${f1(y(v) + AXIS_FONT * 0.35)}" text-anchor="end" font-size="${AXIS_FONT}" style="fill:${dimColor}">${escapeHtml(tickLabels[i])}</text>`;
  });

  // 折れ線と点
  if (pts.length > 1) {
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${f1(x(p.t))} ${f1(y(p.value))}`).join(" ");
    svg += `<path d="${d}" fill="none" style="stroke:${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  for (const p of pts) {
    const cx = f1(x(p.t));
    const cy = f1(y(p.value));
    if (isHl(p)) {
      svg += `<circle class="line-chart-pr" cx="${cx}" cy="${cy}" r="6.5" style="fill:${haloColor};stroke:${lineColor}" stroke-width="2.5"/>`;
      svg += `<circle cx="${cx}" cy="${cy}" r="2.5" style="fill:${lineColor}"/>`;
    } else {
      svg += `<circle cx="${cx}" cy="${cy}" r="3.5" style="fill:${lineColor}"/>`;
    }
  }

  // 最新値ラベル(最後の点の右。背景色の縁取りで目盛り線の上でも読める)
  const lx = x(last.t) + (isHl(last) ? 10 : 8);
  const ly = Math.min(padT + innerH + 4, Math.max(padT + 4, y(last.value) + LABEL_FONT * 0.35));
  svg += `<text x="${f1(lx)}" y="${f1(ly)}" text-anchor="start" font-size="${LABEL_FONT}" font-weight="bold"` +
    ` style="fill:${lineColor};stroke:${haloColor};stroke-width:4px;paint-order:stroke;stroke-linejoin:round">${escapeHtml(lastText)}</text>`;

  // 日付ラベル(両端と、期間が長ければ中央)。年をまたぐ場合は最初の日付に年を付ける
  const yearOf = (p) => p.date.slice(0, 4);
  const dateText = (p, withYear = false) => (withYear ? `${yearOf(p)}/` : "") + formatShortDate(p.date);
  const dateY = H - 7;
  if (pts.length === 1 || tN === t0) {
    svg += `<text x="${f1(x(first.t))}" y="${dateY}" text-anchor="middle" font-size="${AXIS_FONT}" style="fill:${dimColor}">${escapeHtml(dateText(first, true))}</text>`;
  } else {
    const multiYear = yearOf(first) !== yearOf(last);
    svg += `<text x="${padL}" y="${dateY}" text-anchor="start" font-size="${AXIS_FONT}" style="fill:${dimColor}">${escapeHtml(dateText(first, multiYear))}</text>`;
    svg += `<text x="${W - padR}" y="${dateY}" text-anchor="end" font-size="${AXIS_FONT}" style="fill:${dimColor}">${escapeHtml(dateText(last, multiYear))}</text>`;
    const days = (tN - t0) / DAY_MS;
    if (days >= 14 && innerW >= 220 && pts.length >= 3) {
      const midT = t0 + Math.round(days / 2) * DAY_MS;
      const mid = new Date(midT);
      const midDate = `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, "0")}-${String(mid.getUTCDate()).padStart(2, "0")}`;
      svg += `<line x1="${f1(x(midT))}" y1="${padT + innerH}" x2="${f1(x(midT))}" y2="${padT + innerH + 4}" style="stroke:${gridColor}" stroke-width="1"/>`;
      svg += `<text x="${f1(x(midT))}" y="${dateY}" text-anchor="middle" font-size="${AXIS_FONT}" style="fill:${dimColor}">${escapeHtml(formatShortDate(midDate))}</text>`;
    }
  }
  svg += `</g></svg>`;
  return svg;
}
