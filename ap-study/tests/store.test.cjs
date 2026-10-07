// js/storage.js の単体テスト(同期のマージ・間隔反復・今日の記録・用語カード)。
// 実行: node --test ap-study/tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const DAY = 86400000;
// vm の中で作られたオブジェクトはプロトタイプが別なので、比較の前に素のオブジェクトへ変換する
const plain = (x) => JSON.parse(JSON.stringify(x));

// localStorage の代わりにメモリを使い、Store を新しく読み込む
function freshStore(init) {
  const mem = new Map(init ? [['ap-study-v1', JSON.stringify(init)]] : []);
  const ctx = {
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
    Date, Math, JSON, Object, Array, Set, String, Number, console,
  };
  vm.createContext(ctx);
  vm.runInContext(`${SRC}\nthis.Store = Store;`, ctx);
  return { Store: ctx.Store, mem };
}
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('今日の記録(logAct)は種類ごとに数え、全端末分を合計する', () => {
  const { Store } = freshStore();
  Store.logAct('review', 6);
  Store.logAct('drill');
  Store.logAct('drill');
  assert.deepEqual(plain(Store.actsToday()), { review: 6, drill: 2 });
  // 別の端末の記録をマージすると合計される(何度マージしても二重に数えない)
  const other = Store.snapshot();
  other.deviceId = 'phone';
  other.counters = { phone: { answers: {}, reasons: {}, days: {}, acts: { [`${ymd(Date.now())}|review`]: 4 } } };
  const merged = Store.mergeStates(Store.snapshot(), other);
  Store.applyState(Store.mergeStates(merged, other));
  assert.equal(Store.actsToday().review, 10);
});

test('自信がなかった問題は、正解でも明日もう一度出る(正誤の記録は変えない)', () => {
  const { Store } = freshStore();
  Store.srsReview('q1', true);
  Store.srsReview('q1', true); // reps 2(次は3日後)
  Store.markWrong('q1', false);
  Store.srsUnsure('q1');
  const s = Store.srsState('q1');
  assert.equal(s.reps, 0);
  assert.ok(Math.abs(s.due - (Date.now() + DAY)) < 5000);
  assert.deepEqual(plain(Store.wrongIds()), []);
});

test('今日の復習キューは、期限切れが古い順に上限まで', () => {
  const now = Date.now();
  const { Store } = freshStore({
    v: 2, deviceId: 'd1', counters: { d1: { answers: {}, reasons: {}, days: {} } },
    srs: { a: { reps: 1, interval: 1, due: now - 1 * DAY }, b: { reps: 1, interval: 1, due: now - 5 * DAY },
      c: { reps: 1, interval: 1, due: now - 3 * DAY }, d: { reps: 1, interval: 3, due: now + DAY } },
  });
  assert.deepEqual(plain(Store.reviewQueue(['a', 'b', 'c', 'd', 'x'], 2)), ['b', 'c']);
  assert.deepEqual(plain(Store.reviewQueue(['a', 'b', 'c', 'd'])), ['b', 'c', 'a']);
});

test('用語カード: 覚えた → 1日後・3日後…、まだ → 箱0で今すぐ。旧方式の「覚えた」は箱1扱い', () => {
  const { Store } = freshStore({ v: 2, deviceId: 'd1', cards: { 'basics:旧カード': true }, counters: {} });
  assert.equal(Store.cardState('basics:旧カード').box, 1);
  assert.equal(Store.isCardKnown('basics:旧カード'), true);
  let s = Store.cardReview('basics:新', true);
  assert.equal(s.box, 1);
  assert.ok(Math.abs(s.due - (Date.now() + DAY)) < 5000);
  s = Store.cardReview('basics:新', true);
  assert.equal(s.box, 2);
  assert.ok(Math.abs(s.due - (Date.now() + 3 * DAY)) < 5000);
  s = Store.cardReview('basics:新', false);
  assert.equal(s.box, 0);
  assert.ok(s.due <= Date.now());
  assert.equal(Store.isCardKnown('basics:新'), false);
});

test('用語カードのマージは「最後に回答した方」を採用する(別端末の「まだ」が消えない)', () => {
  const { Store } = freshStore();
  const a = Store.snapshot();
  const b = Store.snapshot();
  a.cardSrs = { k: { box: 4, due: 100, at: 1000 } };
  b.cardSrs = { k: { box: 0, due: 50, at: 2000 } };
  assert.equal(Store.mergeStates(a, b).cardSrs.k.box, 0);
  assert.equal(Store.mergeStates(b, a).cardSrs.k.box, 0);
});

test('ユニットの初回クリア時刻は保たれ、マージでは早い方を採用する', () => {
  const { Store } = freshStore();
  Store.setUnitResult('u1', 3, 6, false);
  assert.equal(Store.unitState('u1').clearedAt, undefined);
  Store.setUnitResult('u1', 6, 6, true);
  const first = Store.unitState('u1').clearedAt;
  assert.ok(first > 0);
  Store.setUnitResult('u1', 5, 6, true);
  assert.equal(Store.unitState('u1').clearedAt, first);
  const a = Store.snapshot(), b = Store.snapshot();
  b.units.u1.clearedAt = first - 1000;
  assert.equal(Store.mergeStates(a, b).units.u1.clearedAt, first - 1000);
});

test('マージは何度適用しても結果が変わらない(冪等)', () => {
  const { Store } = freshStore();
  Store.recordAnswer('basics', true);
  Store.studyTick();
  Store.logAct('cards', 3);
  Store.cardReview('basics:x', true);
  const a = Store.snapshot();
  const b = JSON.parse(JSON.stringify(a));
  b.deviceId = 'other';
  b.counters = { other: { answers: { basics: { c: 2, t: 3 } }, reasons: {}, days: {}, acts: {} } };
  const once = Store.mergeStates(a, b);
  const twice = Store.mergeStates(once, b);
  assert.deepEqual(plain(twice), plain(once));
});

test('旧データ(v1)は移行され、acts と cardSrs の器が用意される', () => {
  const { Store } = freshStore({ answers: { basics: { correct: 3, total: 5 } }, wrong: ['q9'], streak: { lastDay: ymd(Date.now()), current: 2, todayCount: 4 } });
  assert.deepEqual(plain(Store.answerStats().basics), { correct: 3, total: 5 });
  assert.deepEqual(plain(Store.wrongIds()), ['q9']);
  Store.logAct('review');
  assert.equal(Store.actsToday().review, 1);
  assert.equal(Store.cardState('none'), null);
});
