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

async function newPage(browser, vp, state, errors, tag) {
  const ctx = await browser.newContext({ viewport: vp });
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
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const srv = await serve();
  const BASE = `http://localhost:${srv.address().port}/ap-study/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const errors = [];
  const VPS = [['pc', { width: 1100, height: 900 }], ['sp', { width: 390, height: 844 }]];

  // ---- A. はじめての利用者: 使い方 → 今日のメニュー → 教材 → 一問一答 → 次のユニットへ ----
  for (const [tag, vp] of VPS) {
    const { ctx, page } = await newPage(browser, vp, null, errors, tag);
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    ok(await page.locator('.intro-card').count() === 1, `${tag}: はじめての人には使い方を表示`);
    const tasks = await page.locator('.task-row .tr-label').allInnerTexts();
    ok(tasks[0].startsWith('教材を') && tasks.some((t) => t.startsWith('用語カード 10枚')), `${tag}: 最初のメニューは「教材」と「用語カード10枚」`, tasks);
    ok(await page.locator('details.part-card[open]').count() === 1 && await page.locator('.unit-row.is-next').count() === 1,
      `${tag}: 学習中のパートだけ開き、「次はここ」は1か所だけ`);
    if (tag === 'pc') await page.screenshot({ path: path.join(OUT, `${tag}-home-new.png`), fullPage: true });
    await page.click('#today-start');
    await page.waitForSelector('#view-lesson .lesson-toc');
    const tocN = await page.locator('.lesson-toc [data-sec]').count();
    const secN = await page.locator('#view-lesson .lesson-section').count();
    ok(tocN === secN && tocN > 0, `${tag}: 教材の目次が全${secN}節を指している`);
    await page.locator('.lesson-toc [data-sec]').last().click();
    await page.waitForTimeout(600);
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
    ok((await page.locator('#view-lesson .lesson-title').innerText()) === '論理演算・シフト演算と誤り検出', `${tag}: 次のユニットの教材が開く`);
    await page.evaluate(() => App.goHome());
    const unitRow = await page.locator('.task-row[data-act="unit"] .tr-sub').innerText();
    ok(/今日 1/.test(unitRow) || await page.locator('.task-row[data-act="unit"].is-done').count() === 1, `${tag}: 今日進めたユニット数がメニューに反映`, unitRow);
    ok(await page.locator('.intro-card').count() === 0, `${tag}: 学習を始めたら使い方は表示しない`);
    await ctx.close();
  }

  // ---- B. 学習途中の利用者: 復習(自信なし・解き直し)→ 弱点ドリル → 用語カード → 成績 ----
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

  // ---- C. 試験日程(CBT): 申込み案内 → 科目A当日 → 科目B期 → 終了 ----
  const at = async (iso, prefs) => {
    const { ctx, page } = await newPage(browser, { width: 1000, height: 900 }, null, errors, iso);
    await page.clock.setFixedTime(new Date(iso));
    if (prefs) await page.addInitScript((p) => { localStorage.setItem('ap-study-v1', JSON.stringify({ v: 2, deviceId: 'dc', counters: {}, prefs: p, prefsAt: 1 })); }, prefs);
    await page.goto(BASE);
    await page.waitForSelector('.today-card');
    return { ctx, page };
  };
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
    const { ctx, page } = await at('2027-03-16T09:00:00');
    ok((await page.locator('.today-card').innerText()).includes('試験日を過ぎました'), '科目Bの日を過ぎたら終了の案内');
    await ctx.close();
  }

  ok(errors.length === 0, 'ページのエラーなし', errors);
  await browser.close();
  srv.close();
  console.log(`\n${failures ? `✗ ${failures}件の失敗` : '✓ すべて合格'}(スクリーンショット: ${OUT})`);
  process.exitCode = failures ? 1 : 0;
})();
