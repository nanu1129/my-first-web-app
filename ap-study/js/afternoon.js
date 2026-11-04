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

  // 科目B(旧午後)の分野(data/past-exams.js の AP.pmFields)。問1は必須、問2〜11から4問を選ぶ
  const fields = () => AP.pmFields || [];
  const fieldOf = (c) => fields().find((f) => f.id === c.fieldId) || { no: 99 };

  function guide() {
    return `
      <details class="guide-box">
        <summary>科目B(旧午後)のしくみと、分野の選び方</summary>
        <ul class="guide-list">
          <li><b>問1 情報セキュリティは必須</b>。残りの10分野(問2〜問11)から<b>4問を選んで</b>解答します(計5問・150分。1問あたり約30分)。</li>
          <li>令和8年度からは<b>CBT方式</b>で、パソコンの画面で長文を読み、記述式の解答はキーボードで入力します。問題の形式・数・試験時間は、これまでの午後試験と同じです。</li>
          <li>選び方のヒント: 文章を読み解くのが得意なら<b>プロジェクトマネジメント・サービスマネジメント・システム監査・経営戦略</b>、
            技術に強いなら<b>データベース・ネットワーク・プログラミング</b>が選ばれやすい分野です。</li>
          <li>本番では、問題をざっと見てからその回に解く4問を決めます。準備した分野が難しい回もあるので、<b>予備の1分野</b>も練習しておくと安心です。</li>
          <li>試験の形式は変わることがあります。最新の情報は <a href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">IPA 公式サイト</a> で確認してください。</li>
        </ul>
      </details>`;
  }

  // ---------- 科目Bで解く分野 ----------
  function accOf(part) {
    const a = Store.answerStats()[part];
    return a && a.total >= 5 ? Math.round((a.correct / a.total) * 100) : null;
  }
  let fieldMsg = '';
  function fieldPanel() {
    const chosen = Plan.pmChosen();
    const chips = fields().map((f) => {
      if (f.required) {
        return `<span class="pf-chip is-required"><span class="pf-top"><span class="pf-no">問${f.no}</span><span class="pf-tag">必須</span></span><span class="pf-name">${esc(f.name)}</span><span class="pf-hint">全員が解く</span></span>`;
      }
      const on = chosen.includes(f.id);
      const acc = accOf(f.part);
      return `<button class="pf-chip ${on ? 'is-on' : ''}" data-field="${f.id}" aria-pressed="${on}">
          <span class="pf-top"><span class="pf-no">問${f.no}</span>${on ? '<span class="pf-tag">選択</span>' : ''}</span>
          <span class="pf-name">${esc(f.name)}</span><span class="pf-hint">${esc(f.hint)}</span>
          ${acc === null ? '' : `<span class="pf-acc ${acc >= 70 ? 'ok' : (acc < 60 ? 'ng' : '')}">科目A ${acc}%</span>`}
        </button>`;
    }).join('');
    return `
      <section class="pm-panel" id="pm-fields">
        <div class="pm-head"><h3>科目Bで解く分野</h3>
          <span class="pm-count ${chosen.length >= 4 ? 'ok' : ''}">${chosen.length}/4 選択${chosen.length > 4 ? '(予備つき)' : ''}</span></div>
        <p class="pm-note">本番で解く4分野を選びます(予備にもう1分野まで)。「科目A ○%」は、その分野の土台になる科目Aのパートの正答率です。選ぶときの目安にしてください。</p>
        <div class="pf-grid">${chips}</div>
        ${fieldMsg ? `<p class="pm-msg" role="status">${esc(fieldMsg)}</p>` : ''}
      </section>`;
  }

  // ---------- IPAの過去問(科目B)の自己採点 ----------
  // 試験IDの短い表記(r07a → R7秋、h31s → H31春、r02o → R2)
  const shortName = (id) => {
    const m = /^([rh])(\d\d)([aso])$/.exec(id);
    if (!m) return id;
    return `${m[1] === 'r' ? 'R' : 'H'}${Number(m[2])}${{ a: '秋', s: '春', o: '' }[m[3]]}`;
  };
  let pmSel = null;   // 記録欄で選んでいる { exam, field }
  let pmMsg = '';
  function pastPanel() {
    const targets = Plan.pmTargets();
    if (!Plan.pmChosen().length) {
      return `
        <section class="pm-panel" id="pm-past">
          <div class="pm-head"><h3>IPAの過去問(科目B)</h3></div>
          <p class="pm-note">上で分野を選ぶと、IPAが公開している過去問から次に解く1問を案内し、自己採点を記録できるようになります。</p>
        </section>`;
    }
    const recs = new Map(Store.pmExams().map((r) => [r.id, r]));
    const exams = AP.pastExamList || [];
    const next = Plan.pmNext();
    const cur = pmSel || (next ? { exam: next.exam.id, field: next.field.id } : { exam: exams[0].id, field: targets[0].id });
    const curField = targets.find((f) => f.id === cur.field) || targets[0];
    const curRec = recs.get(Plan.pmKey(cur.exam, curField.no));
    const rows = targets.map((f) => {
      const done = exams.map((e) => recs.get(Plan.pmKey(e.id, f.no))).filter(Boolean);
      const avg = done.length ? Math.round(done.reduce((n, r) => n + r.score, 0) / done.length) : null;
      const cells = exams.slice(0, 10).map((e) => {
        const r = recs.get(Plan.pmKey(e.id, f.no));
        const isCur = cur.exam === e.id && curField.id === f.id;
        return `<button class="pp-cell ${r ? (r.score >= 60 ? 'ok' : 'ng') : ''} ${isCur ? 'is-cur' : ''}" data-pm="${e.id}|${f.id}"
            aria-label="${esc(e.name)} 問${f.no}${r ? ` ${r.score}%` : ' 未記録'}"><span>${shortName(e.id)}</span><b>${r ? r.score : '–'}</b></button>`;
      }).join('');
      return `
        <div class="pp-row">
          <div class="pp-head"><span class="pp-name">問${f.no} ${esc(f.name)}</span>
            <span class="pp-avg">${done.length ? `${done.length}問 ・ 平均 <b class="${avg >= 60 ? 'ok' : 'ng'}">${avg}%</b>` : 'まだ記録なし'}</span></div>
          <div class="pp-cells">${cells}</div>
        </div>`;
    }).join('');
    return `
      <section class="pm-panel" id="pm-past">
        <div class="pm-head"><h3>IPAの過去問(科目B)</h3><a class="pm-link" href="${Plan.PAST_URL}" target="_blank" rel="noopener">問題と解答例(IPA)</a></div>
        <p class="pm-note">1問30分を目安に解き、IPAが公開している解答例と比べて自己採点(%)を記録します。各問60%以上がひとつの目安です。</p>
        <p class="pm-next">${next ? `次の1問: <b>${esc(next.exam.name)} 問${next.field.no}(${esc(next.field.name)})</b>` : '選んだ分野の過去問をすべて記録しました。点の低い問題から解き直しましょう。'}</p>
        <form class="pm-form" id="pm-form">
          <select id="pm-exam" aria-label="試験">${exams.map((e) => `<option value="${e.id}" ${e.id === cur.exam ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
          <select id="pm-field" aria-label="問題">${targets.map((f) => `<option value="${f.id}" ${f.id === curField.id ? 'selected' : ''}>問${f.no} ${esc(f.name)}</option>`).join('')}</select>
          <label class="pm-score">自己採点 <input type="number" id="pm-score" min="0" max="100" inputmode="numeric" value="${curRec ? curRec.score : ''}" required> %</label>
          <button class="btn btn-primary" type="submit">${curRec ? '記録を直す' : '記録する'}</button>
          ${curRec ? '<button class="btn-text" type="button" id="pm-del">この記録を消す</button>' : ''}
        </form>
        ${pmMsg ? `<p class="pm-msg" role="status">${esc(pmMsg)}</p>` : ''}
        <div class="pp-list">${rows}</div>
        <p class="pm-foot">表は新しい10回分です。それより前の回も、上の欄で選んで記録できます。</p>
      </section>`;
  }

  // opts.focus: 'pm-fields' | 'pm-past'(その欄までスクロール)、opts.key: 記録欄で選ぶ過去問('r07a-6' など)
  function renderMenu(opts) {
    const o = opts || {};
    if (o.key) {
      const m = /^(.+)-(\d+)$/.exec(o.key);
      const f = m && fields().find((x) => x.no === Number(m[2]));
      if (f) pmSel = { exam: m[1], field: f.id };
    }
    paintMenu();
    if (o.focus) {
      const el = document.getElementById(o.focus);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80);
    }
  }

  function paintMenu() {
    const y = window.scrollY;
    const chosen = Plan.pmChosen().length ? Plan.pmTargets().map((f) => f.id) : null;
    const rank = (c) => (c.fieldId === 'sec' ? 0 : (chosen && chosen.includes(c.fieldId) ? 1 : 2));
    const cases = AP.cases.slice().sort((a, b) => rank(a) - rank(b) || fieldOf(a).no - fieldOf(b).no);
    $view().innerHTML = `
      <div class="crumb"><button data-back>実践トレーニング</button> › 午後演習</div>
      <h2 class="view-title">午後演習(科目B形式)</h2>
      <p class="view-lead">科目B(旧午後)と同じ「長文を読んで設問に答える」形式です。まず本番で解く分野を決め、
        <b>IPAの過去問</b>と、このサイトの演習(選択式 + 記述式)で練習しましょう。</p>
      ${guide()}
      ${fieldPanel()}
      ${pastPanel()}
      <h3 class="pm-section">このサイトの午後演習(${AP.cases.length}題)</h3>
      <div class="practice-menu">
        ${cases.map((c) => {
          const st = Store.caseState(c.id);
          const writes = c.questions.filter((q) => q.type === 'write').length;
          const mine = chosen && chosen.includes(c.fieldId) && c.fieldId !== 'sec';
          return `
          <button class="practice-card ${st && st.cleared ? 'is-cleared' : ''}" data-case="${c.id}">
            <span class="pc-title">${st && st.cleared ? '<span class="pill pill-ok">クリア</span> ' : ''}${mine ? '<span class="pill pill-accent">選んだ分野</span> ' : ''}${esc(c.title)}</span>
            <span class="pc-desc">${esc(c.intro)}</span>
            <span class="pc-cta">問${fieldOf(c).no === 99 ? '' : fieldOf(c).no} ${esc(c.field)} ・ 設問${c.questions.length}問(うち記述${writes})${st ? ` ・ ベスト ${st.best}%` : ''} →</span>
          </button>`;
        }).join('')}
      </div>`;
    window.scrollTo(0, y);
    bindMenu();
  }

  function bindMenu() {
    const v = $view();
    v.querySelector('[data-back]').addEventListener('click', Practice.renderMenu);
    v.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => start(b.dataset.case)));
    // 分野の選択(問1は必須なので選べない。最大 Plan.PM_MAX 分野)
    v.querySelectorAll('[data-field]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.field;
      const cur = Plan.pmChosen();
      fieldMsg = '';
      if (cur.includes(id)) Plan.setPmChosen(cur.filter((x) => x !== id));
      else if (cur.length >= Plan.PM_MAX) fieldMsg = `選べるのは${Plan.PM_MAX}分野(本番の4分野 + 予備1分野)までです。どれかを外してから選んでください。`;
      else Plan.setPmChosen(cur.concat(id));
      pmSel = null;
      paintMenu();
    }));
    // 表のマスを押すと、その回・その問題を記録欄で選ぶ
    v.querySelectorAll('[data-pm]').forEach((b) => b.addEventListener('click', () => {
      const [exam, field] = b.dataset.pm.split('|');
      pmSel = { exam, field };
      pmMsg = '';
      paintMenu();
      const inp = document.getElementById('pm-score');
      if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
    }));
    const form = v.querySelector('#pm-form');
    if (!form) return;
    const selected = () => {
      const f = fields().find((x) => x.id === form.querySelector('#pm-field').value);
      return { exam: form.querySelector('#pm-exam').value, field: f };
    };
    ['#pm-exam', '#pm-field'].forEach((sel) => form.querySelector(sel).addEventListener('change', () => {
      const cur = selected();
      pmSel = { exam: cur.exam, field: cur.field.id };
      pmMsg = '';
      paintMenu();
    }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cur = selected();
      const n = Number(form.querySelector('#pm-score').value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return;
      Store.setPmExam(Plan.pmKey(cur.exam, cur.field.no), Math.round(n));
      Store.logAct('pmpast');
      const ex = (AP.pastExamList || []).find((x) => x.id === cur.exam);
      pmMsg = `${ex ? ex.name : cur.exam} 問${cur.field.no}(${cur.field.name}): ${Math.round(n)}% を記録しました。`;
      pmSel = null; // 次の1問へ進む
      paintMenu();
    });
    const del = v.querySelector('#pm-del');
    if (del) del.addEventListener('click', () => {
      const cur = selected();
      if (!confirm('この過去問の記録を消しますか?')) return;
      Store.removePmExam(Plan.pmKey(cur.exam, cur.field.no));
      pmMsg = '記録を消しました。';
      paintMenu();
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
    // 広い画面では本文を左に固定して表示する。描き直しても、本文を読んでいた位置はそのままにする
    const prevPaper = $view().querySelector('.case-paper');
    const paperScroll = prevPaper ? prevPaper.scrollTop : 0;
    $view().innerHTML = `
      <div class="case-layout">
      <div class="crumb case-crumb"><button data-back>午後演習</button> › ${esc(cs.title)}</div>
      <div class="case-paper">
        <span class="lesson-part-tag">${esc(cs.field)}</span>
        <h2 class="lesson-title" style="font-size:19px">${esc(cs.title)}</h2>
        <p class="case-intro">${esc(cs.intro)}</p>
        ${cs.text.map(paragraph).join('')}
      </div>
      <div class="q-card case-q">
        <p class="q-source">設問 ${qIdx + 1} / ${cs.questions.length}${isWrite ? ' ・ <span class="pill pill-accent">記述式</span>' : ''}</p>
        <p class="q-text">${esc(q.q)}</p>
        ${isWrite ? writeBody(q, done) : choiceBody(q, done)}
        <div id="case-feedback">${feedback || ''}</div>
        ${done ? `<div class="quiz-next"><button class="btn btn-primary" id="case-next">
          ${qIdx + 1 >= cs.questions.length ? '結果を見る' : '次の設問へ'}</button></div>` : ''}
      </div>
      </div>`;
    $view().querySelector('.case-paper').scrollTop = paperScroll;

    $view().querySelector('[data-back]').addEventListener('click', () => renderMenu());
    if (done) {
      const btn = document.getElementById('case-next');
      btn.addEventListener('click', () => {
        qIdx += 1;
        draft = '';
        revealed = false;
        if (qIdx >= cs.questions.length) finish();
        else {
          paint();
          const top = document.querySelector('.case-q').getBoundingClientRect().top;
          if (top < 0 || top > window.innerHeight * 0.6) window.scrollTo(0, window.scrollY + top - 90);
        }
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
    Store.logAct('case');
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
    document.getElementById('case-menu').addEventListener('click', () => renderMenu());
    document.getElementById('case-retry').addEventListener('click', () => start(cs.id));
  }

  return { renderMenu, start };
})();
