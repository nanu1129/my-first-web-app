// 教材・問題データの整合性チェック。index.html が読み込むデータと図解をそのまま読み込んで検証する。
// 実行: node --test ap-study/tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/src="((?:data|js)\/[^"?]+)/g)].map((m) => m[1]);
const ctx = { console, Math, JSON, Date };
ctx.window = ctx;
vm.createContext(ctx);
// データと図解(SVGの文字列を作るだけでDOMは使わない)を読み込む
for (const f of scripts.filter((s) => s.startsWith('data/') || /^js\/art\d?\.js$/.test(s))) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const AP = vm.runInContext('AP', ctx);
const widgetIds = [...fs.readFileSync(path.join(ROOT, 'js', 'widgets.js'), 'utf8')
  .matchAll(/^ {4}'?([a-z][a-z0-9-]*)'?: \{\s*\n\s+render\(/gm)].map((m) => m[1]);

const units = AP.lessons.flatMap((l) => l.units.map((u) => Object.assign({ partId: l.partId }, u)));
const allQ = [
  ...units.flatMap((u) => u.checks.map((c, i) => Object.assign({ src: `chk-${u.id}-${i}` }, c))),
  ...AP.questions.map((q, i) => Object.assign({ src: `${q.partId}-${i}` }, q)),
];

test('教材の追記(lessons-plus / lessons-deep)がすべて適用されている', () => {
  const errs = AP.lessonPatchErrors || [];
  assert.equal(errs.length, 0, `適用できなかった追記: ${errs.join(' / ')}`);
});

test('全ユニットにたとえ・本文・確認テストがあり、図解かハンズオンがある', () => {
  for (const u of units) {
    assert.ok(u.story, `${u.id}: たとえ話がない`);
    assert.ok(u.sections.length >= 2, `${u.id}: 節が少ない`);
    u.sections.forEach((s) => assert.ok(s.body && s.h, `${u.id}: 本文か見出しがない`));
    assert.ok(u.checks.length >= 5, `${u.id}: 確認テストが5問未満`);
    assert.ok(u.sections.some((s) => s.art || s.widget), `${u.id}: 図解もハンズオンもない`);
  }
});

test('教材が参照する図解とハンズオンはすべて存在する', () => {
  const missingArt = units.flatMap((u) => u.sections.filter((s) => s.art && !AP.art[s.art]).map((s) => `${u.id}:${s.art}`));
  const missingWidget = units.flatMap((u) => u.sections.filter((s) => s.widget && !widgetIds.includes(s.widget)).map((s) => `${u.id}:${s.widget}`));
  assert.equal(missingArt.length, 0, `存在しない図解: ${missingArt}`);
  assert.equal(missingWidget.length, 0, `存在しないハンズオン: ${missingWidget}`);
  for (const [id, art] of Object.entries(AP.art)) {
    assert.ok(art.frames.length >= 1 && art.frames.every((f) => f.svg.includes('<svg') && f.cap), `図解 ${id} のコマが不正`);
  }
});

test('問題はすべて4択で、正解の位置・解説がそろっている', () => {
  for (const q of allQ) {
    assert.equal(q.choices.length, 4, `${q.src}: 選択肢が4つでない`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.src}: answer が範囲外`);
    assert.equal(new Set(q.choices).size, 4, `${q.src}: 同じ選択肢がある`);
    assert.ok(q.exp && q.exp.length >= 10, `${q.src}: 解説がない`);
    assert.ok(q.q && q.q.length >= 8, `${q.src}: 問題文が短すぎる`);
  }
});

test('問題文の重複がない', () => {
  const seen = new Map();
  for (const q of allQ) {
    assert.ok(!seen.has(q.q), `${q.src} と ${seen.get(q.q)} の問題文が同じ`);
    seen.set(q.q, q.src);
  }
});

test('例題には問題文と答えがあり、表は見出しと行の列数がそろっている', () => {
  for (const u of units) {
    for (const s of u.sections) {
      if (s.example) assert.ok(s.example.q && s.example.a, `${u.id}/${s.h}: 例題が不完全`);
      for (const t of s.tables || (s.table ? [s.table] : [])) {
        t.rows.forEach((r) => assert.equal(r.length, t.head.length, `${u.id}/${s.h}: 表の列数が合わない`));
      }
    }
  }
});

test('用語は重複がなく、午後演習の設問がそろっている', () => {
  const keys = AP.terms.map((t) => `${t.partId}:${t.term}`);
  assert.equal(new Set(keys).size, keys.length, '用語が重複している');
  for (const c of AP.cases) {
    assert.ok(c.questions.length >= 3, `${c.id}: 設問が少ない`);
    for (const q of c.questions) {
      if (q.type === 'write') assert.ok(q.model && q.keywords && q.keywords.length, `${c.id}: 記述式の解答例かキーワードがない`);
      else assert.ok(q.choices && q.answer >= 0 && q.answer < q.choices.length, `${c.id}: 選択式の正解が不正`);
    }
  }
});
