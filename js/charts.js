// SVG 折れ線グラフの文字列を生成する純粋関数。
// points: [{ date: "YYYY-MM-DD", value: number }](古い順)
export function lineChartSVG(points, { color = "#c8f04a", unit = "" } = {}) {
  if (!points || points.length === 0) {
    return `<p class="chart-empty">データがありません</p>`;
  }
  const W = 320, H = 140, padL = 38, padR = 12, padT = 12, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;

  const n = points.length;
  const x = (i) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v) => padT + innerH - (innerH * (v - min)) / (max - min);

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img">`;

  // 横グリッド+目盛り(3本)
  for (let k = 0; k <= 2; k++) {
    const v = min + ((max - min) * k) / 2;
    const yy = y(v);
    svg += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#343943" stroke-width="1"/>`;
    svg += `<text x="${padL - 5}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#9aa0ab">${Math.round(v)}</text>`;
  }

  // 折れ線
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  // 点+最新値ラベル
  points.forEach((p, i) => {
    svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${color}"/>`;
  });
  const last = points[n - 1];
  svg += `<text x="${(x(n - 1)).toFixed(1)}" y="${(y(last.value) - 7).toFixed(1)}" text-anchor="end" font-size="10" fill="${color}" font-weight="bold">${last.value}${esc(unit)}</text>`;

  // 端の日付(MM/DD)
  const md = (s) => s.slice(5).replace("-", "/");
  svg += `<text x="${padL}" y="${H - 6}" font-size="9" fill="#9aa0ab">${md(points[0].date)}</text>`;
  if (n > 1) {
    svg += `<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="9" fill="#9aa0ab">${md(last.date)}</text>`;
  }
  svg += `</svg>`;
  return svg;
}
