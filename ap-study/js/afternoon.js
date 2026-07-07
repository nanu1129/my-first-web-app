// 午後演習: 長文シナリオを読んで設問に答えるケーススタディ
const Afternoon = (() => {
  const $view = () => document.getElementById('view-practice');
  const KEYS = ['ア', 'イ', 'ウ', 'エ'];

  let cs = null, qIdx = 0, answers = [];

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderMenu() {
    $view().innerHTML = `
      <div class="crumb"><button data-back>実践トレーニング</button> › 午後演習</div>
      <h2 class="view-title">午後演習(ケーススタディ)</h2>
      <p class="view-lead">本番の午後試験と同じ「長文を読んで設問に答える」形式の学習用オリジナル問題です。本文に答えの根拠が隠れています。</p>
      <div class="practice-menu">
        ${AP.cases.map((c) => {
          const st = Store.caseState(c.id);
          return `
          <button class="practice-card ${st && st.cleared ? 'is-cleared' : ''}" data-case="${c.id}">
            <span class="pc-title">${st && st.cleared ? '✓ ' : ''}${esc(c.title)}</span>
            <span class="pc-desc">${esc(c.intro)}</span>
            <span class="pc-cta">${esc(c.field)} ・ 設問${c.questions.length}問${st ? ` ・ ベスト ${st.best}%` : ''} →</span>
          </button>`;
        }).join('')}
      </div>`;
    $view().querySelector('[data-back]').addEventListener('click', Practice.renderMenu);
    $view().querySelectorAll('[data-case]').forEach((b) => {
      b.addEventListener('click', () => start(b.dataset.case));
    });
  }

  function start(id) {
    cs = AP.cases.find((c) => c.id === id);
    qIdx = 0;
    answers = [];
    paint();
  }

  function paint(feedback) {
    const q = cs.questions[qIdx];
    const answered = !!feedback;
    $view().innerHTML = `
      <div class="crumb"><button data-back>午後演習</button> › ${esc(cs.title)}</div>
      <div class="case-paper">
        <span class="lesson-part-tag">${esc(cs.field)}</span>
        <h2 class="lesson-title" style="font-size:19px">${esc(cs.title)}</h2>
        <p class="case-intro">${esc(cs.intro)}</p>
        ${cs.text.map((p) => `<p class="case-text">${esc(p)}</p>`).join('')}
      </div>
      <div class="q-card" style="margin-top:16px">
        <p class="q-source">設問 ${qIdx + 1} / ${cs.questions.length}</p>
        <p class="q-text">${esc(q.q)}</p>
        <div class="choices">
          ${q.choices.map((c, i) => `
            <button class="choice ${answered && i === q.answer ? 'is-correct' : ''}
              ${answered && answers[qIdx] === i && i !== q.answer ? 'is-wrong' : ''}"
              data-i="${i}" ${answered ? 'disabled' : ''}>
              <span class="choice-key">${KEYS[i]}</span><span>${esc(c)}</span>
            </button>`).join('')}
        </div>
        <div id="case-feedback">${feedback || ''}</div>
        ${answered ? `<div class="quiz-next"><button class="btn btn-primary" id="case-next">
          ${qIdx + 1 >= cs.questions.length ? '結果を見る' : '次の設問へ'}</button></div>` : ''}
      </div>`;

    $view().querySelector('[data-back]').addEventListener('click', renderMenu);
    if (!answered) {
      $view().querySelectorAll('.choice').forEach((btn) => {
        btn.addEventListener('click', () => pick(Number(btn.dataset.i)));
      });
    } else {
      const btn = document.getElementById('case-next');
      btn.addEventListener('click', () => {
        qIdx += 1;
        if (qIdx >= cs.questions.length) finish();
        else paint();
      });
      btn.focus();
    }
  }

  function pick(i) {
    const q = cs.questions[qIdx];
    const ok = i === q.answer;
    answers[qIdx] = i;
    Store.recordAnswer(cs.partId, ok);
    paint(`
      <div class="feedback ${ok ? 'ok' : 'ng'}">
        <p class="feedback-head">${ok ? '正解!' : `不正解… 正解は「${KEYS[q.answer]}」`}</p>
        <p class="feedback-exp">${esc(q.exp)}</p>
      </div>`);
  }

  function finish() {
    const total = cs.questions.length;
    const score = cs.questions.filter((q, i) => answers[i] === q.answer).length;
    const percent = Math.round((score / total) * 100);
    const pass = percent >= 60;
    Store.setCaseResult(cs.id, percent, pass);
    Store.addHistory({ kind: '午後演習', label: cs.title, score, total, pass });
    $view().innerHTML = `
      <div class="quiz-shell"><div class="quiz-result">
        <p class="result-verdict ${pass ? 'pass' : 'fail'}">${pass ? 'CASE CLEAR!' : 'NOT CLEAR'}</p>
        <p class="score-big">${score}<small> / ${total} 問正解(${percent}%)</small></p>
        <p class="result-sub">${pass
          ? '合格ライン(60%)を超えました。本文から根拠を拾う感覚がつかめてきています。'
          : '答えの根拠は必ず本文の中にあります。設問→本文の該当箇所の順に読み直してみましょう。'}</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" id="case-menu">一覧へ戻る</button>
          <button class="btn btn-ghost" id="case-retry">もう一度</button>
        </div>
      </div></div>`;
    document.getElementById('case-menu').addEventListener('click', renderMenu);
    document.getElementById('case-retry').addEventListener('click', () => start(cs.id));
  }

  return { renderMenu };
})();
