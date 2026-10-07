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

  // ---------- ホーム: 今日のメニュー → 学習マップ ----------
  const openParts = new Set(); // 利用者が開いたパート(画面を作り直しても開いたままにする)

  function renderHome() {
    const p = Plan.compute();
    const allUnits = AP.parts.reduce((n, x) => n + lessonsOf(x.id).length, 0);
    const doneUnits = AP.parts.reduce((n, x) => n + partProgress(x.id).done, 0);
    const clearedExams = AP.parts.filter((x) => {
      const s = Store.partExamState(x.id);
      return s && s.cleared;
    }).length;
    const answered = Object.values(Store.answerStats()).reduce((n, a) => n + a.total, 0);
    const isNew = doneUnits === 0 && answered === 0;
    const activePart = p.nextUnit ? AP.lessons.find((l) => l.units.some((u) => u.id === p.nextUnit.id)).partId : null;

    $home().innerHTML = `
      ${isNew ? renderIntro() : ''}
      ${renderToday(p)}
      ${renderDailyStrip()}
      <div class="search-box">
        <input type="search" id="home-search" class="search-input" placeholder="教材・用語を検索(例: RAID、クリティカルパス、正規化)"
          aria-label="教材と用語を検索" autocomplete="off">
        <div id="search-results" class="search-results" hidden></div>
      </div>
      <div class="map-head">
        <h2 class="map-title">学習マップ</h2>
        <span class="map-progress">ユニット <b>${doneUnits}/${allUnits}</b> ・ 本番レベル演習 <b>${clearedExams}/${AP.parts.length}</b></span>
      </div>
      ${AP.parts.map((x) => renderPartCard(x, p.nextUnit, x.id === activePart || openParts.has(x.id))).join('')}`;

    // イベント
    $home().querySelectorAll('.unit-row').forEach((row) => {
      row.addEventListener('click', () => openLesson(row.dataset.unit));
    });
    $home().querySelectorAll('.part-exam-row.is-unlocked, .part-exam-row.is-cleared').forEach((row) => {
      row.addEventListener('click', () => startPartExam(row.dataset.part));
    });
    $home().querySelectorAll('details.part-card').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) openParts.add(d.dataset.part); else openParts.delete(d.dataset.part);
      });
    });
    const goalSel = document.getElementById('daily-goal');
    if (goalSel) goalSel.addEventListener('change', () => {
      Store.setGoal(Number(goalSel.value));
      renderHome();
    });
    const examInput = document.getElementById('exam-date');
    if (examInput) examInput.addEventListener('change', () => {
      if (examInput.value) { Plan.setExamDate(examInput.value); renderHome(); }
    });
    const examBInput = document.getElementById('exam-b-date');
    if (examBInput) examBInput.addEventListener('change', () => {
      if (examBInput.value) { Plan.setExamBDate(examBInput.value); renderHome(); }
    });
    const applyBtn = document.getElementById('apply-done');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      Plan.markApplied(applyBtn.dataset.key, applyBtn.dataset.v === '1');
      renderHome();
    });
    const applyPace = document.getElementById('apply-pace');
    if (applyPace) applyPace.addEventListener('click', () => {
      Store.setGoal(Number(applyPace.dataset.n));
      renderHome();
    });
    const startBtn = document.getElementById('today-start');
    if (startBtn) startBtn.addEventListener('click', () => runTask(startBtn.dataset.act, startBtn.dataset.id));
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

  // はじめての人向けの使い方(学習を始めると表示しない)
  function renderIntro() {
    return `
      <div class="intro-card">
        <h2>マナビットの進め方</h2>
        <ol class="intro-steps">
          <li><b>教材</b>を読む<span>図解とハンズオンで、しくみから理解</span></li>
          <li><b>一問一答</b>で確かめる<span>80%以上でユニット完了</span></li>
          <li><b>復習</b>は自動で出題<span>忘れかけた頃に出るので、記憶に残る</span></li>
          <li><b>本番レベル演習・模試</b>で仕上げる<span>パートを終えると解放</span></li>
        </ol>
        <p class="intro-note">毎日「今日のメニュー」を上から順にこなすだけで、試験日から逆算した計画どおりに進みます。</p>
      </div>`;
  }

  // ---------- 今日のメニューと学習計画(試験日から逆算) ----------
  function renderToday(p) {
    if (p.passed) {
      return `
      <section class="today-card">
        <p class="plan-phase"><span class="pill pill-accent">試験日を過ぎました</span> 設定していた科目Bの試験日(${p.jp(p.examB)})を過ぎています。おつかれさまでした!</p>
        <p class="plan-track">次の試験を受ける場合は、下の「学習計画と試験日の設定」で受験日を設定し直すと、計画を作り直します。</p>
        ${renderPlanDetail(p, true)}
      </section>`;
    }
    const trackText = {
      ahead: `予定より ${p.diff}ユニット 先行しています。この調子!`,
      ontrack: '計画どおりのペースです。',
      behind: `予定より ${-p.diff}ユニット 遅れ気味。教材を少し多めに進めよう。`,
    }[p.onTrack];
    const examDay = p.daysLeft === 0;
    const targetName = p.stage === 'B' ? '科目B' : '科目A';
    const tasks = p.tasks;
    const doneN = tasks.filter((t) => t.done).length;
    const mins = tasks.filter((t) => !t.done).reduce((n, t) => n + (t.mins || 0), 0);
    const nt = p.nextTask;
    const rows = tasks.map((t) => `
      <button class="task-row ${t.done ? 'is-done' : ''} ${t === nt ? 'is-next' : ''}" data-act="${t.act}" ${t.id ? `data-id="${t.id}"` : ''}>
        <span class="tr-check">${t.done ? IC.check : ''}</span>
        <span class="tr-main"><span class="tr-label">${esc(t.label)}</span><br>
          <span class="tr-sub">${esc(t.sub)}</span></span>
        <span class="tr-mins">${t.done ? '完了' : `約${t.mins}分`}</span>
      </button>`).join('');
    return `
      <section class="today-card">
        <div class="today-head">
          <div class="countdown">
            <span class="cd-label">${examDay ? '今日は' : `${targetName}まで`}</span>
            <span class="cd-num">${examDay ? `${targetName}` : `${p.daysLeft}<small>日</small>`}</span>
            <span class="cd-date">${p.jp(p.target)}${examDay ? ' がんばれ!' : ''}</span>
          </div>
          <div class="today-head-main">
            <p class="plan-phase"><span class="pill pill-accent">いま ${esc(p.phase.name)}</span> ${esc(p.phase.desc)}</p>
            ${p.stage === 'A' && p.phaseIdx === 0 ? `<p class="plan-track ${p.onTrack}">${esc(trackText)}</p>` : ''}
          </div>
        </div>
        <div class="today-menu">
          <div class="tm-head">
            <h2 class="tm-title">今日のメニュー</h2>
            <span class="tm-count">${doneN}/${tasks.length} 完了${mins ? ` ・ 残り 約${mins}分` : ''}</span>
          </div>
          ${nt ? `<button class="btn btn-primary tm-start" id="today-start" data-act="${nt.act}" ${nt.id ? `data-id="${nt.id}"` : ''}>
                    ${doneN ? '続きから' : 'はじめる'}: ${esc(nt.label)} →</button>`
            : `<p class="tm-done">${tasks.length ? '今日のメニューはすべて完了!この積み重ねが合格につながります。' : '今日やることはありません。'}</p>`}
          <div class="task-list">${rows}</div>
        </div>
        ${renderApply(p)}
        ${renderPlanDetail(p, false)}
      </section>`;
  }

  // 申込みの案内(申込開始の3週間前から締切まで)
  function renderApply(p) {
    const a = p.apply;
    if (!a || !a.soon) return '';
    return `
      <div class="apply-line ${a.open && !a.done ? 'is-open' : ''}">
        <span class="pill ${a.done ? 'pill-ok' : 'pill-accent'}">${a.done ? '申込み済み' : '申込み'}</span>
        <span class="al-text">${esc(a.name)}の申込受付は <b>${p.jp(a.from)}〜${p.jp(a.to)}</b>。CBT方式なので、科目A(${p.jp(a.aRange[0])}〜${p.jp(a.aRange[1])})・科目B(${p.jp(a.bRange[0])}〜${p.jp(a.bRange[1])})の期間から会場と日時を予約します。</span>
        <span class="al-actions">
          <a class="plan-ipa" href="${Plan.IPA_URL}" target="_blank" rel="noopener">IPAで確認</a>
          <button class="btn-mini" id="apply-done" data-key="${esc(a.key)}" data-v="${a.done ? '0' : '1'}">${a.done ? '取り消す' : '申込み済みにする'}</button>
        </span>
      </div>`;
  }

  // 計画の詳細(フェーズ・ペース・試験日の設定)。普段は閉じておく
  function renderPlanDetail(p, open) {
    const t0 = new Date(p.exam.getTime() - p.totalDays * 86400000).getTime();
    const t1 = p.examB.getTime();
    const pctNow = Math.max(0, Math.min(100, ((Date.now() - t0) / (t1 - t0)) * 100));
    const segs = p.phases.map((ph, i) => `
      <div class="phase-seg ${i === p.phaseIdx ? 'is-now' : ''} ${i < p.phaseIdx ? 'is-past' : ''}">
        <span class="ps-name">${i + 1}. ${esc(ph.name)}</span>
        <span class="ps-date">〜${p.jp(ph.end)}</span>
      </div>`).join('');
    return `
      <details class="plan-detail" ${open ? 'open' : ''}>
        <summary>学習計画と試験日の設定</summary>
        <div class="plan-dates">
          <label class="plan-date"><span>科目A(旧午前)の受験日</span><input type="date" id="exam-date" value="${p.examStr}"></label>
          <label class="plan-date"><span>科目B(旧午後)の受験日</span><input type="date" id="exam-b-date" value="${p.examBStr}"></label>
        </div>
        <p class="plan-note">令和8年度からCBT方式です。科目Aと科目Bは別の期間に実施され、それぞれ期間内の空いている日時を予約して受験します。予約した日に合わせて設定してください。
          <a class="plan-ipa" href="${Plan.IPA_URL}" target="_blank" rel="noopener">試験日程を確認(IPA)</a></p>
        <div class="phase-bar">${segs}
          <div class="phase-now" style="left:${pctNow}%"><span>今日</span></div>
        </div>
        <div class="plan-pace">
          <span class="pill">目標ペース</span> ${esc(p.paceLabel)} ・ 1日 約${p.recommended}問
          <button class="btn-mini" id="apply-pace" data-n="${nearestGoal(p.recommended)}">1日の目標に設定</button>
        </div>
      </details>`;
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
    if (act === 'review') return Coach.startReview();
    if (act === 'unit') return openLesson(id);
    if (act === 'part') return startPartExam(id);
    if (act === 'weak') return Coach.startWeakDrill(id);
    if (act === 'drill') { App.navigate('practice'); return Drill.render(); }
    if (act === 'trace') { App.navigate('practice'); return Trace.renderMenu(); }
    if (act === 'mock') return App.navigate('exam');
    if (act === 'case') { App.navigate('practice'); return id ? Afternoon.start(id) : Afternoon.renderMenu(); }
    if (act === 'cards') return App.navigate('cards');
    if (act === 'apply') return window.open(Plan.IPA_URL, '_blank', 'noopener');
  }

  // ---------- 毎日の記録(連続学習・今日の解答数) ----------
  function renderDailyStrip() {
    const s = Store.streakInfo();
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
            <span class="daily-label">今日解いた問題</span>
            <select id="daily-goal" class="daily-goal-select" aria-label="1日の目標問題数">${goalOptions}</select>
          </div>
          <div class="daily-goal-bar"><div class="daily-goal-fill ${goalDone ? 'done' : ''}" style="width:${goalPct}%"></div></div>
          <span class="daily-goal-count">${s.todayCount} / ${s.goal} 問${goalDone ? ' ・ 目標達成!' : ''}</span>
        </div>
      </div>`;
  }

  // パートのカード(折りたたみ)。いま学習中のパートだけ最初から開く
  function renderPartCard(part, globalNext, open) {
    const units = lessonsOf(part.id);
    const prog = partProgress(part.id);
    const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    const nextUnit = globalNext && units.some((u) => u.id === globalNext.id) ? globalNext : null;

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

    const status = prog.done === prog.total
      ? (examState && examState.cleared ? 'パートクリア' : '演習が解放')
      : (prog.done ? '学習中' : '');
    return `
      <details class="part-card" id="part-${part.id}" data-part="${part.id}" ${open ? 'open' : ''}>
        <summary class="part-head">
          <span class="part-icon">${part.icon}</span>
          <span class="part-head-main">
            <span class="part-name">${esc(part.name)}</span><br>
            <span class="part-desc">${esc(part.desc)}</span>
          </span>
          <span class="part-meter">
            <span class="part-meter-label">${status ? `<span class="part-status">${status}</span> ` : ''}${prog.done}/${prog.total} ユニット</span>
            <span class="part-meter-bar"><span class="part-meter-fill" style="width:${pct}%"></span></span>
          </span>
          <span class="part-chevron" aria-hidden="true"></span>
        </summary>
        <div class="unit-list">${unitRows}${examRow}</div>
      </details>`;
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
        <nav class="lesson-toc" aria-label="このユニットの目次">
          <p class="toc-label">このユニットで学ぶこと</p>
          <ol>${unit.sections.map((sec, i) => `<li><button data-sec="${i}">${esc(sec.h)}</button></li>`).join('')}</ol>
        </nav>
        ${unit.sections.map(renderSection).join('')}
        ${renderSummary(unit)}
        <div class="lesson-cta">
          <p>読み終えたら、一問一答で理解をチェックしましょう。<br>${Math.ceil(unit.checks.length * (AP.PASS_RATE))}問以上の正解でユニット完了です。</p>
          <button class="btn btn-primary" id="lesson-to-check">確認テストへ →</button>
        </div>
      </article>`;

    $lesson().querySelector('[data-home]').addEventListener('click', App.goHome);
    $lesson().querySelectorAll('.lesson-toc [data-sec]').forEach((b) => {
      b.addEventListener('click', () => {
        const el = document.getElementById(`sec-${b.dataset.sec}`);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
      });
    });
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

  // 要点のまとめ(確認テストの直前に、POINTだけを見直す)
  function renderSummary(unit) {
    const pts = unit.sections.flatMap((sec) => sec.points || []);
    if (!pts.length) return '';
    return `
      <details class="lesson-summary">
        <summary>このユニットの要点をまとめて見直す(${pts.length}個)</summary>
        <ul>${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </details>`;
  }

  function renderSection(sec, i) {
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
    return `<section class="lesson-section" id="sec-${i}"><h3>${esc(sec.h)}</h3>${paras}${code}${art}${widget}${tables}${example}${points}</section>`;
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
        ? 'ユニット完了です。ここで解いた問題は、忘れかけた頃に「今日の復習」で出題されます。'
        : `合格ラインは${Math.round(AP.PASS_RATE * 100)}%。間違えた問題の解説と教材を見直して、もう一度挑戦しましょう。`),
      nextActions: (r) => {
        if (!r.pass) return [{ label: '教材を読み直す', primary: true, fn: () => openLesson(unit.id) }];
        const next = AP.lessons.flatMap((l) => l.units).find((u) => !Store.isUnitCleared(u.id));
        return next ? [{ label: `次のユニットへ: ${next.title} →`, primary: true, fn: () => openLesson(next.id) }] : [];
      },
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
        Store.logAct('part');
        Store.addHistory({ kind: '本番レベル演習', label: part.name, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  return { renderHome, openLesson };
})();
