// コースマップ(ホーム)・教材表示・ユニット完了/本番レベル演習の解放ロジック
const Course = (() => {
  const $home = () => document.getElementById('view-home');
  const $lesson = () => document.getElementById('view-lesson');

  // ストロークアイコン(マナビットDS: 絵文字の代わりに線画SVG)
  const IC = {
    check: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 13l4 4 10-11"/></svg>',
    lock: '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function partOf(partId) {
    return AP.parts.find((p) => p.id === partId);
  }
  function lessonsOf(partId) {
    const l = AP.lessons.find((x) => x.partId === partId);
    return l ? l.units : [];
  }
  function questionsOf(partId) {
    return AP.questions.filter((q) => q.partId === partId);
  }
  function partProgress(partId) {
    const units = lessonsOf(partId);
    const done = units.filter((u) => Store.isUnitCleared(u.id)).length;
    return { done, total: units.length, unlocked: done === units.length && units.length > 0 };
  }

  // ---------- ホーム(コースマップ) ----------
  function renderHome() {
    const allUnits = AP.parts.reduce((n, p) => n + lessonsOf(p.id).length, 0);
    const doneUnits = AP.parts.reduce((n, p) => n + partProgress(p.id).done, 0);
    const clearedExams = AP.parts.filter((p) => {
      const s = Store.partExamState(p.id);
      return s && s.cleared;
    }).length;
    const pct = allUnits ? Math.round((doneUnits / allUnits) * 100) : 0;
    const R = 30, C = 2 * Math.PI * R;

    $home().innerHTML = `
      <div class="hero">
        <div>
          <h2>教材で学ぶ → 一問一答 → 本番レベル演習で仕上げる</h2>
          <p>ユニットの一問一答に80%以上で合格すると完了。パートの全ユニットを終えると、本試験レベルの演習が解放されます。</p>
        </div>
        <div class="hero-progress">
          <svg class="donut" viewBox="0 0 74 74" role="img" aria-label="全体の進捗 ${pct}%">
            <circle cx="37" cy="37" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="7"/>
            <circle cx="37" cy="37" r="${R}" fill="none" stroke="var(--accent)" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="${(pct / 100) * C} ${C}"
              transform="rotate(-90 37 37)"/>
            <text class="donut-num" x="37" y="36" text-anchor="middle" dominant-baseline="middle">${pct}%</text>
            <text class="donut-unit-label" x="37" y="50" text-anchor="middle">達成</text>
          </svg>
          <div class="hero-progress-text">
            ユニット <strong>${doneUnits} / ${allUnits}</strong> 完了<br>
            本番レベル演習クリア <strong>${clearedExams} / ${AP.parts.length}</strong> パート
          </div>
        </div>
      </div>
      <div class="search-box">
        <input type="search" id="home-search" class="search-input" placeholder="教材・用語を検索(例: RAID、クリティカルパス、正規化)"
          aria-label="教材と用語を検索" autocomplete="off">
        <div id="search-results" class="search-results" hidden></div>
      </div>
      ${renderPlanCard()}
      ${renderDailyStrip()}
      ${AP.parts.map(renderPartCard).join('')}`;

    // イベント
    $home().querySelectorAll('.unit-row').forEach((row) => {
      row.addEventListener('click', () => openLesson(row.dataset.unit));
    });
    $home().querySelectorAll('.part-exam-row.is-unlocked, .part-exam-row.is-cleared').forEach((row) => {
      row.addEventListener('click', () => startPartExam(row.dataset.part));
    });
    const reviewBtn = document.getElementById('daily-review-btn');
    if (reviewBtn) reviewBtn.addEventListener('click', startReview);
    const goalSel = document.getElementById('daily-goal');
    if (goalSel) goalSel.addEventListener('change', () => {
      Store.setGoal(Number(goalSel.value));
      renderHome();
    });
    const examInput = document.getElementById('exam-date');
    if (examInput) examInput.addEventListener('change', () => {
      if (examInput.value) { Plan.setExamDate(examInput.value); renderHome(); }
    });
    const applyPace = document.getElementById('apply-pace');
    if (applyPace) applyPace.addEventListener('click', () => {
      Store.setGoal(Number(applyPace.dataset.n));
      renderHome();
    });
    const search = document.getElementById('home-search');
    if (search) {
      let t = null;
      search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => renderSearch(search.value), 120); });
      search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; renderSearch(''); } });
    }
    $home().querySelectorAll('.task-row').forEach((row) => {
      row.addEventListener('click', () => runTask(row.dataset.act, row.dataset.id));
    });
  }

  // ---------- 学習計画(試験日から逆算) ----------
  function renderPlanCard() {
    const p = Plan.compute();
    if (p.passed) {
      return `
      <div class="plan-card">
        <div class="plan-head">
          <div class="plan-head-main">
            <p class="plan-phase"><span class="pill pill-accent">試験日を過ぎました</span> 設定していた試験日(${p.jp(p.exam)})を過ぎています。</p>
            <p class="plan-track">次の試験を受ける場合は、試験日を設定し直すと学習計画を作り直します。おつかれさまでした!</p>
          </div>
          <label class="plan-date">
            <span>試験日</span>
            <input type="date" id="exam-date" value="${p.examStr}">
            <a class="plan-ipa" href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">試験日程を確認(IPA)</a>
          </label>
        </div>
      </div>`;
    }
    const pctElapsed = Math.min(100, Math.round((p.elapsed / p.totalDays) * 100));
    const trackText = {
      ahead: `予定より ${p.diff}ユニット 先行しています。この調子!`,
      ontrack: '計画どおりのペースです。',
      behind: `予定より ${-p.diff}ユニット 遅れ気味。1日のペースを少し上げよう。`,
    }[p.onTrack];

    const segs = p.phases.map((ph, i) => {
      return `<div class="phase-seg ${i === p.phaseIdx ? 'is-now' : ''} ${i < p.phaseIdx ? 'is-past' : ''}">
          <span class="ps-name">${i + 1}. ${esc(ph.name)}</span>
          <span class="ps-date">〜${p.jp(ph.end)}</span>
        </div>`;
    }).join('');

    const tasks = p.tasks || [];
    return `
      <div class="plan-card">
        <div class="plan-head">
          <div class="plan-count">
            <span class="pc-label">${p.daysLeft === 0 ? '今日が' : '試験まで'}</span>
            <span class="pc-num">${p.daysLeft === 0 ? '本番' : `${p.daysLeft}<small>日</small>`}</span>
          </div>
          <div class="plan-head-main">
            <p class="plan-phase"><span class="pill pill-accent">いま ${esc(p.phase.name)}</span> ${esc(p.phase.desc)}</p>
            <p class="plan-track ${p.onTrack}">${esc(trackText)}</p>
          </div>
          <label class="plan-date">
            <span>試験日</span>
            <input type="date" id="exam-date" value="${p.examStr}">
            <a class="plan-ipa" href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">試験日程を確認(IPA)</a>
          </label>
        </div>
        <div class="phase-bar">${segs}
          <div class="phase-now" style="left:${pctElapsed}%"><span>今日</span></div>
        </div>
        <div class="plan-pace">
          <span class="pill">目標ペース</span> ${esc(p.paceLabel)} ・ 1日 約${p.recommended}問
          <button class="btn-mini" id="apply-pace" data-n="${nearestGoal(p.recommended)}">今日の目標に設定</button>
        </div>
        <div class="task-list">
          <p class="task-head">今日やること</p>
          ${tasks.length ? tasks.map((t) => `
            <button class="task-row" data-act="${t.act}" ${t.id ? `data-id="${t.id}"` : ''}>
              <span class="tr-check"></span>
              <span class="tr-main"><span class="tr-label">${esc(t.label)}</span><br>
                <span class="tr-sub">${esc(t.sub)}</span></span>
              <span class="tr-cta">→</span>
            </button>`).join('')
            : '<p class="chart-empty">今日のノルマは達成済みです。おつかれさま。</p>'}
        </div>
      </div>`;
  }

  // ---------- 検索(教材の節と用語) ----------
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase();

  function snippet(text, q) {
    const t = String(text).replace(/\n+/g, ' ');
    const i = norm(t).indexOf(q);
    const from = Math.max(0, i - 24);
    const part = t.slice(from, from + 90);
    return (from > 0 ? '…' : '') + part + (from + 90 < t.length ? '…' : '');
  }
  function mark(text, q) {
    const s = esc(text);
    const i = norm(text).indexOf(q);
    if (i < 0 || !q) return s;
    // NFKC で長さが変わらない範囲(通常の日本語・英数字)でハイライトする
    const raw = String(text);
    return esc(raw.slice(0, i)) + '<mark>' + esc(raw.slice(i, i + q.length)) + '</mark>' + esc(raw.slice(i + q.length));
  }

  function renderSearch(value) {
    const box = document.getElementById('search-results');
    if (!box) return;
    const q = norm(value).trim();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    const lessonHits = [];
    AP.lessons.forEach((l) => l.units.forEach((u) => u.sections.forEach((sec) => {
      const pts = (sec.points || []).join(' / ');
      const inH = norm(sec.h).includes(q), inBody = norm(sec.body).includes(q), inPts = norm(pts).includes(q);
      if (inH || inBody || inPts) {
        // 見出しは場所の表示に出すので、抜粋は本文 → POINT の順で一致箇所の周辺を使う
        const src = inBody ? sec.body : (inPts ? pts : sec.body);
        lessonHits.push({ u, sec, part: partOf(l.partId), text: snippet(src, q), score: (inH ? 2 : 0) + (inBody ? 1 : 0) });
      }
    })));
    lessonHits.sort((a, b) => b.score - a.score); // 見出しに含む節を先に
    const termHits = AP.terms.filter((t) => norm(t.term).includes(q) || norm(t.def).includes(q))
      .sort((a, b) => (norm(b.term).includes(q)) - (norm(a.term).includes(q)));
    if (!lessonHits.length && !termHits.length) {
      box.hidden = false;
      box.innerHTML = '<p class="search-empty">見つかりませんでした。別の言葉で探してみよう。</p>';
      return;
    }
    box.hidden = false;
    box.innerHTML = `
      ${lessonHits.length ? `<p class="search-head">教材(${lessonHits.length}件)</p>
        ${lessonHits.slice(0, 8).map((h, i) => `
          <button class="search-hit" data-hit="${i}">
            <span class="sh-where">${esc(h.part.name)} › ${esc(h.u.title)} › ${mark(h.sec.h, q)}</span>
            <span class="sh-text">${mark(h.text, q)}</span>
          </button>`).join('')}` : ''}
      ${termHits.length ? `<p class="search-head">用語(${termHits.length}件)</p>
        ${termHits.slice(0, 6).map((t) => `
          <div class="search-term"><b>${mark(t.term, q)}</b><span>${mark(t.def, q)}</span></div>`).join('')}` : ''}`;
    box.querySelectorAll('[data-hit]').forEach((b) => {
      b.addEventListener('click', () => {
        const h = lessonHits[Number(b.dataset.hit)];
        openLesson(h.u.id);
        // 該当する節までスクロールし、少しの間ハイライトする
        const target = [...document.querySelectorAll('#view-lesson .lesson-section h3')].find((el) => el.textContent === h.sec.h);
        if (target) {
          const sec = target.parentElement;
          sec.classList.add('is-found');
          setTimeout(() => { window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 80); }, 0);
          setTimeout(() => sec.classList.remove('is-found'), 2400);
        }
      });
    });
  }

  // 目標セレクタ(10/20/30/50)のうち推奨値に最も近いもの
  function nearestGoal(n) {
    return [10, 20, 30, 50].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  }

  function runTask(act, id) {
    if (act === 'review') return startReview();
    if (act === 'unit') return openLesson(id);
    if (act === 'part') return startPartExam(id);
    if (act === 'drill') { App.navigate('practice'); return Drill.render(); }
    if (act === 'mock') return App.navigate('exam');
    if (act === 'case') { App.navigate('practice'); return Afternoon.renderMenu(); }
  }

  // ---------- デイリーストリップ(ストリーク・今日の目標・今日の復習) ----------
  function renderDailyStrip() {
    const s = Store.streakInfo();
    const dueCount = Store.srsDue((AP.allQuestions || []).map((q) => q.qid)).length;
    const goalPct = Math.min(100, Math.round((s.todayCount / s.goal) * 100));
    const goalDone = s.todayCount >= s.goal;
    const goalOptions = [10, 20, 30, 50]
      .map((n) => `<option value="${n}" ${n === s.goal ? 'selected' : ''}>${n}問</option>`).join('');

    return `
      <div class="daily-strip">
        <div class="daily-card streak">
          <span class="daily-num">${s.current}<small>日</small></span>
          <span class="daily-label">連続学習${s.longest > s.current ? ` ・ 最長${s.longest}日` : ''}</span>
        </div>
        <div class="daily-card goal">
          <div class="daily-goal-head">
            <span class="daily-label">今日の目標</span>
            <select id="daily-goal" class="daily-goal-select" aria-label="1日の目標問題数">${goalOptions}</select>
          </div>
          <div class="daily-goal-bar"><div class="daily-goal-fill ${goalDone ? 'done' : ''}" style="width:${goalPct}%"></div></div>
          <span class="daily-goal-count">${s.todayCount} / ${s.goal} 問${goalDone ? ' ・ 達成!' : ''}</span>
        </div>
        <button class="daily-card review ${dueCount ? 'has-due' : ''}" id="daily-review-btn" ${dueCount ? '' : 'disabled'}>
          <span class="daily-num">${dueCount}<small>問</small></span>
          <span class="daily-label">${dueCount ? '今日の復習 →' : '復習はいまなし'}</span>
        </button>
      </div>`;
  }

  function startReview() {
    const dueIds = new Set(Store.srsDue((AP.allQuestions || []).map((q) => q.qid)));
    const qs = Quiz.shuffle(AP.allQuestions.filter((q) => dueIds.has(q.qid)));
    if (!qs.length) return;
    Quiz.start({
      title: '今日の復習(間隔反復)',
      questions: qs,
      mode: 'practice',
      passRate: 0.6,
      backLabel: '学習マップへ',
      onBack: App.goHome,
      resultNote: (r) => (r.pass
        ? 'よく覚えていました。正解した問題は次の出題がぐっと先になります。'
        : '間違えた問題は明日また出てきます。忘れる前に定着させよう。'),
      onFinish: (r) => {
        Store.addHistory({ kind: '間隔反復の復習', label: `今日の復習 ${r.total}問`, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  function renderPartCard(part) {
    const units = lessonsOf(part.id);
    const prog = partProgress(part.id);
    const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    const nextUnit = units.find((u) => !Store.isUnitCleared(u.id));

    const unitRows = units.map((u, i) => {
      const cleared = Store.isUnitCleared(u.id);
      const isNext = nextUnit && nextUnit.id === u.id;
      const st = Store.unitState(u.id);
      return `
        <button class="unit-row ${cleared ? 'is-done' : ''} ${isNext ? 'is-next' : ''}" data-unit="${u.id}">
          <span class="unit-badge">${cleared ? IC.check : i + 1}</span>
          <span class="unit-row-main">
            <span class="unit-row-title">${esc(u.title)}</span><br>
            <span class="unit-row-sub">教材 約${u.minutes}分 + 一問一答${u.checks.length}問${
              st && !cleared ? ` ・ 前回 ${st.best}/${st.total}` : ''}</span>
          </span>
          <span class="unit-row-cta">${cleared ? '完了・復習する' : isNext ? '学習する →' : ''}</span>
        </button>`;
    }).join('');

    const qs = questionsOf(part.id);
    const examState = Store.partExamState(part.id);
    // 一度クリア済みなら、ユニット追加でロックに戻さない
    const accessible = prog.unlocked || !!examState;
    let examRow;
    if (!accessible) {
      const remain = prog.total - prog.done;
      examRow = `
        <div class="part-exam-row">
          <span class="unit-badge">${IC.lock}</span>
          <span class="part-exam-main">
            <span class="part-exam-title">本番レベル演習(${qs.length}問)</span><br>
            <span class="part-exam-sub">あと${remain}ユニットで解放されます</span>
          </span>
        </div>`;
    } else if (examState && examState.cleared) {
      examRow = `
        <button class="part-exam-row is-cleared" data-part="${part.id}">
          <span class="unit-badge">${IC.check}</span>
          <span class="part-exam-main">
            <span class="part-exam-title">本番レベル演習クリア済み!(ベスト ${examState.best}%)</span><br>
            <span class="part-exam-sub">もう一度挑戦して記録を更新しよう</span>
          </span>
        </button>`;
    } else {
      examRow = `
        <button class="part-exam-row is-unlocked" data-part="${part.id}">
          <span class="unit-badge">!</span>
          <span class="part-exam-main">
            <span class="part-exam-title">本番レベル演習が解放されました(${qs.length}問)</span><br>
            <span class="part-exam-sub">正答率60%以上でパートクリア${examState ? ` ・ 前回 ${examState.best}%` : ''}</span>
          </span>
        </button>`;
    }

    return `
      <div class="part-card" id="part-${part.id}">
        <div class="part-head">
          <span class="part-icon">${part.icon}</span>
          <span class="part-head-main">
            <span class="part-name">${esc(part.name)}</span><br>
            <span class="part-desc">${esc(part.desc)}</span>
          </span>
          <span class="part-meter">
            <span class="part-meter-label">${prog.done}/${prog.total} ユニット</span>
            <span class="part-meter-bar"><span class="part-meter-fill" style="width:${pct}%"></span></span>
          </span>
        </div>
        <div class="unit-list">${unitRows}${examRow}</div>
      </div>`;
  }

  // ---------- 教材(学習パート) ----------
  function findUnit(unitId) {
    for (const l of AP.lessons) {
      const u = l.units.find((x) => x.id === unitId);
      if (u) return { unit: u, part: partOf(l.partId) };
    }
    return null;
  }

  function openLesson(unitId) {
    const found = findUnit(unitId);
    if (!found) return;
    const { unit, part } = found;
    const cleared = Store.isUnitCleared(unit.id);

    $lesson().innerHTML = `
      <div class="crumb"><button data-home>学習マップ</button> › ${esc(part.name)} › ${esc(unit.title)}</div>
      <article class="lesson-paper">
        <span class="lesson-part-tag">${esc(part.name)}</span>
        <h2 class="lesson-title">${esc(unit.title)}</h2>
        <p class="lesson-meta">読了目安 約${unit.minutes}分 ・ 確認テスト ${unit.checks.length}問(80%で合格)${cleared ? ' ・ 完了済み' : ''}</p>
        ${unit.story ? `<div class="story-box"><p><span class="sb-label">たとえると…</span>${esc(unit.story)}</p></div>` : ''}
        ${unit.sections.map(renderSection).join('')}
        <div class="lesson-cta">
          <p>読み終えたら、一問一答で理解をチェックしましょう。<br>${Math.ceil(unit.checks.length * (AP.PASS_RATE))}問以上の正解でユニット完了です。</p>
          <button class="btn btn-primary" id="lesson-to-check">確認テストへ →</button>
        </div>
      </article>`;

    $lesson().querySelector('[data-home]').addEventListener('click', App.goHome);
    document.getElementById('lesson-to-check').addEventListener('click', () => startCheck(unit, part));
    ArtPlayer.init($lesson());
    Widgets.init($lesson());
    App.show('lesson');
    window.scrollTo(0, 0);
  }

  function renderTable(t) {
    return `${t.cap ? `<p class="lesson-table-cap">${esc(t.cap)}</p>` : ''}
      <div class="lesson-table-wrap"><table class="lesson-table ${t.stack ? 'is-stack' : ''}">
        <thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(t.head[i] || '')}">${esc(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
  }

  // 例題: 問題だけを見せ、考えてから答えを開く
  function renderExample(ex) {
    return `<div class="example-box">
        <p class="example-label">例題</p>
        <p class="example-q">${esc(ex.q)}</p>
        <details>
          <summary>考えてから、解き方と答えを見る</summary>
          ${ex.steps ? `<ol class="example-steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
          <p class="example-a"><span>答え</span>${esc(ex.a)}</p>
        </details>
      </div>`;
  }

  function renderSection(sec) {
    const paras = sec.body.split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const code = sec.code ? `<pre class="lesson-code">${esc(sec.code)}</pre>` : '';
    const tables = (sec.tables || (sec.table ? [sec.table] : [])).map(renderTable).join('');
    const example = sec.example ? renderExample(sec.example) : '';
    const points = sec.points
      ? `<div class="points-box"><p class="points-label">POINT</p>
           <ul>${sec.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
      : '';
    const art = sec.art ? ArtPlayer.figureHtml(sec.art) : '';
    const widget = sec.widget ? Widgets.html(sec.widget) : '';
    return `<section class="lesson-section"><h3>${esc(sec.h)}</h3>${paras}${code}${art}${widget}${tables}${example}${points}</section>`;
  }

  // ---------- ユニット確認テスト ----------
  function startCheck(unit, part) {
    Quiz.start({
      title: `一問一答: ${unit.title}`,
      questions: unit.checks.map((c) => Object.assign({ partId: part.id }, c)),
      mode: 'check',
      passRate: AP.PASS_RATE,
      backLabel: '学習マップへ',
      onBack: App.goHome,
      passLabelFn: null,
      resultNote: (r) => (r.pass
        ? 'ユニット完了です。次のユニットへ進みましょう。'
        : `合格ラインは${Math.round(AP.PASS_RATE * 100)}%。教材を見直してもう一度挑戦しましょう。`),
      onFinish: (r) => {
        Store.setUnitResult(unit.id, r.score, r.total, r.pass);
        Store.addHistory({ kind: '一問一答', label: unit.title, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  // ---------- パート別 本番レベル演習 ----------
  function startPartExam(partId) {
    const part = partOf(partId);
    const qs = Quiz.shuffle(questionsOf(partId));
    Quiz.start({
      title: `本番レベル演習: ${part.name}`,
      questions: qs,
      mode: 'practice',
      passRate: 0.6,
      reshuffleOnRetry: true,
      backLabel: '学習マップへ',
      onBack: App.goHome,
      resultNote: (r) => (r.pass
        ? `${part.name}パート クリア!本試験の合格ライン(60%)を超えました。`
        : '合格ラインは本試験と同じ60%です。見直して再挑戦しましょう。'),
      onFinish: (r) => {
        Store.setPartExamResult(partId, r.percent, r.pass);
        Store.addHistory({ kind: '本番レベル演習', label: part.name, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  return { renderHome, openLesson };
})();
