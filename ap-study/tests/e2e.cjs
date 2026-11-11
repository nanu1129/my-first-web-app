// マナビットのE2Eテスト(CommonJS)。リポジトリを内蔵サーバで配信し、Chromiumで主な学習の流れを確かめる。
// 実行: NODE_PATH=$(npm root -g) node ap-study/tests/e2e.cjs [出力先ディレクトリ]
// Chromium の場所は環境変数 CHROMIUM_PATH で指定できる(既定: /opt/pw-browsers/chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'manabit-e2e'));
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(REPO, p);
      if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

let failures = 0;
const ok = (cond, msg, detail) => {
  if (cond) console.log('✓', msg);
  else { failures += 1; console.log('✗', msg, detail === undefined ? '' : JSON.stringify(detail)); }
};

const DAY = 86400000;
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 10ユニットを終え、復習が6問たまっている利用者
function seeded(now) {
  const units = {};
  ['basics-1', 'basics-2', 'basics-3', 'basics-4', 'basics-5', 'computer-1', 'computer-2', 'computer-3', 'computer-4', 'computer-5']
    .forEach((u, i) => { units[u] = { cleared: true, best: 5, total: 6, at: now - (12 - i) * DAY, clearedAt: now - (12 - i) * DAY }; });
  const srs = {};
  ['chk-basics-1-0', 'chk-basics-2-1', 'chk-basics-3-2', 'chk-basics-4-0', 'chk-basics-5-1', 'chk-computer-1-2']
    .forEach((q) => { srs[q] = { reps: 1, interval: 1, due: now - 3600000 }; });
  const days = {};
  for (let i = 1; i < 6; i++) days[ymd(now - i * DAY)] = 15;
  return {
    v: 2, deviceId: 'dtest', units, partExams: {}, cases: {}, cards: {}, cardSrs: {}, srs, lastWrong: {}, lastRight: {}, history: [],
    counters: { dtest: { answers: { basics: { c: 40, t: 50 }, computer: { c: 20, t: 40 } }, reasons: {}, days, acts: {} } },
    prefs: { planStart: ymd(now - 18 * DAY), goal: 20 }, prefsAt: now,
  };
}

// 通常のテストは本物のFirebaseにつながず、同期を未設定の状態で動かす(同期のテストは fakeCloud を使う)
const NO_SYNC = 'window.AP_FIREBASE_CONFIG = { apiKey: "", authDomain: "", projectId: "", appId: "" };';
async function newPage(browser, vp, state, errors, tag) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  await ctx.route('**/js/firebase-config.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: NO_SYNC }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e} @ ${(e.stack || '').split('\n').slice(1, 3).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|net::|Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
  if (state) await page.addInitScript((s) => { if (!localStorage.getItem('ap-study-v1')) localStorage.setItem('ap-study-v1', JSON.stringify(s)); }, state);
  return { ctx, page };
}

// 表示中の問題に答える(correct=false なら不正解の選択肢を選ぶ)
async function answer(page, correct) {
  const q = await page.evaluate(() => { const c = Quiz.current(); return c && { a: c.answer }; });
  const i = correct ? q.a : (q.a + 1) % 4;
  await page.click(`#view-quiz .choice[data-i="${i}"]`);
}
async function finishQuiz(page, pattern) {
  for (let n = 0; ; n++) {
    if (!(await page.locator('#view-quiz .choice').count())) break;
    await answer(page, pattern(n));
    const next = page.locator('#quiz-next-btn');
    if (await next.count()) await next.click();
  }
}
// ---- 端末間同期のテスト用: gstatic の Firebase SDK を差し替える偽物と、テスト内の「クラウド」 ----
const FAKE_SDK = `(() => {
  const listeners = [];
  let user = null;
  try { user = JSON.parse(sessionStorage.getItem('__fakeUser') || 'null'); } catch (e) { user = null; }
  const authObj = {
    setPersistence: () => Promise.resolve(),
    onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(user), 0); return () => {}; },
    async signInWithPopup() {
      user = { uid: 'u1', email: 'tester@example.com' };
      sessionStorage.setItem('__fakeUser', JSON.stringify(user));
      listeners.forEach((cb) => cb(user));
      return { user };
    },
    async signOut() { user = null; sessionStorage.removeItem('__fakeUser'); listeners.forEach((cb) => cb(null)); },
    getRedirectResult: () => Promise.resolve(null),
  };
  const auth = () => authObj;
  auth.GoogleAuthProvider = function GoogleAuthProvider() {};
  auth.Auth = { Persistence: { LOCAL: 'local' } };
  const subs = {};
  const snapOf = (d) => ({ exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) });
  window.__fbDeliver = (path, d) => (subs[path] || []).forEach((cb) => cb(snapOf(d)));
  const ref = (path) => ({
    _path: path,
    get: async () => snapOf((await window.__fbRead(path)).data),
    set: async (d) => { await window.__fbCommit(null, null, [[path, JSON.parse(JSON.stringify(d))]]); },
    onSnapshot(cb) {
      (subs[path] = subs[path] || []).push(cb);
      window.__fbSub(path).then(() => window.__fbRead(path)).then((r) => cb(snapOf(r.data)));
      return () => { subs[path] = subs[path].filter((x) => x !== cb); };
    },
  });
  const store = {
    collection: (c) => ({ doc: (id) => ref(c + '/' + id) }),
    async runTransaction(fn) {
      for (let i = 0; i < 5; i++) {
        let readPath = null, readVer = null;
        const writes = [];
        const tx = {
          get: async (r) => { const x = await window.__fbRead(r._path); readPath = r._path; readVer = x.ver; return snapOf(x.data); },
          set: (r, d) => { writes.push([r._path, JSON.parse(JSON.stringify(d))]); },
        };
        const res = await fn(tx);
        if (await window.__fbCommit(readPath, readVer, writes)) return res;
      }
      throw Object.assign(new Error('aborted'), { code: 'aborted' });
    },
  };
  window.firebase = { initializeApp: (c) => ({ c }), auth, firestore: () => store };
})();`;

// Firestoreの制約(入れ子の配列・undefined・1MB)を確かめながら、文書を保存して購読中の端末へ配る
function fakeCloud() {
  const docs = new Map();
  const subs = new Map();
  const problems = [];
  let writes = 0;
  const check = (v, where) => {
    if (v === undefined) problems.push(`undefined: ${where}`);
    else if (Array.isArray(v)) v.forEach((x, i) => { if (Array.isArray(x)) problems.push(`入れ子の配列: ${where}[${i}]`); check(x, `${where}[${i}]`); });
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => check(v[k], `${where}.${k}`));
  };
  return {
    problems, docs, writes: () => writes,
    async attach(ctx) {
      await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => r.fulfill({ contentType: 'text/javascript',
        body: r.request().url().endsWith('firebase-app-compat.js') ? FAKE_SDK : '' }));
      await ctx.route('**/js/firebase-config.js*', (r) => r.fulfill({ contentType: 'text/javascript',
        body: "window.AP_FIREBASE_CONFIG = { apiKey: 'k', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'a' };" }));
      await ctx.exposeBinding('__fbRead', (src, path) => (docs.get(path) || { data: null, ver: 0 }));
      await ctx.exposeBinding('__fbSub', (src, path) => { if (!subs.has(path)) subs.set(path, new Set()); subs.get(path).add(src.page); });
      await ctx.exposeBinding('__fbCommit', (src, readPath, readVer, list) => {
        if (readPath && (docs.get(readPath) || { ver: 0 }).ver !== readVer) return false; // 読んだあとに別の端末が書いた → やり直し
        list.forEach(([path, data]) => {
          check(data, path);
          if (JSON.stringify(data).length > 1000000) problems.push(`1MB超: ${path}`);
          const ver = (docs.get(path) || { ver: 0 }).ver + 1;
          docs.set(path, { data, ver });
          writes += 1;
          setTimeout(() => (subs.get(path) || new Set()).forEach((pg) => {
            pg.evaluate(([p, d]) => window.__fbDeliver && window.__fbDeliver(p, d), [path, data]).catch(() => {});
          }), 30);
        });
        return true;
      });
    },
  };
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const srv = await serve();
  const BASE = `http://localhost:${srv.address().port}/ap-study/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const errors = [];
  const VPS = [['pc', { width: 1100, height: 900 }], ['sp', { width: 390, height: 844 }]];

  // 環境変数 E2E_ONLY=A,C のように指定すると、その区分だけを実行する(開発中の確認用)
  const only = (process.env.E2E_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
  const section = async (key, fn) => { if (!only.length || only.includes(key)) await fn(); };
  // 日時を固定して開く(試験日程・計画のテスト用)
  const at = async (iso, prefs) => {
    const { ctx, page } = await newPage(browser, { width: 1000, height: 900 }, null, errors, iso);
    await page.clock.setFixedTime(new Date(iso));
    if (prefs) await page.addInitScript((p) => { localStorage.setItem('ap-study-v1', JSON.stringify({ v: 2, deviceId: 'dc', counters: {}, prefs: p, prefsAt: 1 })); }, prefs);
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    return { ctx, page };
  };

  // ---- A. はじめての利用者: 使い方 → 今日のメニュー → 教材 → 一問一答 → 次のユニットへ ----
  await section('A', async () => {
  for (const [tag, vp] of VPS) {
    const { ctx, page } = await newPage(browser, vp, null, errors, tag);
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    ok(await page.locator('.intro-card').count() === 1, `${tag}: はじめての人には使い方を表示`);
    const tasks = await page.locator('.task-row .tr-label').allInnerTexts();
    ok(tasks[0].startsWith('Udemy §2「情報システム開発」') && tasks.some((t) => t.startsWith('用語カード 10枚')), `${tag}: 最初のメニューは「Udemy §2 → 一問一答」と「用語カード10枚」`, tasks);
    ok(await page.locator('details.part-card[open]').count() === 1 && await page.locator('.unit-row.is-next').count() === 1,
      `${tag}: 学習中のパートだけ開き、「次はここ」は1か所だけ`);
    if (tag === 'pc') await page.screenshot({ path: path.join(OUT, `${tag}-home-new.png`), fullPage: true });
    await page.click('#today-start');
    await page.waitForSelector('#view-lesson .lesson-toc');
    const tocN = await page.locator('.lesson-toc [data-sec]').count();
    const secN = await page.locator('#view-lesson .lesson-section').count();
    ok(tocN === secN && tocN > 0, `${tag}: 教材の目次が全${secN}節を指している`);
    await page.locator('.lesson-toc [data-sec]').last().click();
    // なめらかなスクロールが終わるまで待つ(かかる時間はブラウザの版や距離で変わる)
    await page.waitForFunction(() => document.querySelector('#view-lesson .lesson-section:last-of-type').getBoundingClientRect().top < 300, null, { timeout: 4000 }).catch(() => {});
    const lastTop = await page.evaluate(() => document.querySelector('#view-lesson .lesson-section:last-of-type').getBoundingClientRect().top);
    ok(lastTop < 300, `${tag}: 目次を押すとその節へ移動する`, lastTop);
    ok(await page.locator('.lesson-summary').count() === 1 && !(await page.locator('.lesson-summary').getAttribute('open')), `${tag}: 要点まとめは閉じた状態で置かれている`);
    ok(await overflow(page) <= 0, `${tag}: 教材ページで横はみ出しなし`);
    await page.click('#lesson-to-check');
    await finishQuiz(page, () => true);
    const nextBtn = page.locator('#view-quiz [data-action="0"]');
    ok((await nextBtn.innerText()).startsWith('次のユニットへ'), `${tag}: 合格すると「次のユニットへ」が主ボタンになる`);
    await nextBtn.click();
    await page.waitForSelector('#view-lesson .lesson-title');
    ok((await page.locator('#view-lesson .lesson-title').innerText()) === '設計手法とオブジェクト指向', `${tag}: 講座の順で次のユニットの教材が開く`);
    await page.evaluate(() => App.goHome());
    const unitRow = await page.locator('.task-row[data-act="unit"] .tr-sub').innerText();
    ok(/今日 1/.test(unitRow) || await page.locator('.task-row[data-act="unit"].is-done').count() === 1, `${tag}: 今日進めたユニット数がメニューに反映`, unitRow);
    ok(await page.locator('.intro-card').count() === 0, `${tag}: 学習を始めたら使い方は表示しない`);
    await ctx.close();
  }
  });

  // ---- B. 学習途中の利用者: 復習(自信なし・解き直し)→ 弱点ドリル → 用語カード → 成績 ----
  await section('B', async () => {
  for (const [tag, vp] of VPS) {
    const { ctx, page } = await newPage(browser, vp, seeded(Date.now()), errors, tag);
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    if (tag === 'sp') await page.screenshot({ path: path.join(OUT, `${tag}-home-seeded.png`) });
    const first = await page.locator('.task-row').first().locator('.tr-label').innerText();
    ok(first === '今日の復習 6問', `${tag}: 復習がメニューの先頭`, first);
    ok((await page.locator('#today-start').innerText()).includes('今日の復習 6問'), `${tag}: 開始ボタンは最初の未完了タスク`);
    await page.click('#today-start');
    await page.waitForSelector('#view-quiz .choice');
    ok(await page.locator('.quiz-count').innerText().then((t) => t.includes('/ 6')), `${tag}: 復習は期限が来た6問`);
    // 1問目: 正解 → 自信がなかった
    const q1 = await page.evaluate(() => Quiz.current().qid);
    await answer(page, true);
    await page.click('#unsure-btn');
    const s1 = await page.evaluate((id) => Store.srsState(id), q1);
    ok(s1.reps === 0 && s1.due > Date.now() + 0.9 * DAY, `${tag}: 自信がなかった問題は明日もう一度`, s1);
    const rc = await page.evaluate(() => Store.reasonCounts());
    ok(Object.keys(rc).length === 0, `${tag}: 「自信がなかった」は間違いの理由として記録しない`, rc);
    await page.click('#quiz-next-btn');
    // 残り: 1問だけ不正解
    await finishQuiz(page, (n) => n !== 1);
    const retry = page.locator('#result-retry-wrong');
    ok(await retry.count() === 1 && (await retry.innerText()).includes('1問だけ'), `${tag}: 結果から「間違えた1問だけ解き直す」`);
    ok(await page.locator('.rv-lesson').count() === 1, `${tag}: 間違えた一問一答に「教材で確認」`);
    await retry.click();
    ok(await page.locator('.quiz-count').innerText().then((t) => t.includes('/ 1')), `${tag}: 解き直しは間違えた問題だけ`);
    await finishQuiz(page, () => true);
    await page.click('#result-back');
    await page.waitForSelector('.today-card');
    ok(await page.locator('.task-row[data-act="review"].is-done').count() === 1, `${tag}: 復習を終えるとメニューに完了の印`);
    // 弱点ドリル(正答率50%のコンピュータシステム)
    const weak = page.locator('.task-row[data-act="weak"]');
    ok((await weak.locator('.tr-label').innerText()).includes('コンピュータシステム'), `${tag}: 弱点ドリルは正答率が低い分野`);
    await weak.click();
    await page.waitForSelector('#view-quiz .choice');
    const parts = new Set();
    for (let n = 0; n < 10; n++) {
      parts.add(await page.evaluate(() => Quiz.current().partId));
      await answer(page, true);
      await page.click('#quiz-next-btn');
    }
    ok(parts.size === 1 && parts.has('computer'), `${tag}: 弱点ドリル10問はすべてその分野から`, [...parts]);
    await page.click('#result-back');
    await page.waitForSelector('.today-card');
    ok(await page.locator('.task-row[data-act="weak"].is-done').count() === 1, `${tag}: 弱点ドリルも完了の印`);
    // 用語カード
    await page.locator('.task-row[data-act="cards"]').click();
    await page.waitForSelector('#flashcard');
    const left0 = await page.locator('.card-counter').innerText();
    ok(left0.startsWith('残り 10 枚'), `${tag}: 今日のカードは新しい用語10枚`, left0);
    ok(!(await page.locator('.term-details').getAttribute('open')), `${tag}: 用語一覧は折りたたまれている`);
    await page.click('#flashcard');
    await page.click('#card-no');
    ok((await page.locator('.card-counter').innerText()).startsWith('残り 10 枚'), `${tag}: 「まだ」のカードは後ろに回って残る`);
    for (let n = 0; n < 10; n++) await page.click('#card-yes');
    ok(await page.locator('.cards-empty .ce-title').innerText().then((t) => t.includes('完了')), `${tag}: 10枚すべて覚えたら今日のカードは完了`);
    ok(await overflow(page) <= 0, `${tag}: 用語カードで横はみ出しなし`);
    const cardHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    ok(cardHeight < 2600, `${tag}: 用語カードの画面が長すぎない`, cardHeight);
    // 新しいカードの上限(1日10枚)
    await page.evaluate(() => App.navigate('cards'));
    ok((await page.locator('.seg-tab').first().innerText()).includes('(0枚)'), `${tag}: 新しいカードは1日10枚まで`);
    // 成績
    await page.evaluate(() => App.navigate('stats'));
    ok(await page.locator('.acc-row').count() === 8, `${tag}: 分野別正答率は8分野の横棒`);
    ok(await overflow(page) <= 0, `${tag}: 成績で横はみ出しなし`);
    if (tag === 'sp') await page.screenshot({ path: path.join(OUT, `${tag}-stats.png`), fullPage: true });
    await page.evaluate(() => App.goHome());
    ok(await overflow(page) <= 0, `${tag}: ホームで横はみ出しなし`);
    if (tag === 'sp') await page.screenshot({ path: path.join(OUT, `${tag}-home-done.png`) });
    await ctx.close();
  }
  });

  // ---- C. 試験日程(CBT): 申込み案内 → 科目A当日 → 科目B期 → 終了 ----
  await section('C', async () => {
  {
    const { ctx, page } = await at('2026-10-07T09:00:00', { examDate: '2027-02-21' });
    const label = await page.locator('.countdown').innerText();
    ok(label.includes('科目Aまで') && label.includes('122') && label.includes('2月6日'), '旧版の既定日(2/21)は科目Aの初日(2/6)に読み替える', label);
    ok(await page.locator('.apply-line').count() === 0, '申込み案内は申込開始の3週間前まで出さない');
    await page.click('.plan-detail summary');
    ok(await page.inputValue('#exam-b-date') === '2027-03-03', '科目Bの既定日は後期の初日(3/3)');
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-01-28T09:00:00');
    ok(await page.locator('.task-row').first().locator('.tr-label').innerText().then((t) => t.startsWith('受験の申込み')), '申込期間中はメニューの先頭に申込み');
    ok(await page.locator('.apply-line.is-open').count() === 1, '申込期間中は案内を強調');
    await page.screenshot({ path: path.join(OUT, 'apply.png') });
    await page.click('#apply-done');
    ok(await page.locator('.task-row[data-act="apply"]').count() === 0 && (await page.locator('.apply-line .pill').innerText()) === '申込み済み', '「申込み済み」にするとタスクが消える');
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-02-06T07:00:00');
    ok((await page.locator('.countdown').innerText()).includes('今日は'), '科目Aの当日は「今日は 科目A」');
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-02-20T09:00:00');
    const cd = await page.locator('.countdown').innerText();
    ok(cd.includes('科目Bまで') && cd.includes('11'), '科目Aのあとは科目Bまでのカウントダウン', cd);
    ok((await page.locator('.plan-phase').innerText()).includes('科目B 対策'), '科目Aのあとは「科目B 対策」の期間');
    const acts = await page.locator('.task-row').evaluateAll((r) => r.map((x) => x.dataset.act));
    ok(acts.includes('case') && acts.includes('trace') && !acts.includes('unit'), '科目B期のメニューは午後演習とトレース', acts);
    await ctx.close();
  }
  {
    // 演習期: 科目Bの分野を決める → 週1回の午後の過去問 → 記録すると完了
    const { ctx, page } = await at('2027-01-05T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06' });
    const acts0 = await page.locator('.task-row').evaluateAll((r) => r.map((x) => x.dataset.act));
    ok(acts0.includes('pmfields') && !acts0.includes('pmpast'), '演習期: 「科目Bで解く分野を決める」がメニューに出る', acts0);
    await page.click('.task-row[data-act="pmfields"]');
    await page.waitForSelector('#pm-fields');
    for (const f of ['db', 'nw', 'pm', 'sm', 'audit']) await page.click(`[data-field="${f}"]`);
    await page.click('[data-field="st"]');
    ok((await page.locator('#pm-fields .pm-msg').innerText()).includes('5分野') && await page.locator('.pf-chip.is-on').count() === 5,
      '科目B: 選べるのは5分野(4分野 + 予備)まで');
    await page.click('[data-field="audit"]');
    ok((await page.locator('.pm-count').innerText()).startsWith('4/4'), '科目B: 選んだ分野を外せる');
    await page.evaluate(() => App.goHome());
    const pmLabel = await page.locator('.task-row[data-act="pmpast"] .tr-label').innerText();
    ok(pmLabel.includes('令和7年度 秋期 問1(情報セキュリティ)'), '演習期: 午後の過去問は新しい回の問1から', pmLabel);
    await page.click('.task-row[data-act="pmpast"]');
    await page.waitForSelector('#pm-form');
    ok(await page.inputValue('#pm-exam') === 'r07a' && await page.inputValue('#pm-field') === 'sec', '科目B: メニューから開くと、その1問が記録欄で選ばれている');
    await page.fill('#pm-score', '70');
    await page.click('#pm-form button[type="submit"]');
    ok(await page.inputValue('#pm-field') === 'nw' && (await page.locator('.pm-next').innerText()).includes('問5(ネットワーク)'),
      '科目B: 記録すると、同じ回の次の分野(問5)へ進む');
    await page.click('[data-pm="r06a|db"]');
    ok(await page.inputValue('#pm-exam') === 'r06a' && await page.inputValue('#pm-field') === 'db', '科目B: 表のマスを押すと、その回・その問題を選べる');
    await page.fill('#pm-score', '40');
    await page.click('#pm-form button[type="submit"]');
    ok(await page.locator('.pp-cell.ng[data-pm="r06a|db"]').count() === 1 && await page.locator('.pp-cell.ok[data-pm="r07a|sec"]').count() === 1,
      '科目B: 60%以上と未満で色分けして表示');
    ok(await overflow(page) <= 0, '科目B: 午後演習の画面で横はみ出しなし');
    await page.evaluate(() => App.goHome());
    ok(await page.locator('.task-row[data-act="pmpast"].is-done').count() === 1, '演習期: 今日記録したら午後の過去問は完了');
    await page.clock.setFixedTime(new Date('2027-01-08T09:00:00'));
    await page.evaluate(() => App.goHome());
    ok(await page.locator('.task-row[data-act="pmpast"]').count() === 0, '演習期: 午後の過去問は週に1回(3日後は出ない)');
    await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
    await page.evaluate(() => App.goHome());
    ok(await page.locator('.task-row[data-act="pmpast"]').count() === 1, '演習期: 1週間たつと次の午後の過去問');
    await ctx.close();
  }
  {
    // 科目B期: 毎日の午後の過去問と、選んだ分野(+必須のセキュリティ)の午後演習
    const { ctx, page } = await at('2027-02-20T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06', pmFields: ['db', 'nw', 'pm', 'sm'] });
    const rows = await page.locator('.task-row').evaluateAll((r) => r.map((x) => `${x.dataset.act}:${x.dataset.id || ''}`));
    ok(rows.some((r) => r.startsWith('pmpast:r07a-1')) && rows.includes('case:case-sec'), '科目B期: 午後の過去問と、セキュリティの午後演習が毎日のメニューに', rows);
    await page.evaluate(() => { ['case-sec', 'case-sec2'].forEach((id) => Store.setCaseResult(id, 80, true)); App.goHome(); });
    const next = await page.locator('.task-row[data-act="case"]').getAttribute('data-id');
    ok(next === 'case-nw', '科目B期: 次の午後演習は、選んだ分野の問題番号の順(ネットワーク)', next);
    await ctx.close();
  }
  {
    // ペースの目安: 10/1に始めて 2/6 に科目A。11/4 時点で8ユニット(Udemyの順で最初の8つ)を終えた人
    const { ctx, page } = await at('2026-11-04T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06' });
    // (at() は読み込みのたびに記録を初期化するので、再読み込みせずに記録を差し替えて描き直す)
    await page.evaluate(() => {
      const now = Date.now();
      const st = Store.snapshot();
      st.units = {};
      Order.units().slice(0, 8).forEach((u, i) => { st.units[u.id] = { cleared: true, best: 5, total: 6, at: now - (8 - i) * 86400000, clearedAt: now - (8 - i) * 86400000 }; });
      Store.applyState(st);
      App.goHome();
    });
    await page.waitForSelector('#pace-box');
    const paceText = (await page.locator('#pace-box').innerText()).replace(/\s+/g, ' ');
    ok(paceText.includes('予定より 11ユニット 遅れ') && paceText.includes('19 / 35ユニット') && paceText.includes('§9「データベース」まで'),
      'ペースの目安: 今日までの目安(19ユニット・Udemy §9まで)と遅れを表示', paceText.slice(0, 160));
    ok(paceText.includes('週 7 ユニット') && paceText.includes('12/4 までに一周') && paceText.includes('今週(11/8 日曜まで)の目標: あと 5ユニット'),
      'ペースの目安: これからのペース(週7ユニット)と今週の目標', paceText.slice(160, 360));
    ok(paceText.includes('一周は 12/22ごろ') && paceText.includes('1日の量を少し増やしましょう'), 'ペースの目安: 最近のペースのままだと間に合わないことを知らせる');
    await page.clock.setFixedTime(new Date('2027-01-05T09:00:00'));
    await page.evaluate(() => {
      const st = Store.snapshot();
      Order.units().forEach((u) => { st.units[u.id] = { cleared: true, best: 5, total: 6, at: 1, clearedAt: 1 }; });
      st.prefs.udemyWatched = { 14: Date.now() - 6 * 86400000, 15: Date.now() - 3 * 86400000 };
      Store.applyState(st);
      App.goHome();
    });
    await page.waitForSelector('#pace-box');
    const drillText = (await page.locator('#pace-box').innerText()).replace(/\s+/g, ' ');
    ok(drillText.includes('過去問が 8回 遅れ') && drillText.includes('2 / 10回') && drillText.includes('3日に 1回'),
      'ペースの目安(演習期): 過去問の目安の回数と、残りを解く間隔', drillText.slice(0, 200));
    await ctx.close();
  }
  {
    // 1日に使える時間: 設定すると、その時間に収まる分が「今日やること」、残りは「時間があれば」になる
    const { ctx, page } = await at('2026-11-11T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06' });
    await page.evaluate(() => {
      const st = Store.snapshot();
      Order.units().slice(0, 8).forEach((u, i) => { st.units[u.id] = { cleared: true, best: 5, total: 6, at: Date.now() - (9 - i) * 86400000, clearedAt: Date.now() - (9 - i) * 86400000 }; });
      Store.applyState(st);
      App.goHome();
    });
    const acts = () => page.evaluate(() => ({
      core: [...document.querySelectorAll('.task-row:not(.is-extra)')].map((r) => r.dataset.act).join(),
      extra: [...document.querySelectorAll('.task-row.is-extra')].map((r) => r.dataset.act).join(),
      count: document.querySelector('.tm-count').textContent,
    }));
    const a0 = await acts();
    ok(a0.core === 'unit,part,weak,cards' && a0.extra === '' && (await page.locator('.pace-budget').innerText()).includes('1日に使える時間を設定すると'),
      '使える時間が未設定: これまでどおり全部が今日のメニュー。設定の案内を表示', a0);
    await page.click('.pace-budget [data-open-plan]');
    ok(await page.locator('.plan-detail[open] #plan-budget').count() === 1, '「時間を設定する」で、設定欄が開く');
    await page.selectOption('[data-budget="weekday"]', '60');
    const a1 = await acts();
    ok(a1.core === 'unit,cards' && a1.extra === 'part,weak' && a1.count.startsWith('0/2 完了'), '平日60分: 教材と用語カードが今日やること、演習とドリルは「時間があれば」', a1);
    ok((await page.locator('.tm-budget').innerText()).includes('平日は 60分'), '今日の設定(平日60分)をメニューの下に表示');
    await page.selectOption('[data-budget="holiday"]', '180');
    const bl = (await page.locator('.pace-budget').innerText()).replace(/\s+/g, ' ');
    ok(bl.includes('平日60分・土日180分') && /教材の一周は \d+\/\d+ごろ/.test(bl), 'ペースの目安: 設定した時間で一周がいつになるかを表示', bl);
    await page.selectOption('[data-budget="weekday"]', '90');
    const a2 = await acts();
    ok(a2.core === 'unit,part,weak,cards' && a2.extra === '', '平日90分にすると、演習とドリルも今日やることに入る', a2);
    // 土日(3時間): 1週間に必要な数を時間の比で割りふるので、教材は複数ユニット
    await page.selectOption('[data-budget="weekday"]', '60');
    await page.clock.setFixedTime(new Date('2026-11-14T09:00:00'));
    await page.evaluate(() => App.goHome());
    const satUnit = await page.locator('.task-row[data-act="unit"] .tr-label').innerText();
    ok(/一問一答 [23]ユニット/.test(satUnit) && (await page.locator('.tm-budget').innerText()).includes('土日は 3時間'), '土日(3時間): 教材は平日より多く進める', satUnit);
    // 演習期: 過去問(約150分)は、平日60分の日には出さず、時間の取れる土日に出す
    await page.clock.setFixedTime(new Date('2027-01-06T09:00:00'));
    await page.evaluate(() => {
      const st = Store.snapshot();
      Order.units().forEach((u) => { st.units[u.id] = { cleared: true, best: 5, total: 6, at: 1, clearedAt: 1 }; });
      Store.applyState(st);
      App.goHome();
    });
    const wed = await acts();
    ok(!(`${wed.core},${wed.extra}`).split(',').includes('udemy'), '演習期の平日(60分): 過去問は出さない', wed);
    ok((await page.locator('.pace-budget').innerText()).includes('時間の取れる日'), '演習期: 過去問を時間の取れる日に入れていることを表示');
    await page.clock.setFixedTime(new Date('2027-01-09T09:00:00'));
    await page.evaluate(() => App.goHome());
    const sat = await acts();
    ok(sat.core.split(',').includes('udemy'), '演習期の土日(3時間): 過去問が今日やることに入る', sat);
    await ctx.close();
  }
  {
    // カレンダーに登録: 申込期間・科目A/B・毎日の学習(.ics と Googleカレンダーのリンク)
    const { ctx, page } = await at('2026-11-04T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-08' });
    await page.click('.plan-detail summary');
    await page.fill('#study-time', '21:30');
    await page.locator('#study-time').dispatchEvent('change');
    if (!(await page.locator('.plan-detail[open]').count())) await page.click('.plan-detail summary');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal-ics')]);
    const icsText = fs.readFileSync(await dl.path(), 'utf8');
    const lines = icsText.split('\r\n');
    const tooLong = lines.filter((l) => Buffer.byteLength(l, 'utf8') > 75);
    const unfolded = icsText.replace(/\r\n /g, '');
    ok(icsText.startsWith('BEGIN:VCALENDAR\r\n') && (icsText.match(/BEGIN:VEVENT/g) || []).length === 5 && tooLong.length === 0,
      'カレンダー: .ics に申込開始・締切・科目A・科目B・毎日の学習の5件(1行75バイト以内)', { n: (icsText.match(/BEGIN:VEVENT/g) || []).length, tooLong });
    ok(unfolded.includes('DTSTART;VALUE=DATE:20270208') && unfolded.includes('DTSTART;VALUE=DATE:20270216')
      && /DTSTART;TZID=Asia\/Tokyo:20261104T213000/.test(unfolded) && /RRULE:FREQ=DAILY;UNTIL=20270303T\d{6}Z/.test(unfolded),
      'カレンダー: 受験日・申込締切・毎日21:30(科目Bの日まで)が入る');
    const gl = await page.locator('.pcal-links a').evaluateAll((as) => as.map((a) => a.href));
    ok(gl.length === 5 && gl.some((h) => h.includes('recur=RRULE')) && gl.every((h) => h.startsWith('https://calendar.google.com/')),
      'カレンダー: Googleカレンダーに追加するリンク(5件)', gl.length);
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-03-16T09:00:00');
    ok((await page.locator('.today-card').innerText()).includes('試験日を過ぎました'), '科目Bの日を過ぎたら終了の案内');
    await ctx.close();
  }
  });

  // ---- D. Udemy講座の順序: 並び順の切替・対応表・過去問解説のタスク ----
  await section('D', async () => {
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, null, errors, 'udemy');
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    const partsOrder = await page.locator('details.part-card').evaluateAll((ds) => ds.map((d) => d.dataset.part));
    ok(partsOrder.join(',') === 'dev,management,basics,computer,database,network,security,strategy', 'Udemy順: 学習マップは講座の順', partsOrder);
    const basicsUnits = await page.locator('#part-basics .unit-row').evaluateAll((rs) => rs.map((r) => r.dataset.unit));
    ok(basicsUnits.join(',') === 'basics-3,basics-1,basics-2,basics-5,basics-4', 'Udemy順: 基礎理論はアルゴリズム → 基礎理論 → 応用数学の順', basicsUnits);
    ok((await page.locator('#part-dev .udemy-tag').first().innerText()) === 'Udemy §2', 'ユニットに対応するセクションを表示');
    await page.evaluate(() => Course.openLesson('basics-1'));
    ok((await page.locator('.udemy-banner').innerText()).includes('セクション7「基礎理論」'), '教材の冒頭に対応するセクションを表示');
    await page.evaluate(() => App.goHome());
    await page.click('#udemy-progress summary');
    await page.check('#udemy-progress input[data-sec="2"]');
    ok(await page.locator('#udemy-progress[open] .uc-item.is-watched').count() === 1 && (await page.locator('.uc-count').innerText()).includes('1/24'),
      '視聴チェックが記録され、カードは開いたまま');
    ok(await overflow(page) <= 0, 'Udemy講座の進み具合で横はみ出しなし');
    await page.selectOption('#order-mode', 'site');
    ok((await page.locator('.task-row[data-act="unit"] .tr-label').innerText()).startsWith('教材を') && await page.locator('#udemy-progress').count() === 0,
      'サイト標準に戻すと元の表示');
    ok(await page.locator('details.part-card').first().getAttribute('data-part') === 'basics', 'サイト標準: 基礎理論から');
    await ctx.close();
  }
  {
    // 演習期: 本物の過去問 → Udemyの解説を3日に1回
    const { ctx, page } = await at('2026-12-10T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06' });
    const label = () => page.locator('.task-row[data-act="udemy"] .tr-label').innerText();
    ok((await label()).includes('令和7年秋') && (await label()).includes('§14'), '演習期: 過去問(令和7年秋)→ Udemy §14 の解説');
    await page.locator('.task-row[data-act="udemy"]').click();
    ok(await page.locator('#udemy-progress[open]').count() === 1, 'タスクを押すと講座の進み具合が開く');
    await page.check('#udemy-progress input[data-sec="14"]');
    ok(await page.locator('.task-row[data-act="udemy"].is-done').count() === 1, 'チェックすると今日のタスクに完了の印');
    await page.clock.setFixedTime(new Date('2026-12-11T09:00:00'));
    await page.evaluate(() => App.goHome());
    ok(await page.locator('.task-row[data-act="udemy"]').count() === 0, '翌日は過去問を休む(3日に1回)');
    await page.clock.setFixedTime(new Date('2026-12-14T09:00:00'));
    await page.evaluate(() => App.goHome());
    ok((await label()).includes('§15'), '3日たつと次の過去問(§15)');
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-01-20T09:00:00', { planStart: '2026-10-01', examDate: '2027-02-06' });
    const acts = await page.locator('.task-row').evaluateAll((r) => r.map((x) => x.dataset.act));
    ok(acts.includes('udemy') && !acts.includes('mock'), '仕上げ期も、過去問が残っている間はサイトの模試より過去問を優先', acts);
    await ctx.close();
  }
  {
    const { ctx, page } = await at('2027-02-20T09:00:00');
    ok((await page.locator('.task-row[data-act="udemy"] .tr-label').innerText()).includes('§24'), '科目B期: Udemy §24(午後問題対策用 小問題)');
    await ctx.close();
  }
  });

  // ---- E. 本番形式の模試(CBT)・本物の過去問の記録・暗記タブ・午後演習の2カラム・追加ユニット ----
  await section('E', async () => {
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, seeded(Date.now()), errors, 'cbt');
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    const answered = () => page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('ap-study-v1'));
      return Object.values(st.counters).reduce((n, c) => n + Object.values(c.answers || {}).reduce((m, a) => m + a.t, 0), 0);
    });
    const before = await answered();
    await page.click('#main-nav [data-nav="exam"]');
    await page.click('.exam-option[data-plan="0"]');
    await page.waitForSelector('#view-quiz .cbt-no');
    // 問1は、いったん選んでから「不正解の選択肢」に選び直す(結果の見直しに必ず出るように)
    const ans1 = await page.evaluate(() => Quiz.current().answer);
    const first = ans1 === 0 ? 1 : 0;
    let wrong1 = (ans1 + 1) % 4;
    if (wrong1 === first) wrong1 = (ans1 + 2) % 4;
    await page.click(`#view-quiz .choice[data-i="${first}"]`);
    await page.click(`#view-quiz .choice[data-i="${wrong1}"]`);
    const picked = await page.locator('#view-quiz .choice.is-picked').evaluateAll((cs) => cs.map((c) => c.dataset.i));
    ok(picked.join() === String(wrong1), '模試: 選び直すと解答が変わる(選択中は1つだけ)', picked);
    await page.click('#cbt-flag');
    ok((await page.locator('#cbt-flag').getAttribute('aria-pressed')) === 'true', '模試: 「後で見直す」の印を付けられる');
    await page.click('#cbt-next');
    ok((await page.locator('.cbt-no').innerText()).startsWith('問2'), '模試: 次の問題へ進む');
    await page.click('#view-quiz .choice[data-i="2"]');
    await page.click('#cbt-list');
    ok(await page.locator('.cbt-cell[data-go]').count() === 20 && await page.locator('.cbt-grid .cbt-cell.is-flag').count() === 1
      && await page.locator('.cbt-grid .cbt-cell.is-ans').count() === 2, '模試: 問題一覧に20問・解答済み2・見直し1');
    await page.click('.cbt-cell[data-go="9"]');
    ok((await page.locator('.cbt-no').innerText()).startsWith('問10'), '模試: 一覧から問10へ移動');
    await page.click('#cbt-prev');
    ok((await page.locator('.cbt-no').innerText()).startsWith('問9'), '模試: 前の問題へ戻る');
    await page.click('#cbt-end2');
    ok((await page.locator('.cbt-confirm').innerText()).includes('未解答 18問'), '模試: 終了の前に未解答の数を確認できる');
    await page.click('#cbt-submit');
    await page.waitForSelector('#view-quiz .time-analysis');
    ok(await answered() - before === 2, '模試: 採点では解答した2問だけを記録する', await answered() - before);
    ok((await page.locator('#view-quiz .rv-meta').allInnerTexts()).some((t) => t.includes('見直しの印あり')), '模試: 結果の見直しに「考えた時間」と印が出る');
    await page.screenshot({ path: path.join(OUT, 'sp-mock-result.png'), fullPage: true });
    // 20問の模試を2回: 1回目は全問解答 → 2回目は1回目と重ならない
    const takeMock = async (answerAll) => {
      await page.click('#main-nav [data-nav="exam"]');
      await page.click('.exam-option[data-plan="0"]');
      await page.waitForSelector('#view-quiz .cbt-no');
      const ids = [], srcs = [];
      for (let i = 0; i < 20; i++) {
        const q = await page.evaluate(() => { const c = Quiz.current(); return { qid: c.qid, src: c.source || '' }; });
        ids.push(q.qid);
        srcs.push(q.src);
        if (answerAll) await page.click('#view-quiz .choice[data-i="0"]');
        if (i < 19) await page.click('#cbt-next');
      }
      await page.click('#cbt-end');
      await page.click('#cbt-submit');
      await page.waitForSelector('#view-quiz .time-analysis');
      return { ids, srcs };
    };
    const m1 = await takeMock(true);
    const m2 = await takeMock(false);
    const dup = m2.ids.filter((id) => m1.ids.includes(id));
    ok(new Set(m1.ids).size === 20 && dup.length === 0, '模試: 2回目は、1回目に解いた問題と重ならない(最近解いていない問題から)', dup);
    ok(m1.srcs.some((t) => t.startsWith('一問一答')) && m1.srcs.some((t) => t.startsWith('科目A')), '模試: 本番レベルの問題に、教材の一問一答も混ざる', m1.srcs.slice(0, 6));
    // 成績: 間違えたままの問題が多いユニット → そのユニットだけ解き直す
    await page.click('#main-nav [data-nav="stats"]');
    const wu = await page.locator('.wu-row').count();
    ok(wu > 0, '成績: 間違えたままの問題が多いユニットを表示', wu);
    if (wu) {
      await page.locator('[data-wu-retry]').first().click();
      await page.waitForSelector('#view-quiz .choice');
      ok((await page.locator('#view-quiz').innerText()).includes('解き直し'), '成績: ユニットごとに、間違えた問題だけを解き直せる');
    }

    // スマホ: タブは画面の下に固定(フッタまで隠れずに読める)
    await page.evaluate(() => App.goHome());
    const navPos = await page.evaluate(() => {
      const n = document.getElementById('main-nav'), r = n.getBoundingClientRect();
      return { pos: getComputedStyle(n).position, bottom: Math.round(r.bottom), vh: innerHeight };
    });
    ok(navPos.pos === 'fixed' && navPos.bottom === navPos.vh, 'スマホ: タブは画面の下に固定', navPos);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footGap = await page.evaluate(() => document.getElementById('main-nav').getBoundingClientRect().top - document.querySelector('.site-footer').getBoundingClientRect().bottom);
    ok(footGap >= 0, 'スマホ: いちばん下までスクロールすると、フッタがタブに隠れない', footGap);
    // 本番レベル演習は、最近解いていない問題から最大20問(基礎理論は22問ある)
    await page.evaluate(() => { document.getElementById('part-basics').open = true; });
    await page.locator('.part-exam-row[data-part="basics"]').click();
    await page.waitForSelector('#view-quiz .quiz-count');
    ok((await page.locator('#view-quiz .quiz-count').innerText()).includes('/ 20'), '本番レベル演習: 1回は最大20問', await page.locator('#view-quiz .quiz-count').innerText());
    // 間違えると、関係する教材の要点をその場で開ける。結果の見直しからは、その節へ移動できる
    const rel = await page.evaluate(() => { const r = Relate.find(Quiz.current()); return r && r.sec ? { unit: r.unit.title, sec: r.sec.h, n: (r.sec.points || []).length } : null; });
    const wrongIdx = (await page.evaluate(() => Quiz.current().answer) + 1) % 4;
    await page.click(`#view-quiz .choice[data-i="${wrongIdx}"]`);
    if (rel) {
      await page.click('.rel-box summary');
      ok((await page.locator('.rel-where').innerText()).includes(rel.sec) && await page.locator('.rel-box li').count() === rel.n,
        '不正解のとき: 関係する教材の要点をその場で開ける', rel);
    } else ok(await page.locator('.rel-box').count() === 0, '不正解のとき: 対応する教材がない問題には何も出さない');
    await page.click('#quiz-next-btn');
    await finishQuiz(page, () => true);
    const rv = page.locator('.rv-lesson').first();
    if (rel) {
      ok((await rv.innerText()).includes(rel.sec), '結果の見直し: 関係する節の名前つきで「教材で確認」', await rv.innerText());
      await rv.click();
      await page.waitForSelector('#view-lesson .lesson-section.is-found');
      const jump = await page.evaluate(() => { const s = document.querySelector('#view-lesson .lesson-section.is-found'); return { h: s.querySelector('h3').textContent, top: Math.round(s.getBoundingClientRect().top) }; });
      ok(jump.h === rel.sec && jump.top >= 0 && jump.top < 200, '「教材で確認」: その節まで移動する', jump);
    }

    // 本物の過去問の得点(成績の記録欄・Udemyのカード)
    await page.click('#main-nav [data-nav="stats"]');
    ok((await page.inputValue('#past-id')) === 'r07a', '過去問: まだ記録のない一番新しい回(令和7年秋)が選ばれている');
    ok(await page.locator('#pm-panel').count() === 0, '成績: 科目Bの欄は、分野を決めるか記録するまで出さない');
    await page.fill('#past-score', '52');
    await page.click('#past-form button[type="submit"]');
    ok(await page.locator('.past-row').count() === 1 && (await page.inputValue('#past-id')) === 'r07s', '過去問: 記録すると一覧に出て、次の回が選ばれる');
    ok((await page.locator('.forecast-real').innerText()).includes('65点'), '過去問: 合格予測に本物の過去問の結果(52/80問 → 100点満点で65点)が出る');
    await page.evaluate(() => App.goHome());
    await page.click('#udemy-progress summary');
    await page.fill('input[data-past="r07s"]', '46');
    await page.locator('input[data-past="r07s"]').dispatchEvent('change');
    ok(await page.evaluate(() => Store.pastExams().map((r) => `${r.id}:${r.score}`).join()) === 'r07a:52,r07s:46', '過去問: Udemyのカードからも得点を記録できる');
    await page.click('#main-nav [data-nav="stats"]');
    page.once('dialog', (d) => d.accept());
    await page.click('.past-del[data-del="r07a"]');
    ok(await page.locator('.past-row').count() === 1, '過去問: 記録を削除できる');

    // 暗記タブ: 公式集(絞り込み・隠して思い出す・ドリルへ)と要点まとめ
    await page.click('#main-nav [data-nav="cards"]');
    await page.click('[data-section="formulas"]');
    const allF = await page.locator('.formula-card').count();
    await page.click('[data-fpart="computer"]');
    const compF = await page.locator('.formula-card').count();
    ok(allF >= 20 && compF > 0 && compF < allF, '公式集: 分野で絞り込める', [allF, compF]);
    await page.click('#fc-quiz');
    ok(!(await page.locator('.fc-formula').first().isVisible()), '公式集: 「隠して思い出す」で公式が隠れる');
    await page.locator('.fc-reveal').first().click();
    ok(await page.locator('.fc-formula').first().isVisible() && !(await page.locator('.fc-formula').nth(1).isVisible()), '公式集: タップしたカードだけ公式が見える');
    await page.click('[data-drill="cache"]');
    ok((await page.locator('#view-practice .chip.is-active').innerText()).includes('実効アクセス時間'), '公式集: 「ドリルで練習」で同じ公式の計算ドリルが開く');
    await page.click('#main-nav [data-nav="cards"]');
    await page.click('[data-section="points"]');
    const total = parseInt(await page.locator('.pt-count').innerText(), 10);
    await page.fill('#pt-search', 'RAID');
    await page.waitForTimeout(400);
    const hit = parseInt(await page.locator('.pt-count').innerText(), 10);
    ok(total > 300 && hit > 0 && hit < 10 && await page.locator('#pt-print').count() === 1, '要点まとめ: 全POINTを検索でき、印刷ボタンがある', [total, hit]);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'pt-search', '要点まとめ: 絞り込み中も入力欄から外れない');
    ok(await overflow(page) <= 0, '暗記タブで横はみ出しなし');
    // 用語カードの向き: 意味 → 用語(説明の中に出てくる用語そのものは伏せる)
    await page.click('[data-section="cards"]');
    await page.click('[data-dir="def"]');
    const face = await page.evaluate(() => ({
      quiz: !!document.querySelector('.card-face.front .cf-quiz'), term: !!document.querySelector('.card-face.front .cf-term'),
      back: document.querySelector('.card-face.back .cf-term').textContent, pref: Store.pref('cardDir'),
      mask: Cards.maskDef({ term: 'RTO / RPO', def: 'RTOは復旧までの目標時間、RPOはどの時点のデータまで戻すかの目標。' }),
    }));
    ok(face.quiz && !face.term && face.back.length > 0 && face.pref === 'def', '用語カード(意味 → 用語): 表に説明、裏に用語。向きは設定として残る', face);
    ok(face.mask === '〇〇は復旧までの目標時間、〇〇はどの時点のデータまで戻すかの目標。', '用語カード(意味 → 用語): 説明の中の用語は伏せる', face.mask);
    await page.click('[data-dir="term"]');
    ok(await page.locator('.card-face.front .cf-term').count() === 1, '用語カード: 向きを「用語 → 意味」に戻せる');
    // 成績: 科目B(午後)の過去問の分野別の平均
    await page.evaluate(() => { Plan.setPmChosen(['db', 'nw', 'pm', 'sm']); Store.setPmExam('r07a-1', 70); Store.setPmExam('r07a-5', 40); });
    await page.click('#main-nav [data-nav="stats"]');
    const pmText = (await page.locator('#pm-panel').innerText()).replace(/\s+/g, ' ');
    ok(pmText.includes('問1 情報セキュリティ') && pmText.includes('70%') && pmText.includes('全体の平均 55%') && pmText.includes('問10 サービスマネジメント'),
      '成績: 科目Bの過去問の分野別の平均を表示', pmText.slice(0, 200));
    ok(await overflow(page) <= 0, '成績(科目Bの欄あり)で横はみ出しなし');
    await page.click('#pm-open');
    ok(await page.locator('#pm-past #pm-form').count() === 1, '成績の科目Bの欄から、午後の過去問の記録へ移動できる');

    // 追加ユニット(労働・取引の法律と標準化)は、Udemy順で法務(strategy-3)の次
    const order = await page.evaluate(() => Order.unitsOfPart('strategy').map((u) => u.id).join());
    ok(order === 'strategy-1,strategy-2,strategy-3,strategy-6,strategy-4,strategy-5', '追加ユニットは企業会計と法務の次に並ぶ', order);
    await page.evaluate(() => Course.openLesson('strategy-6'));
    ok(await page.locator('#view-lesson figure[data-art="work-style"]').count() === 1 && await overflow(page) <= 0, '追加ユニットの教材が図解つきで開き、横はみ出しなし');
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, { width: 1366, height: 860 }, seeded(Date.now()), errors, 'case');
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    await page.evaluate(() => { App.navigate('practice'); Afternoon.start(AP.cases[0].id); });
    await page.waitForSelector('.case-layout .case-q');
    const lay = await page.evaluate(() => {
      const L = document.querySelector('.case-layout'), P = document.querySelector('.case-paper'), Q = document.querySelector('.case-q');
      return { cols: getComputedStyle(L).gridTemplateColumns.split(' ').length, sticky: getComputedStyle(P).position,
        side: Q.getBoundingClientRect().left > P.getBoundingClientRect().right, sw: document.documentElement.scrollWidth - innerWidth };
    });
    ok(lay.cols === 2 && lay.sticky === 'sticky' && lay.side && lay.sw <= 0, '午後演習(PC): 本文を左に固定し、設問を右に並べる', lay);
    await page.screenshot({ path: path.join(OUT, 'pc-case-2col.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.case-layout')).display) === 'block', '午後演習(スマホ): 1列で表示');
    await ctx.close();
  }
  });

  // ---- F. 端末間の同期: 未設定時のファイル移行、PCとスマホの自動同期(偽のFirebase) ----
  await section('F', async () => {
  {
    // 未設定: 雲アイコンのパネルに設定の案内と「記録を送る/読み込む」
    const a = await newPage(browser, { width: 390, height: 844 }, seeded(Date.now()), errors, 'sync-off');
    await a.page.goto(BASE);
    await a.page.waitForSelector('.today-card');
    await a.page.click('#sync-btn');
    ok(await a.page.locator('#sync-panel a[href*="SYNC-SETUP"]').count() === 1 && await a.page.locator('#sync-send').count() === 1,
      '未設定: 設定のしかたと「この端末の記録を送る」を表示');
    const box = await a.page.locator('#sync-panel').boundingBox();
    ok(box && box.x >= 0 && box.x + box.width <= 390, 'スマホ: 同期パネルが画面内に収まる', box);
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#sync-send')]);
    const file = path.join(OUT, 'sync-transfer.json');
    await dl.saveAs(file);
    const sent = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(sent.units && sent.units['basics-1'] && sent.units['basics-1'].cleared, '記録を送る: 学習記録のファイルができる(共有できない環境では保存)');
    const b = await newPage(browser, { width: 1100, height: 900 }, null, errors, 'sync-recv');
    await b.page.goto(BASE);
    await b.page.waitForSelector('.today-card');
    await b.page.click('#sync-btn');
    await b.page.setInputFiles('#sync-file', file);
    await b.page.waitForSelector('#sync-panel .sync-msg');
    ok(await b.page.evaluate(() => Store.isUnitCleared('basics-1')) && (await b.page.locator('#sync-panel .sync-msg').innerText()).includes('まとめ'),
      '受け取った記録を読み込む: もう一方の端末の記録が統合される');
    await a.ctx.close();
    await b.ctx.close();
  }
  {
    const cloud = fakeCloud();
    const now = Date.now();
    const device = async (tag, vp, st) => {
      const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true, serviceWorkers: 'block' });
      await cloud.attach(ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
      await page.addInitScript((x) => { if (!localStorage.getItem('ap-study-v1')) localStorage.setItem('ap-study-v1', JSON.stringify(x)); }, st);
      await page.goto(BASE);
      await page.waitForSelector('.today-card');
      return { ctx, page };
    };
    const login = async (page) => {
      await page.click('#sync-btn');
      await page.click('#sync-in');
      await page.waitForSelector('#sync-btn.is-on');
    };
    const until = async (page, fn, arg, ms = 8000) => {
      try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; }
    };
    const total = (page) => page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('ap-study-v1'));
      return Object.values(st.counters).reduce((n, c) => n + Object.values(c.answers || {}).reduce((m, x) => m + x.t, 0), 0);
    });
    // PC: 10ユニット・過去問1回・Udemy §2〜3。スマホ: 別に dev-1 と §4、学習開始日は今日(初めて開いた日)
    const pcState = seeded(now);
    pcState.pastExams = { r07a: { score: 52, total: 80, at: now - DAY } };
    pcState.prefs.udemyWatched = { 2: now - 3 * DAY, 3: now - 2 * DAY };
    pcState.prefs.examDate = '2027-02-06';
    const phoneState = {
      v: 2, deviceId: 'dphone', units: { 'dev-1': { cleared: true, best: 6, total: 6, at: now - DAY, clearedAt: now - DAY } },
      counters: { dphone: { answers: { dev: { c: 8, t: 10 } }, reasons: {}, days: { [ymd(now - DAY)]: 10 }, acts: {} } },
      prefs: { udemyWatched: { 4: now - DAY } }, prefsAt: now - DAY, prefsTs: { udemyWatched: now - DAY },
    };
    const pc = await device('sync-pc', { width: 1100, height: 900 }, pcState);
    const sp = await device('sync-sp', { width: 390, height: 844 }, phoneState);
    await login(pc.page);
    ok(cloud.docs.has('users/u1'), '同期: PCでログインすると、記録がクラウドに保存される');
    await login(sp.page);
    const spView = await sp.page.evaluate(() => ({
      basics: Store.isUnitCleared('basics-1'), dev: Store.isUnitCleared('dev-1'), watched: Object.keys(Order.watched()).sort().join(),
      past: Store.pastExams().map((r) => r.id).join(), start: Store.pref('planStart'), exam: Store.pref('examDate'),
    }));
    ok(spView.basics && spView.dev && spView.watched === '2,3,4' && spView.past === 'r07a' && spView.exam === '2027-02-06',
      '同期: スマホでログインすると、PCの記録と1つにまとまる', spView);
    ok(spView.start === pcState.prefs.planStart, '同期: 学習開始日は早い方(PCで始めた日)が残る', spView.start);
    ok(await until(pc.page, () => Store.isUnitCleared('dev-1') && !!Order.watched()[4]), '同期: スマホの記録がPCにも届く');
    ok(await total(pc.page) === 100 && await total(sp.page) === 100, '同期: 解答数は2台の合計(二重に数えない)', [await total(pc.page), await total(sp.page)]);
    // スマホでUdemy §5をチェック → PCに届く。PCで §3 を外す → スマホでも外れて、戻らない
    await sp.page.click('#sync-btn');
    await sp.page.evaluate(() => App.goHome());
    await sp.page.click('#udemy-progress summary');
    await sp.page.check('#udemy-progress input[data-sec="5"]');
    ok(await until(pc.page, () => !!Order.watched()[5]), '同期: スマホでのチェックがPCに届く');
    await pc.page.evaluate(() => Order.setWatched(3, false));
    ok(await until(sp.page, () => !Order.watched()[3]), '同期: PCでチェックを外すと、スマホでも外れる');
    ok(await until(sp.page, () => { const cb = document.querySelector('#udemy-progress input[data-sec="3"]'); return cb && !cb.checked; }),
      '同期: 受け取った変更が、開いている画面にもすぐ反映される');
    await sp.page.waitForTimeout(2500);
    ok(await sp.page.evaluate(() => !Order.watched()[3]) && await pc.page.evaluate(() => !Order.watched()[3]), '同期: 外したチェックが同期で復活しない');
    // 2台で同時に記録しても、どちらも残る(上書きで消えない)
    await Promise.all([
      pc.page.evaluate(() => Store.setPastExam('r07s', 50)),
      sp.page.evaluate(() => Store.setPastExam('r06a', 55)),
    ]);
    const both = () => ['r07a', 'r06a', 'r07s'].every((id) => Store.pastExams().some((r) => r.id === id));
    ok(await until(pc.page, both) && await until(sp.page, both), '同期: 2台で同時に記録しても両方とも残る');
    const cloudPast = Object.keys(cloud.docs.get('users/u1').data.state.pastExams).sort().join();
    ok(cloudPast === 'r06a,r07a,r07s', '同期: クラウドの記録にも両方が入っている', cloudPast);
    ok(cloud.problems.length === 0, '同期: Firestoreに保存できない形(入れ子の配列・undefined・1MB超)がない', cloud.problems.slice(0, 5));
    const w1 = cloud.writes();
    await pc.page.waitForTimeout(3000);
    ok(cloud.writes() === w1 && w1 < 40, '同期: 変更がないときは書き込みが止まる(端末どうしで送り合い続けない)', [w1, cloud.writes()]);
    await sp.page.click('#sync-btn');
    ok((await sp.page.locator('#sync-panel').innerText()).includes('tester@example.com'), '同期中はアカウントと状態を表示');
    await sp.page.screenshot({ path: path.join(OUT, 'sp-sync-on.png') });
    await sp.page.click('#sync-btn');

    // すべてリセット(同期中): PCで消すと、クラウドとスマホの記録も消え、同期で復活しない
    await pc.page.click('#main-nav [data-nav="stats"]');
    let asked = '';
    pc.page.once('dialog', (d) => { asked = d.message(); d.accept(); });
    await pc.page.click('#reset-all');
    ok(asked.includes('ほかの端末の記録も消えます'), 'リセット(同期中): ほかの端末の記録も消えることを確認してから実行する', asked);
    const emptyNow = () => Object.keys(Store.snapshot().units).length === 0 && Store.pastExams().length === 0;
    ok(await until(pc.page, emptyNow) && await until(sp.page, emptyNow), 'リセット(同期中): PCで消すと、スマホの記録も消える');
    await pc.page.waitForTimeout(3000);
    const cloudState = cloud.docs.get('users/u1').data.state;
    ok(Object.keys(cloudState.units || {}).length === 0 && await pc.page.evaluate(emptyNow) && await sp.page.evaluate(emptyNow),
      'リセット(同期中): しばらくたっても、同期で記録が復活しない', Object.keys(cloudState.units || {}));
    ok(await sp.page.locator('#sync-panel').isVisible() && (await sp.page.locator('#sync-panel').innerText()).includes('ほかの端末で「すべてリセット」が行われた'),
      'リセット(同期中): 消えた側の端末では、パネルが開いて理由を表示');
    // リセットのあとに学習した記録は、これまでどおり同期される
    await sp.page.evaluate(() => Store.setPastExam('r05a', 44));
    ok(await until(pc.page, () => Store.pastExams().some((r) => r.id === 'r05a')), 'リセット後: 新しい記録はこれまでどおり同期される');
    // 初めてログインする端末の記録は、リセット済みのアカウントでも消えずにまとまる
    const tabState = Object.assign({}, phoneState, { deviceId: 'dtab', counters: { dtab: phoneState.counters.dphone } });
    const tab = await device('sync-tab', { width: 820, height: 1000 }, tabState);
    await login(tab.page);
    const tabView = await tab.page.evaluate(() => ({ dev: Store.isUnitCleared('dev-1'), past: Store.pastExams().map((r) => r.id).join() }));
    ok(tabView.dev && tabView.past === 'r05a', '初めてログインする端末: 手元の記録は消えず、クラウドの記録とまとまる', tabView);
    ok(await until(pc.page, () => Store.isUnitCleared('dev-1')), '初めてログインした端末の記録が、ほかの端末にも届く');
    await tab.ctx.close();
    await pc.ctx.close();
    await sp.ctx.close();
  }
  });

  // ---- G. Service Worker: 2回目からはバージョン付きのファイルをキャッシュから読み、オフラインでも開ける ----
  await section('G', async () => {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/js/firebase-config.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: NO_SYNC }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`sw: ${e}`));
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    await page.reload();
    await page.waitForSelector('.today-card');
    const fromSw = [];
    page.on('response', (r) => { if (/\/js\/app\.js\?v=/.test(r.url())) fromSw.push(r.fromServiceWorker()); });
    await page.reload();
    await page.waitForSelector('.today-card');
    ok(fromSw.length > 0 && fromSw.every(Boolean), '2回目からは、バージョン付きのファイルをService Workerのキャッシュから読む', fromSw);
    srv.close();
    if (srv.closeAllConnections) srv.closeAllConnections();
    await page.reload().catch(() => {});
    ok(await page.waitForSelector('.today-card', { timeout: 10000 }).then(() => true).catch(() => false), 'サーバに接続できなくても(オフライン)、前回の内容で開ける');
    await ctx.close();
  }

  });

  ok(errors.length === 0, 'ページのエラーなし', errors);
  await browser.close();
  srv.close(); // 念のため(G でも止めている)
  console.log(`\n${failures ? `✗ ${failures}件の失敗` : '✓ すべて合格'}(スクリーンショット: ${OUT})`);
  process.exitCode = failures ? 1 : 0;
})();
