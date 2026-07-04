// コースマップ(ホーム)・教材表示・ユニット完了/過去問解放ロジック
const Course = (() => {
  const $home = () => document.getElementById('view-home');
  const $lesson = () => document.getElementById('view-lesson');

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
          <h2>教材で学ぶ → 一問一答 → 過去問で仕上げる</h2>
          <p>ユニットの一問一答に80%以上で合格すると完了。パートの全ユニットを終えると過去問演習が解放されます。</p>
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
            過去問クリア <strong>${clearedExams} / ${AP.parts.length}</strong> パート
          </div>
        </div>
      </div>
      ${AP.parts.map(renderPartCard).join('')}`;

    // イベント
    $home().querySelectorAll('.unit-row').forEach((row) => {
      row.addEventListener('click', () => openLesson(row.dataset.unit));
    });
    $home().querySelectorAll('.part-exam-row.is-unlocked, .part-exam-row.is-cleared').forEach((row) => {
      row.addEventListener('click', () => startPartExam(row.dataset.part));
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
          <span class="unit-badge">${cleared ? '✓' : i + 1}</span>
          <span class="unit-row-main">
            <span class="unit-row-title">${esc(u.title)}</span><br>
            <span class="unit-row-sub">教材 約${u.minutes}分 + 一問一答${u.checks.length}問${
              st && !cleared ? ` ・ 前回 ${st.best}/${st.total}` : ''}</span>
          </span>
          <span class="unit-row-cta">${cleared ? '完了 ・ 復習する' : isNext ? '学習する →' : ''}</span>
        </button>`;
    }).join('');

    const qs = questionsOf(part.id);
    const examState = Store.partExamState(part.id);
    let examRow;
    if (!prog.unlocked) {
      const remain = prog.total - prog.done;
      examRow = `
        <div class="part-exam-row">
          <span class="unit-badge">🔒</span>
          <span class="part-exam-main">
            <span class="part-exam-title">過去問演習(${qs.length}問)</span><br>
            <span class="part-exam-sub">あと${remain}ユニットで解放されます</span>
          </span>
        </div>`;
    } else if (examState && examState.cleared) {
      examRow = `
        <button class="part-exam-row is-cleared" data-part="${part.id}">
          <span class="unit-badge">★</span>
          <span class="part-exam-main">
            <span class="part-exam-title">過去問クリア済み!(ベスト ${examState.best}%)</span><br>
            <span class="part-exam-sub">もう一度挑戦して記録を更新しよう</span>
          </span>
        </button>`;
    } else {
      examRow = `
        <button class="part-exam-row is-unlocked" data-part="${part.id}">
          <span class="unit-badge">!</span>
          <span class="part-exam-main">
            <span class="part-exam-title">過去問演習が解放されました(${qs.length}問)</span><br>
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
        <p class="lesson-meta">読了目安 約${unit.minutes}分 ・ 確認テスト ${unit.checks.length}問(80%で合格)${cleared ? ' ・ ✓ 完了済み' : ''}</p>
        ${unit.sections.map(renderSection).join('')}
        <div class="lesson-cta">
          <p>読み終えたら、一問一答で理解をチェックしましょう。<br>${Math.ceil(unit.checks.length * (AP.PASS_RATE))}問以上の正解でユニット完了です。</p>
          <button class="btn btn-primary" id="lesson-to-check">確認テストへ →</button>
        </div>
      </article>`;

    $lesson().querySelector('[data-home]').addEventListener('click', App.goHome);
    document.getElementById('lesson-to-check').addEventListener('click', () => startCheck(unit, part));
    App.show('lesson');
    window.scrollTo(0, 0);
  }

  function renderSection(sec) {
    const paras = sec.body.split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const table = sec.table
      ? `<div class="lesson-table-wrap"><table class="lesson-table">
           <thead><tr>${sec.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
           <tbody>${sec.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
         </table></div>`
      : '';
    const points = sec.points
      ? `<div class="points-box"><p class="points-label">POINT</p>
           <ul>${sec.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
      : '';
    return `<section class="lesson-section"><h3>${esc(sec.h)}</h3>${paras}${table}${points}</section>`;
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

  // ---------- パート過去問演習 ----------
  function startPartExam(partId) {
    const part = partOf(partId);
    const qs = Quiz.shuffle(questionsOf(partId));
    Quiz.start({
      title: `過去問演習: ${part.name}`,
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
        Store.addHistory({ kind: '過去問演習', label: part.name, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  return { renderHome, openLesson };
})();
