// js/charts.js の単体テスト(目盛り・配置・読み上げ・エスケープ)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineChartSVG, niceTicks } from "../js/charts.js";

const pts = (...pairs) => pairs.map(([date, value]) => ({ date, value }));

// SVG 文字列から要素の属性を取り出す簡易パーサー
function elements(svg, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([^<]*)</${tag}>)`, "g");
  const out = [];
  for (const m of svg.matchAll(re)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({ attrs, text: m[2] ?? "" });
  }
  return out;
}
// 目盛り線(横線)とそのラベル
function yAxis(svg) {
  const lines = elements(svg, "line").filter((l) => l.attrs.y1 === l.attrs.y2).map((l) => Number(l.attrs.y1));
  const labels = elements(svg, "text").filter((t) => t.attrs["text-anchor"] === "end" && /^[\d,.]+/.test(t.text) && Number(t.attrs.x) < 80);
  return { lines, labels: labels.map((t) => ({ value: Number(t.text.replace(/[^\d.]/g, "")), text: t.text, y: Number(t.attrs.y) })) };
}
const circles = (svg) => elements(svg, "circle").map((c) => ({ cx: Number(c.attrs.cx), cy: Number(c.attrs.cy), r: Number(c.attrs.r) }));

test("niceTicks: distinct, evenly stepped labels that bracket the data (B26)", () => {
  const cases = [[65, 65.5], [64.5, 64.5], [81.5, 82], [0, 0], [40, 120], [1.2, 1.5], [15, 18], [750, 1625], [30, 45], [0.3, 0.35], [100, 100]];
  for (const [min, max] of cases) {
    const t = niceTicks(min, max);
    const label = `${min}..${max}`;
    assert.ok(t.ticks.length >= 2 && t.ticks.length <= 5, `${label}: ${t.ticks}`);
    assert.ok(t.lo <= min + 1e-9 && t.hi >= max - 1e-9, `${label}: ${t.lo}..${t.hi}`);
    const labels = t.ticks.map((v) => v.toFixed(t.decimals));
    assert.equal(new Set(labels).size, labels.length, `${label}: duplicate labels ${labels}`);
    for (let i = 1; i < t.ticks.length; i++) {
      assert.ok(Math.abs(t.ticks[i] - t.ticks[i - 1] - t.step) < 1e-9, `${label}: uneven ${t.ticks}`);
    }
    if (min >= 0) assert.ok(t.lo >= 0, `${label}: negative axis`);
  }
  // 0.5kg の差が縦軸いっぱいに広がらない(最小幅)
  const small = niceTicks(65, 65.5);
  assert.ok(small.hi - small.lo >= 2, `${small.lo}..${small.hi}`);
  assert.deepEqual(niceTicks(64.5, 64.5).ticks, [63, 64, 65, 66]);
  assert.deepEqual(niceTicks(15, 18).ticks, [15, 16, 17, 18]);
  assert.deepEqual(niceTicks(0, 0, { minSpan: 2 }).ticks, [0, 0.5, 1, 1.5, 2]);
});

test("gridlines sit exactly at their labelled values; a 64.5 kg point lies between 64 and 65", () => {
  const svg = lineChartSVG(pts(["2026-09-01", 64.5]), { unit: "kg" });
  const { lines, labels } = yAxis(svg);
  assert.equal(lines.length, labels.length);
  assert.deepEqual(labels.map((l) => l.value), [63, 64, 65, 66]);
  assert.equal(labels[labels.length - 1].text, "66kg"); // 一番上の目盛りに単位
  const yOf = Object.fromEntries(labels.map((l, i) => [l.value, lines[i]]));
  const [dot] = circles(svg);
  assert.ok(dot.cy < yOf[64] && dot.cy > yOf[65], `${dot.cy} between ${yOf[64]} and ${yOf[65]}`);
  assert.ok(Math.abs(dot.cy - (yOf[64] + yOf[65]) / 2) < 0.2);
  // 値の大きい目盛りほど上
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i] < lines[i - 1]);
});

test("[65, 65.5] and 81.5–82 series produce unique labels", () => {
  for (const series of [pts(["2026-09-01", 65], ["2026-09-02", 65.5]), pts(["2026-09-01", 81.5], ["2026-09-02", 82], ["2026-09-03", 81.5])]) {
    const { labels } = yAxis(lineChartSVG(series, { unit: "kg" }));
    const texts = labels.map((l) => l.text);
    assert.equal(new Set(texts).size, texts.length, texts.join(","));
  }
});

test("x positions follow dates, not indices", () => {
  const svg = lineChartSVG(pts(["2026-06-01", 60], ["2026-09-20", 62], ["2026-09-21", 63]), { width: 400 });
  const [a, b, c] = circles(svg);
  const span = c.cx - a.cx;
  assert.ok(span > 300);
  assert.ok((b.cx - a.cx) / span > 0.98, `second point should be near the end: ${(b.cx - a.cx) / span}`);
  assert.ok(c.cx - b.cx < 5);
  // 入力順が崩れていても日付順に描く
  const shuffled = lineChartSVG(pts(["2026-09-21", 63], ["2026-06-01", 60], ["2026-09-20", 62]), { width: 400 });
  assert.deepEqual(circles(shuffled).map((p) => p.cx), [a.cx, b.cx, c.cx]);
});

test("accessible: role=img, aria-label with title, range and latest value; <title>/<desc> (B35)", () => {
  const svg = lineChartSVG(pts(["2026-08-26", 45], ["2026-09-10", 60], ["2026-09-28", 70]), { unit: "kg", title: "ベンチプレスの最大重量" });
  assert.match(svg, /^<svg[^>]*\brole="img"/);
  const label = /aria-label="([^"]*)"/.exec(svg)[1];
  assert.equal(label, "ベンチプレスの最大重量: 8/26 45kg → 9/28 70kg、最高 70kg、最低 45kg、記録3件");
  assert.match(svg, /<title>ベンチプレスの最大重量<\/title>/);
  assert.match(svg, /<desc id="(chart-\d+)-desc">8\/26 45kg → 9\/28 70kg/);
  const id = /aria-describedby="([^"]+)"/.exec(svg)[1];
  assert.ok(svg.includes(`<desc id="${id}"`));
  assert.match(svg, /<g aria-hidden="true"/);
  // ariaLabel で全体を置き換えられる
  assert.match(lineChartSVG(pts(["2026-09-01", 1]), { ariaLabel: "カスタム" }), /aria-label="カスタム"/);
  // グラフごとに id が異なる
  const id2 = /aria-describedby="([^"]+)"/.exec(lineChartSVG(pts(["2026-09-01", 1])))[1];
  assert.notEqual(id, id2);
});

test("labels are escaped for attribute and text context", () => {
  const evil = `"><script>alert(1)</script><x a='`;
  const svg = lineChartSVG(pts(["2026-09-01", 1], ["2026-09-02", 2]), { title: evil, unit: `kg"><b>`, color: `red" onload="alert(1)` });
  assert.ok(!svg.includes("<script>"));
  assert.ok(!svg.includes("<b>"));
  assert.ok(!/onload=/.test(svg.replace(/&quot;/g, "")) || !svg.includes('onload="'));
  assert.ok(!svg.includes('onload="alert'));
  assert.match(svg, /&quot;&gt;&lt;script&gt;/);
  // 不正な色は既定色に置き換える
  assert.match(svg, /stroke:var\(--accent, #cbf24f\)/);
  assert.match(lineChartSVG(pts(["2026-09-01", 1]), { color: "#7cc4ff" }), /fill:#7cc4ff/);
});

test("single point and identical dates are centred and labelled", () => {
  const svg = lineChartSVG(pts(["2026-09-01", 64.5]), { unit: "kg", width: 360 });
  assert.ok(!svg.includes("<path"));
  const [dot] = circles(svg);
  const texts = elements(svg, "text");
  const valueLabel = texts.find((t) => t.attrs["font-weight"] === "bold");
  assert.equal(valueLabel.text, "64.5kg");
  assert.equal(valueLabel.attrs["text-anchor"], "start");
  assert.ok(Number(valueLabel.attrs.x) > dot.cx);
  assert.ok(Math.abs(Number(valueLabel.attrs.y) - dot.cy) < 8);
  const dateLabel = texts.find((t) => t.text === "2026/9/1");
  assert.ok(dateLabel, "single point shows its full date");
  assert.ok(svg.includes('aria-label="推移グラフ: 9/1 64.5kg(記録1件)"'));
  const same = circles(lineChartSVG(pts(["2026-09-01", 60], ["2026-09-01", 62])));
  assert.equal(same[0].cx, same[1].cx);
});

test("latest-value label sits right of the last point, so the line never crosses it", () => {
  const W = 360;
  const label = (svg) => elements(svg, "text").find((t) => t.attrs["font-weight"] === "bold");
  const series = {
    falling: [80, 60], rising: [60, 80], flat: [70, 70], dropToBottom: [100, 50], riseToTop: [50, 100],
    zigzag: [60, 90, 61, 89, 60], smallDrop: [65, 64.5], swim: [750, 1625],
  };
  for (const [name, values] of Object.entries(series)) {
    const unit = name === "swim" ? "m" : "kg";
    const svg = lineChartSVG(values.map((v, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value: v })), { unit, width: W });
    const t = label(svg);
    const dots = circles(svg);
    const lastDot = dots.at(-1);
    assert.equal(t.attrs["text-anchor"], "start", name);
    assert.ok(Number(t.attrs.x) > lastDot.cx + 3, `${name}: label starts right of the point`);
    assert.ok(dots.every((d) => d.cx <= lastDot.cx), `${name}: last point is the rightmost`);
    // ラベルの右端が SVG の幅に収まる(太字の幅を広めに見積もる)
    const w = [...t.text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0xff ? 13 : /[mwMW%]/.test(ch) ? 12.6 : 8.6), 0);
    assert.ok(Number(t.attrs.x) + w <= W + 0.5, `${name}: label overflows (${t.attrs.x}+${w})`);
    assert.ok(Math.abs(Number(t.attrs.y) - lastDot.cy) < 10, `${name}: label next to the point`);
    assert.ok(Number(t.attrs.y) > 10, `${name}: label clipped at the top`);
    assert.match(t.attrs.style, /paint-order:stroke/);
  }
});

test("readable sizing: width controls the viewBox 1:1; axis text is at least 12 units (I14)", () => {
  const svg = lineChartSVG(pts(["2026-09-01", 1], ["2026-09-02", 2]), { width: 331.6 });
  assert.match(svg, /viewBox="0 0 332 166"/);
  assert.match(svg, /width="332" height="166"/);
  assert.match(svg, /style="display:block;max-width:100%;height:auto"/);
  for (const t of elements(svg, "text")) assert.ok(Number(t.attrs["font-size"]) >= 12);
  assert.match(lineChartSVG(pts(["2026-09-01", 1])), /viewBox="0 0 360 180"/);
  assert.match(lineChartSVG(pts(["2026-09-01", 1]), { width: 50 }), /viewBox="0 0 240 160"/);
  assert.match(lineChartSVG(pts(["2026-09-01", 1]), { width: 800, height: 200 }), /viewBox="0 0 800 200"/);
  // 目盛りラベルが左余白に収まる
  const wide = lineChartSVG(pts(["2026-09-01", 1000], ["2026-09-30", 1625]), { unit: "m" });
  const { labels } = yAxis(wide);
  assert.ok(labels.some((l) => l.text.includes(",")), "thousands separators");
  const firstLine = elements(wide, "line")[0];
  const padL = Number(firstLine.attrs.x1);
  const longest = Math.max(...labels.map((l) => l.text.length));
  assert.ok(padL >= longest * 12 * 0.6, `padL ${padL} fits ${longest} chars`);
});

test("date labels: both ends, a middle tick for long ranges, year when spanning years", () => {
  const long = lineChartSVG(pts(["2026-06-01", 60], ["2026-07-15", 61], ["2026-09-28", 62]));
  const texts = elements(long, "text").map((t) => t.text);
  assert.ok(texts.includes("6/1") && texts.includes("9/28"));
  assert.ok(texts.includes("7/31"), texts.join(" ")); // 6/1 と 9/28 の中間
  const years = elements(lineChartSVG(pts(["2025-12-30", 60], ["2026-01-05", 61])), "text").map((t) => t.text);
  assert.ok(years.includes("2025/12/30") && years.includes("2026/1/5"), years.join(" "));
});

test("PR points get a highlight ring (points[].pr or highlight option)", () => {
  const svg = lineChartSVG([{ date: "2026-09-01", value: 60 }, { date: "2026-09-08", value: 65, pr: true }, { date: "2026-09-15", value: 64 }], { unit: "kg" });
  assert.equal((svg.match(/class="line-chart-pr"/g) ?? []).length, 1);
  assert.match(svg, /自己ベスト更新1回/);
  const viaOpt = lineChartSVG(pts(["2026-09-01", 60], ["2026-09-08", 65]), { highlight: new Set(["2026-09-01"]) });
  assert.equal((viaOpt.match(/class="line-chart-pr"/g) ?? []).length, 1);
});

test("the value-label halo and PR ring fill follow the chart background (token or option)", () => {
  const data = [{ date: "2026-09-01", value: 60 }, { date: "2026-09-08", value: 65, pr: true }];
  const def = lineChartSVG(data, { unit: "kg" });
  assert.match(def, /stroke:var\(--chart-bg, var\(--bg-elevated, #23272f\)\)/);
  assert.match(def, /class="line-chart-pr"[^>]*fill:var\(--chart-bg/);
  const custom = lineChartSVG(data, { background: "#1b1e25" });
  assert.match(custom, /stroke:#1b1e25/);
  assert.doesNotMatch(custom, /--chart-bg/);
  // 値として不正な色(属性の外へ出ようとするもの)は既定値に戻す
  const evil = lineChartSVG(data, { background: 'red;"><script>', color: "x\" onload=\"alert(1)" });
  assert.doesNotMatch(evil, /<script>|onload=/);
  assert.match(evil, /--chart-bg/);
});

test("empty or invalid input renders an empty-state paragraph", () => {
  assert.equal(lineChartSVG([]), `<p class="chart-empty">データがありません</p>`);
  assert.equal(lineChartSVG(null, { emptyText: "記録するとグラフが表示されます" }), `<p class="chart-empty">記録するとグラフが表示されます</p>`);
  assert.match(lineChartSVG([{ date: "bad", value: 1 }, { date: "2026-09-01", value: NaN }]), /chart-empty/);
  assert.doesNotThrow(() => lineChartSVG([{ date: "2026-09-01", value: 1 }, null, { value: 3 }]));
});
