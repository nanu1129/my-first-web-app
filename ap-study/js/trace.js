// アルゴリズムトレース: 擬似言語コードを1行ずつ実行し、変数の値を予測する練習
const Trace = (() => {
  const $view = () => document.getElementById('view-practice');

  // steps: 実行順に { line(0始まり), vars(実行後の変数の値), ask?(この行の実行後の値を問う変数名) }
  const EXERCISES = [
    {
      id: 'sum', title: '① 合計を求めるループ', level: 'やさしい',
      desc: '1から5までの整数の合計を求めるプログラムです。goukei の値を追いかけましょう。',
      code: [
        'goukei ← 0',
        'i を 1 から 5 まで 1 ずつ増やしながら繰り返す:',
        '  goukei ← goukei + i',
        'goukei を出力する',
      ],
      steps: [
        { line: 0, vars: { goukei: 0, i: '—' } },
        { line: 2, vars: { goukei: 1, i: 1 }, ask: 'goukei' },
        { line: 2, vars: { goukei: 3, i: 2 } },
        { line: 2, vars: { goukei: 6, i: 3 }, ask: 'goukei' },
        { line: 2, vars: { goukei: 10, i: 4 } },
        { line: 2, vars: { goukei: 15, i: 5 }, ask: 'goukei' },
        { line: 3, vars: { goukei: 15, i: 5 }, note: '15 が出力される' },
      ],
    },
    {
      id: 'max', title: '② 配列の最大値', level: 'ふつう',
      desc: '配列 A = [3, 8, 5, 9, 2] の最大値を求めます。max がいつ書き換わるかがポイントです。',
      code: [
        'A ← [3, 8, 5, 9, 2](添字は1から)',
        'max ← A[1]',
        'i を 2 から 5 まで 1 ずつ増やしながら繰り返す:',
        '  もし A[i] > max ならば:',
        '    max ← A[i]',
        'max を出力する',
      ],
      steps: [
        { line: 1, vars: { max: 3, i: '—' } },
        { line: 3, vars: { max: 3, i: 2 }, note: 'A[2]=8 > 3 → 条件は真' },
        { line: 4, vars: { max: 8, i: 2 }, ask: 'max' },
        { line: 3, vars: { max: 8, i: 3 }, note: 'A[3]=5 > 8 ? → 偽。maxは変わらない' },
        { line: 3, vars: { max: 8, i: 4 }, note: 'A[4]=9 > 8 → 真' },
        { line: 4, vars: { max: 9, i: 4 }, ask: 'max' },
        { line: 3, vars: { max: 9, i: 5 }, note: 'A[5]=2 > 9 ? → 偽' },
        { line: 5, vars: { max: 9, i: 5 }, ask: 'max', note: '最大値 9 が出力される' },
      ],
    },
    {
      id: 'bsearch', title: '③ 2分探索', level: '本番レベル',
      desc: '整列済み配列 A = [2, 5, 9, 13, 21, 29, 35, 41, 50] から x = 29 を探します。mid の動きを追いましょう(÷は小数点以下切捨て)。',
      code: [
        'A ← [2, 5, 9, 13, 21, 29, 35, 41, 50](添字は1から)',
        'lo ← 1, hi ← 9',
        'lo ≤ hi の間、繰り返す:',
        '  mid ← (lo + hi) ÷ 2',
        '  もし A[mid] = x ならば「発見」して終了',
        '  そうでなく A[mid] < x ならば lo ← mid + 1',
        '  そうでなければ hi ← mid − 1',
      ],
      steps: [
        { line: 1, vars: { lo: 1, hi: 9, mid: '—' } },
        { line: 3, vars: { lo: 1, hi: 9, mid: 5 }, ask: 'mid', note: '(1+9)÷2 = 5' },
        { line: 5, vars: { lo: 6, hi: 9, mid: 5 }, ask: 'lo', note: 'A[5]=21 < 29 なので右半分へ' },
        { line: 3, vars: { lo: 6, hi: 9, mid: 7 }, ask: 'mid', note: '(6+9)÷2 = 7.5 → 切捨てで 7' },
        { line: 6, vars: { lo: 6, hi: 6, mid: 7 }, ask: 'hi', note: 'A[7]=35 > 29 なので左半分へ' },
        { line: 3, vars: { lo: 6, hi: 6, mid: 6 }, note: '(6+6)÷2 = 6' },
        { line: 4, vars: { lo: 6, hi: 6, mid: 6 }, note: 'A[6]=29 = x → 発見!比較3回で見つかった' },
      ],
    },
  ];

  let ex = null, idx = 0, asked = 0, correct = 0, answered = false;

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderMenu() {
    $view().innerHTML = `
      <div class="crumb"><button data-back>実践トレーニング</button> › アルゴリズムトレース</div>
      <h2 class="view-title">アルゴリズムトレース</h2>
      <p class="view-lead">「コードを読んで変数の変化を正確に追う」力は午後試験の得点源です。1行ずつ実行して、聞かれた変数の値を答えましょう。</p>
      <div class="practice-menu">
        ${EXERCISES.map((e) => `
          <button class="practice-card" data-ex="${e.id}">
            <span class="pc-title">${esc(e.title)}</span>
            <span class="pc-desc">${esc(e.desc)}</span>
            <span class="pc-cta">${esc(e.level)} ・ 始める →</span>
          </button>`).join('')}
      </div>`;
    $view().querySelector('[data-back]').addEventListener('click', Practice.renderMenu);
    $view().querySelectorAll('[data-ex]').forEach((b) => {
      b.addEventListener('click', () => start(b.dataset.ex));
    });
  }

  function start(id) {
    ex = EXERCISES.find((e) => e.id === id);
    idx = 0; asked = 0; correct = 0; answered = false;
    paint();
  }

  function paint(feedback) {
    const step = ex.steps[idx];
    const last = idx >= ex.steps.length - 1;
    const needAsk = step.ask && !answered;

    const code = ex.code.map((ln, i) => `
      <div class="trace-line ${i === step.line ? 'is-current' : ''}">
        <span class="tl-no">${i + 1}</span><span class="tl-code">${esc(ln)}</span>
      </div>`).join('');

    const vars = Object.entries(step.vars).map(([k, v]) => `
      <div class="trace-var ${step.ask === k && !needAsk ? 'is-hot' : ''}">
        <span class="tv-name">${esc(k)}</span>
        <span class="tv-val">${needAsk && step.ask === k ? '?' : esc(String(v))}</span>
      </div>`).join('');

    $view().innerHTML = `
      <div class="crumb"><button data-back>アルゴリズムトレース</button> › ${esc(ex.title)}</div>
      <div class="q-card">
        <p class="q-source">ステップ ${idx + 1} / ${ex.steps.length} ・ 正解 ${correct} / ${asked}</p>
        <p class="q-text" style="font-size:14px">${esc(ex.desc)}</p>
        <div class="trace-code">${code}</div>
        <div class="trace-vars">${vars}</div>
        ${step.note && !needAsk ? `<p class="trace-note"><b>ヒント:</b> ${esc(step.note)}</p>` : ''}
        ${needAsk ? `
          <div class="drill-input-row">
            <span class="drill-unit">この行の実行後、<b>${esc(step.ask)}</b> の値は?</span>
            <input id="trace-input" class="drill-input" type="text" inputmode="numeric" autocomplete="off" placeholder="値を入力">
            <button class="btn btn-primary" id="trace-check">答える</button>
          </div>` : ''}
        <div id="trace-feedback">${feedback || ''}</div>
        ${!needAsk ? `
          <div class="quiz-next">
            ${last
              ? `<button class="btn btn-primary" id="trace-done">結果を見る</button>`
              : `<button class="btn btn-primary" id="trace-next">次のステップ ▶</button>`}
          </div>` : ''}
      </div>`;

    $view().querySelector('[data-back]').addEventListener('click', renderMenu);
    if (needAsk) {
      const input = document.getElementById('trace-input');
      document.getElementById('trace-check').addEventListener('click', check);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      input.focus();
    } else if (last) {
      document.getElementById('trace-done').addEventListener('click', finish);
    } else {
      const btn = document.getElementById('trace-next');
      btn.addEventListener('click', () => { idx += 1; answered = false; paint(); });
      btn.focus();
    }
  }

  function check() {
    const step = ex.steps[idx];
    const given = document.getElementById('trace-input').value.trim()
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (given === '') return;
    const ok = given === String(step.vars[step.ask]);
    asked += 1;
    if (ok) correct += 1;
    Store.recordAnswer('basics', ok);
    answered = true;
    paint(`
      <div class="feedback ${ok ? 'ok' : 'ng'}">
        <p class="feedback-head">${ok ? '正解!' : `不正解… ${esc(step.ask)} = ${esc(String(step.vars[step.ask]))}`}</p>
        ${step.note ? `<p class="feedback-exp">${esc(step.note)}</p>` : ''}
      </div>`);
  }

  function finish() {
    const pass = asked === 0 ? true : correct / asked >= 0.6;
    Store.addHistory({ kind: 'トレース', label: ex.title, score: correct, total: asked, pass });
    $view().innerHTML = `
      <div class="quiz-shell"><div class="quiz-result">
        <p class="result-verdict ${pass ? 'pass' : 'fail'}">${pass ? 'TRACE COMPLETE!' : 'もう一歩!'}</p>
        <p class="score-big">${correct}<small> / ${asked} 問正解</small></p>
        <p class="result-sub">${pass ? '変数の動きを正確に追えています。' : 'ハイライト行だけを見て、1行ずつ値を書き出すのがコツです。'}</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" id="trace-menu">一覧へ戻る</button>
          <button class="btn btn-ghost" id="trace-retry">もう一度</button>
        </div>
      </div></div>`;
    document.getElementById('trace-menu').addEventListener('click', renderMenu);
    document.getElementById('trace-retry').addEventListener('click', () => start(ex.id));
  }

  return { renderMenu };
})();
