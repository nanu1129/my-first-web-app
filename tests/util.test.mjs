// js/util.js の単体テスト(node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  localDateStr, parseLocalDate, addDays, daysBetween, formatJaDate, formatShortDate, escapeHtml,
  numRange, clamp, uid, isDateStr, toDateStr, mondayOf, weekdayMon, roundTo, formatNum,
} from "../js/util.js";

const UTIL_URL = new URL("../js/util.js", import.meta.url).href;

// 指定タイムゾーンの子プロセスでコードを実行し、標準出力(JSON)を返す
function inTZ(tz, body) {
  const code = `import * as u from ${JSON.stringify(UTIL_URL)}; const out = (() => { ${body} })(); console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, TZ: tz }, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("localDateStr uses local time, not UTC (JST before 09:00 is still today)", () => {
  assert.equal(localDateStr(new Date(2026, 8, 29, 7, 30)), "2026-09-29");
  assert.equal(localDateStr(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  assert.equal(localDateStr(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  const jst = inTZ("Asia/Tokyo", `return [
    u.localDateStr(new Date("2026-09-29T07:30:00+09:00")),
    u.localDateStr(new Date("2026-09-28T23:59:00+09:00")),
    u.localDateStr(new Date("2026-09-29T00:00:00+09:00")),
  ];`);
  assert.deepEqual(jst, ["2026-09-29", "2026-09-28", "2026-09-29"]);
  const la = inTZ("America/Los_Angeles", `return u.localDateStr(new Date("2026-09-29T05:00:00Z"));`);
  assert.equal(la, "2026-09-28");
});

test("parseLocalDate returns local midnight and rejects impossible dates", () => {
  const d = parseLocalDate("2026-09-29");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 29);
  assert.equal(d.getHours(), 0);
  for (const bad of ["2026-13-01", "2026-02-30", "2026/09/29", "", null, undefined, 20260929, "2026-9-29"]) {
    assert.equal(parseLocalDate(bad), null, String(bad));
  }
  assert.equal(parseLocalDate("2024-02-29").getDate(), 29);
});

test("isDateStr / toDateStr validate and normalise date strings", () => {
  assert.equal(isDateStr("2026-09-29"), true);
  assert.equal(isDateStr("2026-13-45"), false);
  assert.equal(isDateStr("2025-02-29"), false);
  assert.equal(toDateStr("2026/09/20"), "2026-09-20");
  assert.equal(toDateStr("2026-9-5"), "2026-09-05");
  assert.equal(toDateStr(" 2026.09.05 "), "2026-09-05");
  assert.equal(toDateStr("2026-13-45"), null);
  assert.equal(toDateStr(12345), null);
  assert.equal(toDateStr("hello"), null);
});

test("addDays / daysBetween are calendar arithmetic, safe across month, year and DST", () => {
  assert.equal(addDays("2026-09-29", 1), "2026-09-30");
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(addDays("2026-09-29", -7), "2026-09-22");
  assert.equal(addDays("bad", 1), null);
  assert.equal(daysBetween("2026-09-28", "2026-09-29"), 1);
  assert.equal(daysBetween("2026-09-29", "2026-09-28"), -1);
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.ok(Number.isNaN(daysBetween("x", "2026-01-01")));
  // 夏時間の切り替わりをまたいでもずれない(ロンドン: 3/29 と 10/25 に切替)
  const london = inTZ("Europe/London", `return [
    u.addDays("2026-03-28", 1), u.addDays("2026-03-29", 1), u.daysBetween("2026-03-28", "2026-03-30"),
    u.addDays("2026-10-24", 1), u.addDays("2026-10-25", 1), u.daysBetween("2026-10-20", "2026-10-30"),
  ];`);
  assert.deepEqual(london, ["2026-03-29", "2026-03-30", 2, "2026-10-25", "2026-10-26", 10]);
});

test("weekdayMon / mondayOf use Monday-start weeks", () => {
  assert.equal(weekdayMon("2026-09-28"), 0); // 月
  assert.equal(weekdayMon("2026-10-04"), 6); // 日
  assert.equal(mondayOf("2026-09-29"), "2026-09-28");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  const jst = inTZ("Asia/Tokyo", `return u.mondayOf("2026-09-28");`);
  assert.equal(jst, "2026-09-28");
});

test("formatJaDate / formatShortDate", () => {
  assert.equal(formatJaDate("2026-09-29"), "9/29(火)");
  assert.equal(formatJaDate("2026-10-04"), "10/4(日)");
  assert.equal(formatJaDate("2026-01-05", { withYear: true }), "2026/1/5(月)");
  assert.equal(formatJaDate("nope"), "");
  assert.equal(formatShortDate("2026-06-01"), "6/1");
  assert.equal(inTZ("Pacific/Kiritimati", `return u.formatJaDate("2026-09-29");`), "9/29(火)");
});

test("escapeHtml escapes all five special characters and tolerates non-strings", () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml(123), "123");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("numRange is float-safe and inclusive", () => {
  assert.deepEqual(numRange(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(numRange(0.5, 2, 0.5), [0.5, 1, 1.5, 2]);
  const tenths = numRange(0, 1, 0.1);
  assert.equal(tenths.length, 11);
  assert.equal(tenths[3], 0.3);
  assert.equal(tenths[10], 1);
  const plates = numRange(12.5, 200, 2.5);
  assert.equal(plates[0], 12.5);
  assert.equal(plates[plates.length - 1], 200);
  assert.equal(plates.length, 76);
  assert.ok(plates.every((v) => Number.isInteger(v * 2)));
  assert.deepEqual(numRange(25, 100, 25), [25, 50, 75, 100]);
  assert.deepEqual(numRange(5, 1), []);
  assert.deepEqual(numRange(1, 5, 0), []);
});

test("clamp / roundTo / formatNum", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(roundTo(83.333, 1), 83.3);
  assert.equal(roundTo(1.25, 1), 1.3);
  assert.equal(formatNum(1250), "1,250");
  assert.equal(formatNum(62.5), "62.5");
  assert.equal(formatNum(NaN), "");
});

test("uid returns unique, attribute-safe ids", () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(uid());
  assert.equal(ids.size, 5000);
  for (const id of [...ids].slice(0, 50)) assert.match(id, /^[a-z0-9-]+$/);
});

test("util.js is pure (no DOM / storage access at import)", () => {
  const src = fileURLToPath(new URL("../js/util.js", import.meta.url));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(src)});`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
