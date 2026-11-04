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

test('過去問の得点: マージは記録の新しい方を採用し、削除も別の端末に伝わる', () => {
  const { Store } = freshStore();
  const now = Date.now();
  Store.setPastExam('r07a', 46);
  Store.setPastExam('r07s', 40);
  // スマホでは r07a を後から記録し直し、r06a も記録していた
  const phone = plain(Store.snapshot());
  phone.deviceId = 'phone';
  phone.pastExams = { r07a: { score: 52, total: 80, at: now + 60000 }, r06a: { score: 55, total: 80, at: now - 60000 } };
  Store.applyState(Store.mergeStates(Store.snapshot(), phone));
  assert.deepEqual(plain(Store.pastExams()).map((r) => `${r.id}:${r.score}`).sort(), ['r06a:55', 'r07a:52', 'r07s:40']);
  // PCで r07s を削除 → 古い記録をもつ端末と何度マージしても復活しない
  Store.removePastExam('r07s');
  const old = plain(phone);
  old.pastExams = { r07s: { score: 40, total: 80, at: now - 120000 } };
  const m1 = Store.mergeStates(Store.snapshot(), old);
  Store.applyState(Store.mergeStates(m1, old));
  assert.deepEqual(plain(Store.pastExams()).map((r) => r.id).sort(), ['r06a', 'r07a']);
});

test('設定のマージ: 項目ごとに新しい方。学習開始日は早い方、Udemyの視聴チェックはセクションごと(解除も伝わる)', () => {
  const { Store } = freshStore();
  const now = Date.now();
  const pc = {
    prefs: { examDate: '2027-02-06', planStart: '2026-10-01', goal: 20, udemyWatched: { 2: now - 5000, 3: now - 4000 } },
    prefsAt: now - 4000, prefsTs: { examDate: now - 9000, planStart: now - 90000, goal: now - 9000, udemyWatched: now - 4000 },
  };
  // スマホ: 試験日をあとから変更、初めて開いた日が学習開始日、§3のチェックを外して§4をチェック
  const phone = {
    prefs: { examDate: '2027-02-13', planStart: '2026-11-02', recall: true, udemyWatched: { 3: -(now - 1000), 4: now - 2000 } },
    prefsAt: now - 1000, prefsTs: { examDate: now - 8000, planStart: now - 1000, recall: now - 3000, udemyWatched: now - 1000 },
  };
  const m = Store.mergeStates(pc, phone);
  assert.equal(m.prefs.examDate, '2027-02-13');
  assert.equal(m.prefs.planStart, '2026-10-01');
  assert.equal(m.prefs.goal, 20);
  assert.equal(m.prefs.recall, true);
  assert.deepEqual(plain(m.prefs.udemyWatched), { 2: now - 5000, 3: -(now - 1000), 4: now - 2000 });
  // 逆向きにマージしても、何度マージしても同じ結果
  assert.deepEqual(plain(Store.mergeStates(phone, pc).prefs), plain(m.prefs));
  assert.deepEqual(plain(Store.mergeStates(m, phone).prefs), plain(m.prefs));
  assert.deepEqual(plain(Store.mergeStates(pc, m).prefs), plain(m.prefs));
});

test('設定のマージ: 項目の時刻がない旧データは、最終更新時刻(prefsAt)で比べる', () => {
  const { Store } = freshStore();
  const old = { prefs: { goal: 30, courseOrder: 'site' }, prefsAt: 1000 };
  const cur = { prefs: { goal: 20 }, prefsAt: 2000, prefsTs: { goal: 500 } };
  const m = Store.mergeStates(old, cur);
  assert.equal(m.prefs.goal, 30); // 旧データの 1000 > 新データの項目時刻 500
  assert.equal(m.prefs.courseOrder, 'site');
  assert.equal(m.prefsAt, 2000);
});

test('setPref は項目ごとの変更時刻を記録する', () => {
  const { Store } = freshStore();
  const t0 = Date.now();
  Store.setPref('goal', 25);
  const snap = plain(Store.snapshot());
  assert.ok(snap.prefsTs.goal >= t0 && snap.prefsAt === snap.prefsTs.goal);
});

test('科目Bの過去問の記録: 端末間では新しい記録(削除を含む)を採用し、午前の記録とは別に数える', () => {
  const { Store } = freshStore();
  const now = Date.now();
  Store.setPmExam('r07a-1', 70);
  Store.setPastExam('r07a', 52);
  const phone = plain(Store.snapshot());
  phone.deviceId = 'phone';
  phone.pmExams = { 'r07a-1': { score: 80, at: now + 60000 }, 'r07a-6': { score: 55, at: now - 60000 } };
  Store.applyState(Store.mergeStates(Store.snapshot(), phone));
  assert.deepEqual(plain(Store.pmExams()).map((r) => `${r.id}:${r.score}`).sort(), ['r07a-1:80', 'r07a-6:55']);
  assert.deepEqual(plain(Store.pastExams()).map((r) => r.id), ['r07a']);
  Store.removePmExam('r07a-6');
  const m = Store.mergeStates(Store.snapshot(), phone);
  assert.deepEqual(plain(m.pmExams['r07a-6']).deleted, true);
  assert.equal(Store.lastSeen('nothing'), 0);
});
