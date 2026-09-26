// 午後演習: 長文シナリオを読んで設問に答えるケーススタディ
// 選択式に加え、本番と同じ記述式(解答例と照らし合わせて自己採点)にも対応する
const Afternoon = (() => {
  const $view = () => document.getElementById('view-practice');
  const KEYS = ['ア', 'イ', 'ウ', 'エ'];
  const GRADES = [
    { v: 1, label: 'できた(○)', cls: 'ok' },
    { v: 0.5, label: '一部できた(△)', cls: 'mid' },
    { v: 0, label: 'できなかった(×)', cls: 'ng' },
  ];

  let cs = null, qIdx = 0, answers = [];
  let draft = '', revealed = false; // 記述式の入力途中の状態

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  const len = (s) => [...(s || '')].length;
  const fmtScore = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // 午後試験の分野(これまでの出題形式)と、このサイトで練習できる分野
  const FIELDS = ['経営戦略', '情報戦略', 'プログラミング', 'システムアーキテクチャ', 'ネットワーク', 'データベース',
    '組込みシステム開発', '情報システム開発', 'プロジェクトマネジメント', 'サービスマネジメント', 'システム監査'];
  const COVERED = { 経営戦略: '経営戦略', プログラミング: 'プログラミング', ネットワーク: 'ネットワーク', データベース: 'データベース',
    プロジェクトマネジメント: 'プロジェクトマネジメント', サービスマネジメント: 'サービスマネジメント', システム監査: 'システム監査' };

  function guide() {
    return `
      <details class="guide-box">
        <summary>午後試験のしくみと、分野の選び方</summary>
        <ul class="guide-list">
          <li><b>問1 情報セキュリティは必須</b>。残りの10分野から<b>4問を選んで</b>解答します(計5問・150分。1問あたり約30分)。</li>
          <li>選択できる分野: ${FIELDS.slice(0).map((f) => (COVERED[f]
            ? `<span class="pill pill-accent">${f}</span>` : `<span class="pill pill-muted">${f}</span>`)).join(' ')}
            <br><small>色つきの分野は、このサイトで練習できます。</small></li>
          <li>選び方のヒント: 文章を読み解くのが得意なら<b>プロジェクトマネジメント・サービスマネジメント・システム監査・経営戦略</b>、
            技術に強いなら<b>データベース・ネットワーク・プログラミング</b>が選ばれやすい分野です。
            本番までに「得意な4分野 + 予備の1分野」を決めて、集中的に練習しておきましょう。</li>
          <li>試験の形式は変わることがあります。最新の情報は <a href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">IPA 公式サイト</a> で確認してください。</li>
        </ul>
      </details>`;
  }

  function renderMenu() {
    // セキュリティ(必須)を先頭に並べる
    const cases = AP.cases.slice().sort((a, b) => (b.partId === 'security') - (a.partId === 'security'));
    $view().innerHTML = `
      <div class="crumb"><button data-back>実践トレーニング</button> › 午後演習</div>
      <h2 class="view-title">午後演習(ケーススタディ)</h2>
      <p class="view-lead">本番の午後試験と同じ「長文を読んで設問に答える」形式の学習用オリジナル問題です。
        選択式に加えて、本番と同じ<b>記述式</b>の設問もあります。記述式は解答例と照らし合わせて自己採点します。</p>
      ${guide()}
      <div class="practice-menu">
        ${cases.map((c) => {
          const st = Store.caseState(c.id);
          const writes = c.questions.filter((q) => q.type === 'write').length;
          return `
          <button class="practice-card ${st && st.cleared ? 'is-cleared' : ''}" data-case="${c.id}">
            <span class="pc-title">${st && st.cleared ? '<span class="pill pill-ok">クリア</span> ' : ''}${esc(c.title)}</span>
            <span class="pc-desc">${esc(c.intro)}</span>
            <span class="pc-cta">${esc(c.field)} ・ 設問${c.questions.length}問(うち記述${writes})${st ? ` ・ ベスト ${st.best}%` : ''} →</span>
          </button>`;
        }).join('')}
      </div>`;
    $view().querySelector('[data-back]').addEventListener('click', Practice.renderMenu);
    $view().querySelectorAll('[data-case]').forEach((b) => {
      b.addEventListener('click', () => start(b.dataset.case));
    });
  }

  function start(id) {
    const src = AP.cases.find((c) => c.id === id);
    // 選択式の設問は出題ごとに選択肢をシャッフルする
    cs = Object.assign({}, src, {
      questions: src.questions.map((q) => (q.choices ? Quiz.withShuffledChoices(q) : q)),
    });
    qIdx = 0;
    answers = [];
    draft = '';
    revealed = false;
    paint();
    window.scrollTo(0, 0);
  }

  // 本文の段落。プログラムは等幅の整形済みテキスト、箇条書きなどの改行は <br> で表示する
  function paragraph(p) {
    if (cs.code && p.includes('\n')) return `<pre class="case-code">${esc(p)}</pre>`;
    return `<p class="case-text">${p.split('\n').map(esc).join('<br>')}</p>`;
  }

  function paint(feedback) {
    const q = cs.questions[qIdx];
    const isWrite = q.type === 'write';
    const done = answers[qIdx] !== undefined;
    $view().innerHTML = `
      <div class="crumb"><button data-back>午後演習</button> › ${esc(cs.title)}</div>
      <div class="case-paper">
        <span class="lesson-part-tag">${esc(cs.field)}</span>
        <h2 class="lesson-title" style="font-size:19px">${esc(cs.title)}</h2>
        <p class="case-intro">${esc(cs.intro)}</p>
        ${cs.text.map(paragraph).join('')}
      </div>
      <div class="q-card" style="margin-top:16px">
        <p class="q-source">設問 ${qIdx + 1} / ${cs.questions.length}${isWrite ? ' ・ <span class="pill pill-accent">記述式</span>' : ''}</p>
        <p class="q-text">${esc(q.q)}</p>
        ${isWrite ? writeBody(q, done) : choiceBody(q, done)}
        <div id="case-feedback">${feedback || ''}</div>
        ${done ? `<div class="quiz-next"><button class="btn btn-primary" id="case-next">
          ${qIdx + 1 >= cs.questions.length ? '結果を見る' : '次の設問へ'}</button></div>` : ''}
      </div>`;

    $view().querySelector('[data-back]').addEventListener('click', renderMenu);
    if (done) {
      const btn = document.getElementById('case-next');
      btn.addEventListener('click', () => {
        qIdx += 1;
        draft = '';
        revealed = false;
        if (qIdx >= cs.questions.length) finish();
        else { paint(); window.scrollTo(0, document.querySelector('.q-card').offsetTop - 80); }
      });
      btn.focus();
      return;
    }
    if (isWrite) bindWrite(q);
    else {
      $view().querySelectorAll('.choice').forEach((btn) => {
        btn.addEventListener('click', () => pick(Number(btn.dataset.i)));
      });
    }
  }

  // ---------- 選択式 ----------
  function choiceBody(q, done) {
    return `<div class="choices">
      ${q.choices.map((c, i) => `
        <button class="choice ${done && i === q.answer ? 'is-correct' : ''}
          ${done && answers[qIdx] === i && i !== q.answer ? 'is-wrong' : ''}"
          data-i="${i}" ${done ? 'disabled' : ''}>
          <span class="choice-key">${KEYS[i]}</span><span>${esc(c)}</span>
        </button>`).join('')}
    </div>`;
  }

  function pick(i) {
    const q = cs.questions[qIdx];
    const ok = i === q.answer;
    answers[qIdx] = i;
    Store.recordAnswer(cs.partId, ok);
    Store.studyTick();
    paint(`
      <div class="feedback ${ok ? 'ok' : 'ng'}">
        <p class="feedback-head">${ok ? '正解!この調子!' : `残念、不正解… 正解は「${KEYS[q.answer]}」。本文に根拠があるので探してみよう`}</p>
        <p class="feedback-exp">${esc(q.exp)}</p>
      </div>`);
  }

  // ---------- 記述式 ----------
  function writeBody(q, done) {
    const n = len(draft);
    const over = q.limit && n > q.limit;
    const hits = (q.keywords || []).map((k) => ({ k, hit: draft.includes(k) }));
    return `
      <div class="write-box">
        <textarea id="write-input" class="write-input" rows="3" placeholder="解答を入力(頭の中で答えを作るだけでもOK)"
          ${revealed ? 'readonly' : ''}>${esc(draft)}</textarea>
        <div class="write-meta">
          ${q.limit ? `<span class="write-count ${over ? 'over' : ''}" id="write-count">${n} / ${q.limit}字${over ? '(字数オーバー)' : ''}</span>` : '<span></span>'}
          ${revealed ? '' : '<button class="btn btn-primary" id="write-reveal">解答例を見る</button>'}
        </div>
      </div>
      ${revealed ? `
        <div class="model-box">
          <p class="model-label">解答例</p>
          <p class="model-text">${esc(q.model)}</p>
          ${hits.length ? `
            <p class="model-label" style="margin-top:10px">採点の着眼点(キーワード)</p>
            <div class="kw-list">${hits.map((h) => `<span class="kw ${h.hit ? 'hit' : ''}">${h.hit ? '含む: ' : ''}${esc(h.k)}</span>`).join('')}</div>` : ''}
          <p class="feedback-exp" style="margin-top:10px">${esc(q.exp)}</p>
        </div>
        ${done ? '' : `
          <div class="grade-box">
            <p class="grade-label">解答例と比べて自己採点しよう(表現が違っても、同じ内容が書けていれば○)</p>
            <div class="grade-btns">${GRADES.map((g) => `<button class="grade-btn ${g.cls}" data-g="${g.v}">${g.label}</button>`).join('')}</div>
          </div>`}` : ''}`;
  }

  function bindWrite(q) {
    const input = document.getElementById('write-input');
    if (input && !revealed) {
      input.addEventListener('input', () => {
        draft = input.value;
        const n = len(draft);
        const el = document.getElementById('write-count');
        if (el && q.limit) {
          el.textContent = `${n} / ${q.limit}字${n > q.limit ? '(字数オーバー)' : ''}`;
          el.classList.toggle('over', n > q.limit);
        }
      });
      input.focus();
    }
    const rv = document.getElementById('write-reveal');
    if (rv) rv.addEventListener('click', () => { revealed = true; paint(); });
    $view().querySelectorAll('.grade-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const v = Number(b.dataset.g);
        answers[qIdx] = { self: v };
        Store.recordAnswer(cs.partId, v === 1);
        Store.studyTick();
        paint(`<div class="feedback ${v === 1 ? 'ok' : (v === 0 ? 'ng' : 'mid')}">
          <p class="feedback-head">${v === 1 ? 'よくできました!' : (v === 0 ? '解答例の言い回しを真似して、もう一度書いてみよう' : 'おしい!足りなかったキーワードを意識しよう')}</p>
        </div>`);
      });
    });
  }

  // ---------- 結果 ----------
  function pointOf(q, a) {
    if (a === undefined) return 0;
    if (q.type === 'write') return a.self || 0;
    return a === q.answer ? 1 : 0;
  }

  function finish() {
    const total = cs.questions.length;
    const score = cs.questions.reduce((s, q, i) => s + pointOf(q, answers[i]), 0);
    const percent = Math.round((score / total) * 100);
    const pass = percent >= 60;
    Store.setCaseResult(cs.id, percent, pass);
    Store.addHistory({ kind: '午後演習', label: cs.title, score: Math.round(score * 10) / 10, total, pass });
    $view().innerHTML = `
      <div class="quiz-shell"><div class="quiz-result">
        <p class="result-verdict ${pass ? 'pass' : 'fail'}">${pass ? 'CASE CLEAR!' : 'NOT CLEAR'}</p>
        <p class="score-big">${fmtScore(score)}<small> / ${total} 点(${percent}%)</small></p>
        <p class="result-sub">${pass
          ? '合格ライン(60%)を超えました。本文から根拠を拾う感覚がつかめてきています。'
          : '答えの根拠は必ず本文の中にあります。設問→本文の該当箇所の順に読み直してみましょう。'}
          <br>記述式は、△を1/2点として集計しています。</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" id="case-menu">一覧へ戻る</button>
          <button class="btn btn-ghost" id="case-retry">もう一度</button>
        </div>
      </div></div>`;
    document.getElementById('case-menu').addEventListener('click', renderMenu);
    document.getElementById('case-retry').addEventListener('click', () => start(cs.id));
  }

  return { renderMenu, start };
})();
