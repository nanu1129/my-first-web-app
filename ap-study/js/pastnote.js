// 過去問(科目A)の間違い直しノート。成績タブの中に表示する。
// 間違えた問題の番号に印を付けると、得点・分野別の内訳・解き直しリストができる
const PastNote = (() => {
  const TOTAL = 80, PASS = 48; // 合格ラインは60%(48問)
  const REDO_PER_DAY = 5;      // 今日のメニューで案内する、1日の解き直しの数
  // 出題の3区分。問題番号の範囲は毎回同じ
  const AREAS = [
    { id: 'tech', part: null, name: 'テクノロジ系', from: 1, to: 50 },
    { id: 'mgmt', part: 'management', name: 'マネジメント系', from: 51, to: 60 },
    { id: 'strat', part: 'strategy', name: 'ストラテジ系', from: 61, to: 80 },
  ];
  // テクノロジ系の内訳。問題番号から分けた目安(回によって境目が1〜2問ずれる)。part はこのサイトのパート
  const FIELDS = [
    { part: 'basics', name: '基礎理論', from: 1, to: 7 },
    { part: 'computer', name: 'コンピュータシステムなど', from: 8, to: 25 },
    { part: 'database', name: 'データベース', from: 26, to: 30 },
    { part: 'network', name: 'ネットワーク', from: 31, to: 35 },
    { part: 'security', name: 'セキュリティ', from: 36, to: 45 },
    { part: 'dev', name: '開発技術', from: 46, to: 50 },
  ];

  let current = null; // 開いている回
  const $view = () => document.getElementById('view-stats');
  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
  const exams = () => AP.pastExamList || [];
  const nameOf = (id) => (exams().find((e) => e.id === id) || { name: id }).name;
  const inRange = (r, no) => no >= r.from && no <= r.to;
  const areaOf = (no) => AREAS.find((a) => inRange(a, no));

  // 過去問道場(応用情報技術者試験ドットコム)の、問題と解説のページ。
  // 例: r07a → 07_aki、h31s → 31_haru、r02o(10月実施)→ 02_aki
  function qUrl(id, no) {
    const m = /^[rh](\d\d)([aso])$/.exec(id);
    return m ? `https://www.ap-siken.com/kakomon/${m[1]}_${m[2] === 's' ? 'haru' : 'aki'}/q${no}.html` : null;
  }

  // 範囲ごとの、落とした数と正答率。times は集計した回数(1回なら1)
  function tally(ranges, missedNos, times) {
    return ranges.map((r) => {
      const n = (r.to - r.from + 1) * (times || 1);
      const miss = missedNos.filter((no) => inRange(r, no)).length;
      return Object.assign({}, r, { n, miss, ok: n - miss, pct: Math.round(((n - miss) / n) * 100) });
    });
  }
  // いちばん落としている分野(2問以上落としているもののうち、正答率が最も低いもの)
  function weakest(fields, areas) {
    return fields.concat(areas.filter((a) => a.part))
      .filter((x) => x.miss >= 2)
      .sort((a, b) => (a.pct - b.pct) || (b.miss - a.miss))[0] || null;
  }

  // その回の状態: 印・得点の記録・両者が合っているか
  function status(id) {
    const note = Store.pastNote(id);
    const rec = Store.pastExams().find((r) => r.id === id) || null;
    const score = TOTAL - note.missed;
    const linked = !!rec && (!!rec.auto || (rec.total === TOTAL && rec.score === score));
    return { note, rec, score, linked };
  }

  // 成績タブ用: 印と得点が合っている回をまとめた分野別の正答率と、解き直しの残り
  function summary() {
    const missed = [];
    let times = 0;
    exams().forEach((e) => {
      const st = status(e.id);
      if (st.linked && st.note.missed) { times += 1; missed.push(...st.note.wrong, ...st.note.fixed); }
    });
    const areas = tally(AREAS, missed, times), fields = tally(FIELDS, missed, times);
    return { times, areas, fields, weak: times ? weakest(fields, areas) : null, redo: redoStatus() };
  }

  // 解き直しの残り。left は全体、due は今日のメニューで案内する分(解いた当日の回は、日をあけるために入れない)。
  // next は次に取り組む回(記録が古い回から片づける)
  function redoStatus() {
    const d = new Date();
    const today0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const recs = new Map(Store.pastExams().map((r) => [r.id, r]));
    const list = exams().map((e) => ({ id: e.id, name: e.name, left: Store.pastNote(e.id).wrong.length, at: recs.has(e.id) ? recs.get(e.id).at : 0 }))
      .filter((x) => x.left > 0).sort((a, b) => a.at - b.at);
    const sum = (xs) => xs.reduce((n, x) => n + x.left, 0);
    const dueList = list.filter((x) => x.at < today0);
    return { left: sum(list), exams: list.length, first: list[0] || null, due: sum(dueList), dueExams: dueList.length, next: dueList[0] || null };
  }

  // 開く回の初期値: 解き直しが残っている回 → 最後に記録した回 → まだ記録していない最初の回
  function defaultExam() {
    const redo = redoStatus();
    if (redo.first) return redo.first.id;
    const recs = Store.pastExams();
    if (recs.length) return recs[recs.length - 1].id;
    return exams().length ? exams()[0].id : null;
  }

  function render() {
    const id = current;
    const st = status(id);
    const { note, rec, score } = st;
    const cell = (no) => {
      const s = note.marks[no] ? note.marks[no].s : '';
      const label = `問${no} ${s === 'w' ? '間違い' : s === 'f' ? '解き直して正解' : '印なし'}`;
      return `<button class="pn-cell ${s ? `is-${s}` : ''}" data-no="${no}" aria-pressed="${s ? 'true' : 'false'}" aria-label="${label}">${no}${
        s ? `<i aria-hidden="true">${s === 'w' ? '×' : '✓'}</i>` : ''}</button>`;
    };
    const groups = AREAS.map((a) => {
      let cells = '';
      for (let no = a.from; no <= a.to; no++) cells += cell(no);
      return `<div class="pn-group"><p class="pn-gname">${a.name}<small>問${a.from}〜${a.to}</small></p><div class="pn-grid">${cells}</div></div>`;
    }).join('');

    // ---- 得点 ----
    const pct = Math.round((score / TOTAL) * 100);
    let scoreHtml;
    if (!note.missed && !rec) {
      scoreHtml = '<p class="chart-empty">まだ印がありません。上の表で、間違えた問題の番号をタップしてください。</p>';
    } else if (!rec) {
      scoreHtml = `<p class="pn-warn">この回の得点は、まだ記録されていません。</p>
        <div class="btn-row"><button class="btn btn-primary" id="pn-link">印の数から得点を記録する(${score} / ${TOTAL})</button></div>`;
    } else if (!st.linked) {
      const recMiss = rec.total - rec.score;
      scoreHtml = `<p class="pn-warn">記録してある得点は <b>${rec.score} / ${rec.total}</b>(間違い ${recMiss}問)ですが、印は <b>${note.missed}問</b> です。${
        note.missed < recMiss ? `あと${recMiss - note.missed}問に印を付けると、得点と合い、分野別の正答率が出ます。` : '印の数のほうが多くなっています。'}</p>
        <div class="btn-row"><button class="btn btn-ghost" id="pn-link">得点を印の数に合わせる(${score} / ${TOTAL})</button></div>`;
    } else {
      scoreHtml = `<p class="pn-score"><b class="${score >= PASS ? 'ok' : 'ng'}">${score}</b> / ${TOTAL}問 正解<span>(${pct}% ・ 間違い ${note.missed}問)</span></p>
        <p class="pn-score-note">${score >= PASS ? `合格ライン(60% = ${PASS}問)を ${score - PASS}問 上回っています。` : `合格ライン(60% = ${PASS}問)まで、あと ${PASS - score}問です。`}得点は、印の数から自動で成績に記録されます。</p>`;
    }

    // ---- 分野別の内訳 ----
    let breakdown = '';
    const missedNos = note.wrong.concat(note.fixed);
    if (note.missed && !st.linked) {
      // 印が一部だけのあいだは正答率を出さず、印の数だけを見せる(実際より高く見えてしまうため)
      breakdown = `
        <p class="pn-sub">印を付けた問題の内訳</p>
        <div class="pn-fields">${tally(AREAS, missedNos).map((a) => `<span class="pn-field">${a.name} <b>${a.miss}問</b></span>`).join('')}</div>
        <p class="pn-foot">得点と印の数が合うと、分野別の正答率を表示します。</p>`;
    } else if (note.missed) {
      const areas = tally(AREAS, missedNos), fields = tally(FIELDS, missedNos);
      const weak = weakest(fields, areas);
      breakdown = `
        <div class="acc-bars pn-areas">${areas.map((a) => `
          <div class="acc-row">
            <span class="acc-name">${a.name}<small>問${a.from}〜${a.to}</small></span>
            <span class="acc-bar"><span class="acc-fill ${a.pct >= 60 ? 'is-good' : 'is-weak'}" style="width:${a.pct}%"></span><span class="acc-pass" title="合格ライン60%"></span></span>
            <span class="acc-val"><b>${a.pct}%</b> <small>${a.ok}/${a.n}</small></span>
          </div>`).join('')}</div>
        <p class="pn-sub">テクノロジ系の内訳(正解数)</p>
        <div class="pn-fields">${fields.map((f) => `<span class="pn-field ${f.pct < 60 ? 'is-weak' : ''}">${f.name} <b>${f.ok}/${f.n}</b></span>`).join('')}</div>
        <p class="pn-foot">内訳は、問題番号から分けた目安です(回によって境目が1〜2問ずれます)。</p>
        ${weak ? `<p class="pn-weak"><span>いちばん落としているのは <b>${weak.name}</b>(${weak.n}問中 ${weak.miss}問)。</span>
          <button class="btn-mini" id="pn-drill" data-part="${weak.part}">${Coach.studiedQuestions(weak.part).length ? 'この分野を10問練習する' : 'この分野の教材を開く'}</button></p>` : ''}`;
    }

    // ---- 解き直しリスト ----
    const item = (no, done) => {
      const url = qUrl(id, no);
      return `
        <li class="pn-item ${done ? 'is-done' : ''}">
          <div class="pn-item-head"><b>問${no}</b><span class="pn-area">${areaOf(no).name}</span>
            ${url ? `<a href="${url}" target="_blank" rel="noopener">問題と解説<span aria-hidden="true"> ↗</span></a>` : ''}</div>
          <input class="pn-memo" type="text" maxlength="120" data-memo="${no}" value="${esc(note.marks[no].m)}" placeholder="間違えた理由のメモ" aria-label="問${no}のメモ">
          ${done ? `<button class="btn-text" data-undo="${no}">印を「間違い」に戻す</button>` : `<button class="pn-fix" data-fix="${no}" aria-label="問${no}を解き直して正解できた">正解できた</button>`}
        </li>`;
    };
    const redoHtml = !note.missed ? '<p class="chart-empty">印を付けた問題が、ここに並びます。</p>' : `
      ${note.wrong.length ? `<ul class="pn-list">${note.wrong.map((no) => item(no, false)).join('')}</ul>`
        : '<p class="pn-alldone">この回の間違いは、すべて解き直しました。</p>'}
      ${note.fixed.length ? `<details class="pn-done"><summary>解き直して正解した問題 ${note.fixed.length}問</summary>
        <ul class="pn-list">${note.fixed.map((no) => item(no, true)).join('')}</ul></details>` : ''}`;

    const marked = new Set(Store.pastNoteIds());
    $view().innerHTML = `
      <div class="pn-wrap" data-exam="${id}">
        <div class="crumb"><button data-back>成績</button> › 過去問の間違い直しノート</div>
        <h2 class="view-title">過去問の間違い直しノート</h2>
        <p class="view-lead">本物の過去問(科目A・80問)を解いたら、間違えた問題の番号に印を付けます。得点と分野別の内訳が分かり、解き直す問題のリストができます。</p>

        <section class="panel pn-panel">
          <div class="pn-head">
            <label class="pn-pick">回 <select id="pn-exam">${exams().map((e) => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${esc(e.name)}${marked.has(e.id) ? '(印あり)' : ''}</option>`).join('')}</select></label>
            <a class="pn-ipa" href="${Plan.PAST_URL}" target="_blank" rel="noopener">問題冊子と解答(IPA)</a>
          </div>
          <h3>① 間違えた問題の番号をタップ</h3>
          <p class="panel-note">答え合わせをして、間違えた問題に印を付けます(迷って当たった問題にも付けておくと、解き直しで確かめられます)。もう一度タップすると印が消えます。</p>
          ${groups}
          <div class="pn-legend">
            <span><i class="pn-key is-w" aria-hidden="true">×</i>間違い</span>
            <span><i class="pn-key is-f" aria-hidden="true">✓</i>解き直して正解</span>
            ${note.missed ? '<button class="btn-text" id="pn-clear">この回の印をすべて消す</button>' : ''}
          </div>
        </section>

        <section class="panel pn-panel" id="pn-result">
          <h3>② 得点と分野別の内訳</h3>
          ${scoreHtml}
          ${breakdown}
        </section>

        <section class="panel pn-panel" id="pn-redo">
          <div class="pn-redo-head"><h3>③ 解き直しリスト</h3>${note.missed ? `<span class="pill ${note.wrong.length ? 'pill-accent' : 'pill-ok'}">${note.wrong.length ? `残り ${note.wrong.length}問` : '完了'}</span>` : ''}</div>
          <p class="panel-note">解説を読んで理解したら、日をあけて、何も見ずにもう一度解きます。自力で正解できたら「正解できた」を押します。「問題と解説」は、過去問道場(応用情報技術者試験ドットコム)の該当ページを開きます。</p>
          ${redoHtml}
        </section>
      </div>`;
    bind();
  }

  function bind() {
    const v = $view(), id = current;
    v.querySelector('[data-back]').addEventListener('click', () => {
      Stats.render();
      const el = document.getElementById('past-panel');
      if (el) el.scrollIntoView({ block: 'start' });
    });
    v.querySelector('#pn-exam').addEventListener('change', (e) => { current = e.target.value; render(); });
    // 印: なし → 間違い → なし。解き直し済みの問題は「間違い」に戻す
    v.querySelectorAll('.pn-cell').forEach((b) => b.addEventListener('click', () => {
      const no = Number(b.dataset.no);
      const s = (Store.pastNote(id).marks[no] || {}).s;
      Store.setPastMark(id, no, s === 'w' ? 'n' : 'w');
      render();
      const again = $view().querySelector(`.pn-cell[data-no="${no}"]`);
      if (again) again.focus({ preventScroll: true });
    }));
    v.querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', () => {
      Store.setPastMark(id, Number(b.dataset.fix), 'f');
      Store.logAct('pastredo');
      render();
    }));
    v.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => {
      Store.setPastMark(id, Number(b.dataset.undo), 'w');
      render();
    }));
    v.querySelectorAll('.pn-memo').forEach((inp) => {
      inp.addEventListener('change', () => Store.setPastMemo(id, Number(inp.dataset.memo), inp.value));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });
    const link = v.querySelector('#pn-link');
    if (link) link.addEventListener('click', () => { Store.linkPastScore(id); render(); });
    const clear = v.querySelector('#pn-clear');
    if (clear) clear.addEventListener('click', () => {
      if (confirm(`${nameOf(id)} の印とメモを、すべて消しますか?`)) { Store.clearPastNote(id); render(); }
    });
    const drill = v.querySelector('#pn-drill');
    // 学んだ分野なら弱点ドリル(10問)、まだ学んでいない分野なら教材(次に学ぶユニット)へ
    if (drill) drill.addEventListener('click', () => {
      if (Coach.startWeakDrill(drill.dataset.part, () => open(id))) return;
      const units = Order.unitsOfPart(drill.dataset.part);
      const unit = units.find((u) => !Store.isUnitCleared(u.id)) || units[0];
      if (unit) Course.openLesson(unit.id);
    });
  }

  // opts.focus: 'redo' で解き直しリストまでスクロール
  function open(id, opts) {
    current = id && exams().some((e) => e.id === id) ? id : defaultExam();
    if (!current) return;
    render();
    App.show('stats');
    if (opts && opts.focus === 'redo') {
      const el = document.getElementById('pn-redo');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76);
    }
  }
  const isOpen = () => !!$view().querySelector('.pn-wrap') && !$view().hidden;
  // 同期で記録が変わったときの描き直し(メモの入力中は、入力を消さないように待つ)
  function refresh() {
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('pn-memo')) return;
    render();
  }

  return { open, isOpen, refresh, summary, redoStatus, qUrl, AREAS, FIELDS, REDO_PER_DAY };
})();
