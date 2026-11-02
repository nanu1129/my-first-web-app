// クイズエンジン: 一問一答 / 本番レベル演習 / 模擬試験 で共通利用
const Quiz = (() => {
  const KEYS = ['ア', 'イ', 'ウ', 'エ'];
  let state = null;
  let timerId = null;

  const $view = () => document.getElementById('view-quiz');

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 選択肢の並びを出題ごとにシャッフルした問題を返す(正解位置の偏り・位置の暗記を防ぐ)。
  // 数値だけの選択肢は本試験と同じく小さい順のまま残す。
  function isNumericChoices(choices) {
    return choices.every((c) => /^[−\-]?[\d.,]+\s*(倍|回|通り|秒|ビット|ナノ秒|万円|百万円|台|%|個|日|MIPS)?$/.test(String(c).trim()));
  }
  function withShuffledChoices(q) {
    if (!q.choices || q.fixedOrder || isNumericChoices(q.choices)) return q;
    const order = shuffle(q.choices.map((_, i) => i));
    return Object.assign({}, q, {
      choices: order.map((i) => q.choices[i]),
      answer: order.indexOf(q.answer),
    });
  }

  // config: { title, questions, mode: 'check'|'practice'|'mock',
  //           passRate, timeLimitSec, backLabel, onBack, onFinish }
  function start(config) {
    stopTimer();
    config = Object.assign({}, config, { questions: config.questions.map(withShuffledChoices) });
    state = {
      cfg: config,
      idx: 0,
      answers: [], // { picked, correct }
      startedAt: Date.now(),
      remainSec: config.timeLimitSec || 0,
      recall: Store.pref('recall', false),
      revealed: false,
    };
    if (config.mode === 'mock') {
      // 本番のCBTと同じく、答えはいつでも変えられ、前後の問題へ自由に移動できる
      const n = config.questions.length;
      Object.assign(state, { picks: Array(n).fill(null), flags: new Set(), times: Array(n).fill(0), enteredAt: Date.now(), panel: null, done: false });
    }
    App.show('quiz');
    if (config.timeLimitSec) startTimer();
    renderQuestion();
  }

  function startTimer() {
    timerId = setInterval(() => {
      state.remainSec -= 1;
      const el = document.getElementById('quiz-timer');
      if (el) {
        el.textContent = fmtTime(state.remainSec);
        el.classList.toggle('is-warn', state.remainSec <= 60);
      }
      if (state.remainSec <= 0) {
        stopTimer();
        finish(true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function fmtTime(sec) {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.max(0, sec) % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function header() {
    const { cfg, idx } = state;
    const total = cfg.questions.length;
    const pct = (idx / total) * 100;
    return `
      <div class="quiz-top">
        <span class="quiz-top-label">${esc(cfg.title)}</span>
        ${cfg.timeLimitSec
          ? `<span class="quiz-timer" id="quiz-timer">${fmtTime(state.remainSec)}</span>`
          : ''}
        <span class="quiz-count">${idx + 1} / ${total} 問</span>
      </div>
      <div class="quiz-progress"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>`;
  }

  function renderQuestion() {
    if (state.cfg.mode === 'mock') { renderCbt(); return; }
    const { cfg, idx } = state;
    const q = cfg.questions[idx];
    // 想起モード(模試以外): 選択肢を隠し、答えを思い出してから開く
    const recall = state.recall && cfg.mode !== 'mock';
    const hidden = recall && !state.revealed;
    const toggle = cfg.mode !== 'mock'
      ? `<button class="recall-toggle ${state.recall ? 'on' : ''}" id="recall-toggle" role="switch" aria-checked="${state.recall}">
           <span class="rt-dot"></span>想起モード</button>`
      : '';

    $view().innerHTML = `
      <div class="quiz-shell">
        ${header()}
        <div class="q-card">
          <div class="q-card-top">${q.source ? `<span class="q-source">${esc(q.source)}</span>` : '<span></span>'}${toggle}</div>
          <p class="q-text">${esc(q.q)}</p>
          ${hidden
            ? `<div class="recall-prompt">
                 <p>答えを頭に思い浮かべてから、選択肢を開こう。<br><span class="rp-sub">思い出そうとするほど記憶に定着します。</span></p>
                 <button class="btn btn-primary" id="recall-reveal">選択肢を見る</button>
               </div>`
            : `<div class="choices">
                ${q.choices.map((c, i) => `
                  <button class="choice" data-i="${i}">
                    <span class="choice-key">${KEYS[i]}</span><span>${esc(c)}</span>
                  </button>`).join('')}
              </div>`}
          <div id="quiz-feedback"></div>
        </div>
        <div class="quiz-next">
          <span class="kbd-hint">キーボード: 1〜4キーで解答 ・ Enterキーで次へ</span>
          <button class="btn btn-ghost" id="quiz-quit">${esc(cfg.backLabel || 'やめる')}</button>
        </div>
      </div>`;

    $view().querySelectorAll('.choice').forEach((btn) => {
      btn.addEventListener('click', () => pick(Number(btn.dataset.i)));
    });
    const reveal = document.getElementById('recall-reveal');
    if (reveal) reveal.addEventListener('click', () => { state.revealed = true; renderQuestion(); });
    const tg = document.getElementById('recall-toggle');
    if (tg) tg.addEventListener('click', () => {
      state.recall = !state.recall;
      Store.setPref('recall', state.recall);
      renderQuestion();
    });
    document.getElementById('quiz-quit').addEventListener('click', quit);
  }

  function pick(i) {
    if (!state || state.answers.length > state.idx) return; // 二重回答ガード
    const { cfg, idx } = state;
    const q = cfg.questions[idx];
    const correct = i === q.answer;
    state.answers.push({ picked: i, correct });
    if (q.partId) Store.recordAnswer(q.partId, correct);
    if (q.qid) {
      Store.markWrong(q.qid, !correct); // 復習リストの追加/解除
      Store.srsReview(q.qid, correct);  // 間隔反復スケジュール更新
    }
    Store.studyTick();                  // 学習ストリーク・今日の学習数

    // 即時フィードバック(一問一答・本番レベル演習)
    $view().querySelectorAll('.choice').forEach((btn, bi) => {
      btn.disabled = true;
      if (bi === q.answer) btn.classList.add('is-correct');
      else if (bi === i && !correct) btn.classList.add('is-wrong');
    });
    const last = idx + 1 >= cfg.questions.length;
    const reasons = !correct
      ? `<div class="reason-box">
           <span class="reason-label">なぜ間違えた?(記録して弱点を分析)</span>
           <div class="reason-chips">
             <button class="reason-chip" data-r="careless">ケアレスミス</button>
             <button class="reason-chip" data-r="knowledge">知識不足</button>
             <button class="reason-chip" data-r="guess">あてずっぽう</button>
           </div>
         </div>`
      : '';
    // 正解でも自信がなければ、間隔反復で明日もう一度出す(まぐれ当たりを定着と見なさない)
    const unsure = correct && q.qid
      ? `<div class="unsure-box">
           <button class="reason-chip" id="unsure-btn">自信がなかった(まぐれ)</button>
           <span class="unsure-note">押すと、明日もう一度出題します</span>
         </div>`
      : '';
    document.getElementById('quiz-feedback').innerHTML = `
      <div class="feedback ${correct ? 'ok' : 'ng'}">
        <p class="feedback-head">${correct ? '正解!この調子!' : `残念、不正解… 正解は「${KEYS[q.answer]}」。解説を読んで整理しよう`}</p>
        <p class="feedback-exp">${esc(q.exp || '')}</p>
        ${reasons}${unsure}
      </div>`;
    const unsureBtn = document.getElementById('unsure-btn');
    if (unsureBtn) unsureBtn.addEventListener('click', () => {
      Store.srsUnsure(q.qid);
      unsureBtn.classList.add('on');
      unsureBtn.disabled = true;
      unsureBtn.nextElementSibling.textContent = '明日もう一度出題します';
    });
    $view().querySelectorAll('.reason-box .reason-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        Store.addReason(chip.dataset.r);
        const box = chip.closest('.reason-box');
        box.querySelectorAll('.reason-chip').forEach((c) => { c.classList.remove('on'); c.disabled = true; });
        chip.classList.add('on');
        box.querySelector('.reason-label').textContent = '記録しました。次に活かそう。';
      });
    });
    const nextWrap = $view().querySelector('.quiz-next');
    nextWrap.innerHTML = `<button class="btn btn-primary" id="quiz-next-btn">${last ? '結果を見る' : '次の問題へ'}</button>`;
    const btn = document.getElementById('quiz-next-btn');
    btn.addEventListener('click', next);
    btn.focus();
  }

  function next() {
    state.idx += 1;
    state.revealed = false;
    if (state.idx >= state.cfg.questions.length) finish(false);
    else renderQuestion();
  }

  function quit() {
    stopTimer();
    const cb = state.cfg.onBack;
    state = null;
    if (cb) cb();
  }

  function finish(timeUp) {
    stopTimer();
    if (state.cfg.mode === 'mock') commitCbt();
    const { cfg } = state;
    const total = cfg.questions.length;
    const given = state.answers.filter(Boolean);
    const score = given.filter((a) => a.correct).length;
    const answered = given.length;
    const percent = Math.round((score / total) * 100);
    const pass = (score / total) >= (cfg.passRate || 0.6);
    const result = { score, total, answered, percent, pass, timeUp };
    if (cfg.onFinish) cfg.onFinish(result);
    renderResult(result);
  }

  function renderResult(r) {
    const { cfg } = state;
    // 分野別内訳(模試用)
    let breakdown = '';
    if (cfg.mode === 'mock') {
      const byPart = {};
      cfg.questions.forEach((q, i) => {
        const a = state.answers[i];
        const b = byPart[q.partId] || (byPart[q.partId] = { c: 0, t: 0 });
        b.t += 1;
        if (a && a.correct) b.c += 1;
      });
      breakdown = `<div class="result-breakdown">${AP.parts
        .filter((p) => byPart[p.id])
        .map((p) => {
          const b = byPart[p.id];
          return `<div class="result-breakdown-row"><span>${p.name}</span><b>${b.c} / ${b.t}</b></div>`;
        }).join('')}</div>`;
    }

    const timeBox = cfg.mode === 'mock' ? timeAnalysis() : '';

    // 間違えた問題の見直し
    const wrong = cfg.questions
      .map((q, i) => ({ q, a: state.answers[i], i }))
      .filter((x) => !x.a || !x.a.correct);
    const unitOf = (qid) => (qid && qid.startsWith('chk-') ? qid.slice(4, qid.lastIndexOf('-')) : null);
    const review = wrong.length
      ? `<div class="review-list">
           <h3 style="font-size:14px;font-weight:900;margin-bottom:10px">見直し(${wrong.length}問)</h3>
           ${wrong.map(({ q, a, i }) => `
             <div class="review-item">
               ${cfg.mode === 'mock' ? `<p class="rv-meta">問${i + 1} ・ 考えた時間 ${fmtTime(Math.round(state.times[i] / 1000))}${state.flags.has(i) ? ' ・ 見直しの印あり' : ''}</p>` : ''}
               <p class="rv-q">${esc(q.q)}</p>
               <p><span class="rv-a">正解: ${KEYS[q.answer]} ${esc(q.choices[q.answer])}</span>
               ${a ? ` / <span class="rv-your">自分の解答: ${KEYS[a.picked]} ${esc(q.choices[a.picked])}</span>` : ' / <span class="rv-your">未回答</span>'}</p>
               <p class="rv-exp">${esc(q.exp || '')}</p>
               ${unitOf(q.qid) ? `<button class="btn-mini rv-lesson" data-unit="${unitOf(q.qid)}">教材で確認 →</button>` : ''}
             </div>`).join('')}
         </div>`
      : '';
    const actions = typeof cfg.nextActions === 'function' ? cfg.nextActions(r) : (cfg.nextActions || []);
    const hasPrimary = actions.some((x) => x.primary);

    const passLabel = cfg.passLabel || (r.pass ? 'CLEAR!' : 'NOT CLEAR');
    $view().innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-result">
          <p class="result-verdict ${r.pass ? 'pass' : 'fail'}">${esc(passLabel)}</p>
          <p class="score-big">${r.score}<small> / ${r.total} 問正解(${r.percent}%)</small></p>
          <p class="result-sub">${esc(cfg.resultNote ? cfg.resultNote(r) : '')}${r.timeUp ? '(時間切れで終了しました)' : ''}</p>
          ${breakdown}
          ${timeBox}
          <div class="btn-row" style="justify-content:center">
            ${actions.map((x, i) => `<button class="btn ${x.primary ? 'btn-primary' : 'btn-ghost'}" data-action="${i}">${esc(x.label)}</button>`).join('')}
            ${wrong.length && wrong.length < r.total ? `<button class="btn ${hasPrimary ? 'btn-ghost' : 'btn-primary'}" id="result-retry-wrong">間違えた${wrong.length}問だけ解き直す</button>` : ''}
            <button class="btn ${hasPrimary || (wrong.length && wrong.length < r.total) ? 'btn-ghost' : 'btn-primary'}" id="result-back">${esc(cfg.backLabel || '戻る')}</button>
            <button class="btn btn-ghost" id="result-retry">${cfg.retryLabel || 'もう一度挑戦'}</button>
          </div>
          ${review}
        </div>
      </div>`;

    document.getElementById('result-back').addEventListener('click', quit);
    $view().querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => { const fn = actions[Number(b.dataset.action)].fn; state = null; fn(); });
    });
    $view().querySelectorAll('.rv-lesson').forEach((b) => {
      b.addEventListener('click', () => { state = null; Course.openLesson(b.dataset.unit); });
    });
    const retryWrong = document.getElementById('result-retry-wrong');
    if (retryWrong) retryWrong.addEventListener('click', () => {
      const base = state.cfg;
      start({
        title: `解き直し: ${base.title.replace(/^解き直し: /, '')}`,
        questions: shuffle(wrong.map((x) => x.q)),
        mode: base.mode === 'mock' ? 'practice' : base.mode,
        passRate: 1,
        passLabel: null,
        backLabel: base.backLabel,
        onBack: base.onBack,
        retryLabel: 'もう一度解き直す',
        resultNote: (r2) => (r2.pass
          ? '全問正解!解き直した問題も、間隔反復で日をあけてもう一度出題されます。'
          : 'まだ間違えた問題があります。解説を読み、教材に戻って確かめよう。'),
      });
    });
    document.getElementById('result-retry').addEventListener('click', () => {
      const cfg2 = state.cfg;
      start(Object.assign({}, cfg2, {
        questions: cfg2.reshuffleOnRetry ? shuffle(cfg2.questions) : cfg2.questions,
      }));
    });
  }

  // ---------- 模試(本番のCBTと同じ操作) ----------
  // いま表示している問題で使った時間を記録する(問題を移るとき・提出するとき)
  function leaveCurrent() {
    const now = Date.now();
    state.times[state.idx] += now - state.enteredAt;
    state.enteredAt = now;
  }
  function goTo(i) {
    if (i < 0 || i >= state.cfg.questions.length) return;
    leaveCurrent();
    state.idx = i;
    state.panel = null;
    renderCbt();
    window.scrollTo(0, 0);
  }
  function toggleFlag() {
    const f = state.flags;
    if (f.has(state.idx)) f.delete(state.idx); else f.add(state.idx);
    renderCbt();
  }

  function renderCbt() {
    const { cfg, idx, picks, flags } = state;
    const q = cfg.questions[idx];
    const total = cfg.questions.length;
    const answered = picks.filter((p) => p !== null).length;
    const last = idx === total - 1;
    const cells = cfg.questions.map((_, i) => `
      <button class="cbt-cell ${picks[i] !== null ? 'is-ans' : ''} ${flags.has(i) ? 'is-flag' : ''} ${i === idx ? 'is-cur' : ''}" data-go="${i}"
        aria-label="問${i + 1}${picks[i] !== null ? ' 解答済み' : ' 未解答'}${flags.has(i) ? ' 見直し' : ''}">${i + 1}</button>`).join('');
    const unans = total - answered;
    const panel = state.panel === 'list' ? `
      <div class="cbt-overlay" role="dialog" aria-modal="true" aria-label="問題一覧">
        <div class="cbt-panel">
          <div class="cbt-panel-head"><b>問題一覧</b><button class="btn-mini" data-close>閉じる</button></div>
          <p class="cbt-panel-sub">解答済み ${answered} ・ 未解答 ${unans} ・ 見直し ${flags.size}</p>
          <div class="cbt-grid">${cells}</div>
          <p class="cbt-legend"><i class="cbt-cell is-ans"></i>解答済み <i class="cbt-cell"></i>未解答 <i class="cbt-cell is-flag"></i>見直しの印</p>
        </div>
      </div>` : state.panel === 'confirm' ? `
      <div class="cbt-overlay" role="dialog" aria-modal="true" aria-label="解答の終了">
        <div class="cbt-panel cbt-confirm">
          <p class="cbt-confirm-title">解答を終了して採点しますか?</p>
          <p class="cbt-panel-sub">${unans ? `<b class="ng">未解答 ${unans}問</b>` : '全問解答済み'}${flags.size ? ` ・ 見直しの印 ${flags.size}問` : ''} ・ 残り時間 ${fmtTime(state.remainSec)}</p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-primary" id="cbt-submit">終了して採点する</button>
            <button class="btn btn-ghost" data-close>問題に戻る</button>
          </div>
        </div>
      </div>` : '';

    $view().innerHTML = `
      <div class="quiz-shell cbt">
        <div class="quiz-top">
          <span class="quiz-top-label">${esc(cfg.title)}</span>
          <span class="quiz-timer ${state.remainSec <= 60 ? 'is-warn' : ''}" id="quiz-timer">${fmtTime(state.remainSec)}</span>
          <span class="quiz-count">解答 ${answered} / ${total}</span>
        </div>
        <div class="quiz-progress"><div class="quiz-progress-fill" style="width:${(answered / total) * 100}%"></div></div>
        <div class="q-card">
          <div class="q-card-top">
            <span class="cbt-no">問${idx + 1}<small> / ${total}</small></span>
            <button class="cbt-flag ${flags.has(idx) ? 'on' : ''}" id="cbt-flag" aria-pressed="${flags.has(idx)}">${flags.has(idx) ? '見直しの印あり' : '後で見直す'}</button>
          </div>
          ${q.source ? `<span class="q-source">${esc(q.source)}</span>` : ''}
          <p class="q-text">${esc(q.q)}</p>
          <div class="choices">
            ${q.choices.map((c, i) => `
              <button class="choice ${picks[idx] === i ? 'is-picked' : ''}" data-i="${i}" aria-pressed="${picks[idx] === i}">
                <span class="choice-key">${KEYS[i]}</span><span>${esc(c)}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="cbt-nav">
          <button class="btn btn-ghost" id="cbt-prev" ${idx === 0 ? 'disabled' : ''}>◀ 前へ</button>
          <button class="btn btn-ghost" id="cbt-list">問題一覧</button>
          ${last ? '<button class="btn btn-primary" id="cbt-end">解答を終了</button>' : '<button class="btn btn-primary" id="cbt-next">次へ ▶</button>'}
        </div>
        <div class="cbt-sub">
          <span class="kbd-hint">キーボード: 1〜4で解答 ・ ← → で移動 ・ F で見直しの印</span>
          <span class="cbt-sub-actions">
            ${last ? '' : '<button class="btn-text" id="cbt-end2">解答を終了する</button>'}
            <button class="btn-text" id="quiz-quit">中断する</button>
          </span>
        </div>
        ${panel}
      </div>`;

    const v = $view();
    v.querySelectorAll('.choice').forEach((btn) => {
      btn.addEventListener('click', () => { state.picks[state.idx] = Number(btn.dataset.i); renderCbt(); });
    });
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('cbt-flag', toggleFlag);
    on('cbt-prev', () => goTo(state.idx - 1));
    on('cbt-next', () => goTo(state.idx + 1));
    on('cbt-list', () => { state.panel = 'list'; renderCbt(); });
    on('cbt-end', () => { state.panel = 'confirm'; renderCbt(); });
    on('cbt-end2', () => { state.panel = 'confirm'; renderCbt(); });
    on('cbt-submit', () => finish(false));
    on('quiz-quit', () => {
      if (confirm('中断すると採点されません。模擬試験をやめますか?')) quit();
    });
    v.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.go))));
    v.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { state.panel = null; renderCbt(); }));
    const ov = v.querySelector('.cbt-overlay');
    if (ov) ov.addEventListener('click', (e) => { if (e.target === ov) { state.panel = null; renderCbt(); } });
  }

  // 提出: 解答を確定し、学習記録(正答率・復習リスト・間隔反復)に反映する。未解答は記録しない
  function commitCbt() {
    if (state.done) return;
    leaveCurrent();
    state.done = true;
    state.panel = null;
    state.answers = state.cfg.questions.map((q, i) => {
      const p = state.picks[i];
      if (p === null) return undefined;
      const correct = p === q.answer;
      if (q.partId) Store.recordAnswer(q.partId, correct);
      if (q.qid) { Store.markWrong(q.qid, !correct); Store.srsReview(q.qid, correct); }
      Store.studyTick();
      return { picked: p, correct };
    });
  }

  // 模試の結果: 時間の使い方
  function timeAnalysis() {
    const { cfg, times, flags } = state;
    const total = cfg.questions.length;
    const usedSec = Math.round(times.reduce((a, b) => a + b, 0) / 1000);
    const budget = cfg.timeLimitSec ? cfg.timeLimitSec / total : 112;
    const answeredN = state.answers.filter(Boolean).length;
    const avg = usedSec / Math.max(1, answeredN);
    const slow = times.map((t, i) => ({ i, sec: Math.round(t / 1000) }))
      .filter((x) => x.sec > budget * 1.5).sort((a, b) => b.sec - a.sec).slice(0, 5);
    const flagged = [...flags];
    const flaggedOk = flagged.filter((i) => state.answers[i] && state.answers[i].correct).length;
    return `
      <div class="time-analysis">
        <p class="ta-row"><b>使った時間</b> ${fmtTime(usedSec)}${cfg.timeLimitSec ? ` / ${fmtTime(cfg.timeLimitSec)}` : ''}
          ・ <b>解答1問あたり</b> 平均 ${fmtTime(Math.round(avg))}(目安 ${fmtTime(Math.round(budget))})</p>
        ${slow.length ? `<p class="ta-row"><b>時間がかかった問題</b> ${slow.map((x) => `問${x.i + 1}(${fmtTime(x.sec)})`).join('・')}
          <br><span class="ta-note">本番では、目安の1.5倍を超えたら印をつけて先へ進み、最後に戻るのがコツです。</span></p>` : ''}
        ${flagged.length ? `<p class="ta-row"><b>見直しの印</b> ${flagged.length}問のうち ${flaggedOk}問 正解</p>` : ''}
      </div>`;
  }

  // 模試のキーボード操作(← → で移動、F で見直しの印)。1〜4 と Enter は app.js の共通処理
  document.addEventListener('keydown', (e) => {
    if (!state || state.cfg.mode !== 'mock' || state.done || $view().hidden) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(state.idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(state.idx - 1); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlag(); }
    else if (e.key === 'Escape' && state.panel) { state.panel = null; renderCbt(); }
  });

  // 表示中の問題(テスト・デバッグ用)
  function current() {
    return state ? state.cfg.questions[state.idx] : null;
  }

  return { start, shuffle, withShuffledChoices, current, KEYS };
})();
