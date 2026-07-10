// クイズエンジン: 一問一答 / パート過去問 / 模擬試験 で共通利用
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

  // config: { title, questions, mode: 'check'|'practice'|'mock',
  //           passRate, timeLimitSec, backLabel, onBack, onFinish }
  function start(config) {
    stopTimer();
    state = {
      cfg: config,
      idx: 0,
      answers: [], // { picked, correct }
      startedAt: Date.now(),
      remainSec: config.timeLimitSec || 0,
    };
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
    const { cfg, idx } = state;
    const q = cfg.questions[idx];
    $view().innerHTML = `
      <div class="quiz-shell">
        ${header()}
        <div class="q-card">
          ${q.source ? `<p class="q-source">${esc(q.source)}</p>` : ''}
          <p class="q-text">${esc(q.q)}</p>
          <div class="choices">
            ${q.choices.map((c, i) => `
              <button class="choice" data-i="${i}">
                <span class="choice-key">${KEYS[i]}</span><span>${esc(c)}</span>
              </button>`).join('')}
          </div>
          <div id="quiz-feedback"></div>
        </div>
        <div class="quiz-next">
          <button class="btn btn-ghost" id="quiz-quit">${esc(cfg.backLabel || 'やめる')}</button>
        </div>
      </div>`;

    $view().querySelectorAll('.choice').forEach((btn) => {
      btn.addEventListener('click', () => pick(Number(btn.dataset.i)));
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
    if (q.qid) Store.markWrong(q.qid, !correct); // 復習リストの追加/解除

    if (cfg.mode === 'mock') {
      next();
      return;
    }

    // 即時フィードバック(一問一答・過去問演習)
    $view().querySelectorAll('.choice').forEach((btn, bi) => {
      btn.disabled = true;
      if (bi === q.answer) btn.classList.add('is-correct');
      else if (bi === i && !correct) btn.classList.add('is-wrong');
    });
    const last = idx + 1 >= cfg.questions.length;
    document.getElementById('quiz-feedback').innerHTML = `
      <div class="feedback ${correct ? 'ok' : 'ng'}">
        <p class="feedback-head">${correct ? '正解!この調子!' : `残念、不正解… 正解は「${KEYS[q.answer]}」。解説を読んで整理しよう`}</p>
        <p class="feedback-exp">${esc(q.exp || '')}</p>
      </div>`;
    const nextWrap = $view().querySelector('.quiz-next');
    nextWrap.innerHTML = `<button class="btn btn-primary" id="quiz-next-btn">${last ? '結果を見る' : '次の問題へ'}</button>`;
    const btn = document.getElementById('quiz-next-btn');
    btn.addEventListener('click', next);
    btn.focus();
  }

  function next() {
    state.idx += 1;
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
    const { cfg } = state;
    const total = cfg.questions.length;
    const score = state.answers.filter((a) => a.correct).length;
    const answered = state.answers.length;
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

    // 間違えた問題の見直し
    const wrong = cfg.questions
      .map((q, i) => ({ q, a: state.answers[i] }))
      .filter((x) => !x.a || !x.a.correct);
    const review = wrong.length
      ? `<div class="review-list">
           <h3 style="font-size:14px;font-weight:900;margin-bottom:10px">見直し(${wrong.length}問)</h3>
           ${wrong.map(({ q, a }) => `
             <div class="review-item">
               <p class="rv-q">${esc(q.q)}</p>
               <p><span class="rv-a">正解: ${KEYS[q.answer]} ${esc(q.choices[q.answer])}</span>
               ${a ? ` / <span class="rv-your">自分の解答: ${KEYS[a.picked]}</span>` : ' / <span class="rv-your">未回答</span>'}</p>
               <p class="rv-exp">${esc(q.exp || '')}</p>
             </div>`).join('')}
         </div>`
      : '';

    const passLabel = cfg.passLabel || (r.pass ? 'CLEAR!' : 'NOT CLEAR');
    $view().innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-result">
          <p class="result-verdict ${r.pass ? 'pass' : 'fail'}">${esc(passLabel)}</p>
          <p class="score-big">${r.score}<small> / ${r.total} 問正解(${r.percent}%)</small></p>
          <p class="result-sub">${esc(cfg.resultNote ? cfg.resultNote(r) : '')}${r.timeUp ? '(時間切れで終了しました)' : ''}</p>
          ${breakdown}
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-primary" id="result-back">${esc(cfg.backLabel || '戻る')}</button>
            <button class="btn btn-ghost" id="result-retry">もう一度挑戦</button>
          </div>
          ${review}
        </div>
      </div>`;

    document.getElementById('result-back').addEventListener('click', quit);
    document.getElementById('result-retry').addEventListener('click', () => {
      const cfg2 = state.cfg;
      start(Object.assign({}, cfg2, {
        questions: cfg2.reshuffleOnRetry ? shuffle(cfg2.questions) : cfg2.questions,
      }));
    });
  }

  return { start, shuffle, KEYS };
})();
