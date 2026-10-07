// 学習記録・弱点分析
const Stats = (() => {
  const $view = () => document.getElementById('view-stats');

  // ---- 合格予測モデル(科目A・旧午前のシミュレーション) ----
  // このサイトの教材が各分野の頻出論点をカバーしている割合(推定)
  const COVERAGE = {
    basics: 0.70, computer: 0.70, database: 0.75, network: 0.75,
    security: 0.80, dev: 0.70, management: 0.70, strategy: 0.65,
  };

  // 分野ごとの期待正解数を計算して合計スコア(100点満点)を返す
  function forecast(answers) {
    const parts = AP.parts.map((p) => {
      const n = Math.round((AP.examWeights[p.id] || 0) * 80); // 本試験での出題数
      const a = answers[p.id] || { correct: 0, total: 0 };
      // 実測正答率。データが少ない分野は「勘(25%)」寄りに控えめに見積もる
      const acc = (a.correct + 1) / (a.total + 4);
      const cov = COVERAGE[p.id] || 0.6;
      // 未収録論点は 勘25% + 実力に応じた上積み
      const unc = 0.25 + 0.125 * acc;
      const expected = n * (cov * acc + (1 - cov) * unc);
      return { part: p, n, expected, acc, samples: a.total };
    });
    const totalExpected = parts.reduce((s, x) => s + x.expected, 0);
    const score = Math.round((totalExpected / 80) * 100);
    return { parts, score };
  }

  function forecastComment(score, totalAnswers) {
    if (totalAnswers < 20) return 'まだ解答データが少ないので、精度は低めの参考値です。学習を進めるほど正確になります。';
    if (score >= 70) return '安全圏が見えてきました。模試で時間配分も仕上げていこう。';
    if (score >= 60) return '合格ライン前後です。復習リストの取りこぼしを減らして安全圏へ。';
    if (score >= 50) return 'あと少しで合格圏。正答率の低い分野を教材から復習してみよう。';
    return 'まだ伸びしろたっぷり。学習マップを順番に進めていこう。';
  }

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    const answers = Store.answerStats();
    const totals = Object.values(answers).reduce(
      (acc, a) => ({ c: acc.c + a.correct, t: acc.t + a.total }), { c: 0, t: 0 });
    const allUnits = AP.lessons.reduce((n, l) => n + l.units.length, 0);
    const doneUnits = AP.lessons.reduce(
      (n, l) => n + l.units.filter((u) => Store.isUnitCleared(u.id)).length, 0);
    const rate = totals.t ? Math.round((totals.c / totals.t) * 100) : 0;

    // 弱点: 5問以上解いて正答率が最も低い分野(60%未満)
    const weak = AP.parts
      .map((p) => {
        const a = answers[p.id];
        return a && a.total >= 5 ? { part: p, rate: a.correct / a.total } : null;
      })
      .filter((x) => x && x.rate < 0.6)
      .sort((a, b) => a.rate - b.rate)[0];

    const history = Store.history();
    const wrongIds = Store.wrongIds();
    const wrongSet = new Set(wrongIds);
    const wrongQs = (AP.allQuestions || AP.questions).filter((q) => wrongSet.has(q.qid));
    const fc = forecast(answers);

    $view().innerHTML = `
      <h2 class="view-title">成績</h2>
      <p class="view-lead">これまでの解答をもとに、分野別の正答率と学習履歴を表示します(同期を設定すると全端末の合計になります)。</p>

      <div class="stat-tiles">
        <div class="stat-tile"><p class="st-label">総解答数</p><p class="st-value">${totals.t}<small> 問</small></p></div>
        <div class="stat-tile"><p class="st-label">総合正答率</p><p class="st-value">${totals.t ? rate + '%' : '—'}</p></div>
        <div class="stat-tile"><p class="st-label">完了ユニット</p><p class="st-value">${doneUnits}<small> / ${allUnits}</small></p></div>
      </div>

      <div class="panel">
        <h3>合格予測(科目A・旧午前のシミュレーション)</h3>
        <p class="panel-note">これまでの分野別正答率と、本サイトの出題カバー範囲をもとにした「いま本番の科目Aを受けたら」の推定です。学習の目安としてどうぞ。</p>
        <div class="forecast-row">
          <p class="forecast-score">${fc.score}<small> 点 / 100</small></p>
          <div class="forecast-main">
            <div class="meter">
              <div class="meter-fill ${fc.score >= 60 ? 'is-pass' : ''}" style="width:${Math.min(100, fc.score)}%"></div>
              <div class="meter-mark" style="left:60%"><span>合格ライン 60</span></div>
            </div>
            <p class="forecast-comment">${forecastComment(fc.score, totals.t)}</p>
          </div>
        </div>
        <div class="forecast-parts">
          ${fc.parts.map((x) => `
            <div class="fp-row">
              <span class="fp-name">${esc(x.part.name)}</span>
              <span class="fp-num">${x.expected.toFixed(1)} / ${x.n}問</span>
              <span class="fp-note">${x.samples < 5 ? 'データ少' : `実測 ${Math.round((x.acc) * 100)}%`}</span>
            </div>`).join('')}
        </div>
      </div>

      ${calendarPanel()}

      <div class="panel">
        <h3>分野別正答率</h3>
        <p class="panel-note">一問一答・本番レベル演習・模擬試験など、すべての解答の累積です。</p>
        ${totals.t ? accuracyBars(answers) : '<p class="chart-empty">まだ解答がありません。ホームの学習マップから始めましょう。</p>'}
        ${weak ? `
          <div class="weak-callout">
            <span><span class="pill pill-ng">弱点</span> <b>${esc(weak.part.name)}</b> が苦手みたい(正答率 ${Math.round(weak.rate * 100)}%)。間違えた問題や定着が浅い問題を集中的に解こう。</span>
            <button class="btn btn-primary" id="weak-review" data-part="${weak.part.id}">${Coach.studiedQuestions(weak.part.id).length ? '弱点ドリル(10問)' : '教材から復習する'}</button>
          </div>` : ''}
      </div>

      <div class="panel">
        <h3>間違えた問題の復習</h3>
        <p class="panel-note">一問一答・本番レベル演習・模擬試験で間違えた問題は自動でここに溜まります。正解し直すとリストから消えます。</p>
        ${wrongQs.length ? `
          <div class="weak-callout" style="background:var(--accent-soft)">
            <span><span class="pill pill-accent">復習</span> 復習待ちの問題が <b style="color:var(--accent)">${wrongQs.length}問</b> あります。</span>
            <button class="btn btn-primary" id="review-start">復習を始める</button>
          </div>` : '<p class="chart-empty">復習待ちの問題はありません。間違えた問題があるとここに表示されます。</p>'}
      </div>

      ${(() => {
        const rc = Store.reasonCounts();
        const total = (rc.careless || 0) + (rc.knowledge || 0) + (rc.guess || 0);
        if (!total) return '';
        const labels = { careless: 'ケアレスミス', knowledge: '知識不足', guess: 'あてずっぽう' };
        const advice = {
          careless: '問題文を落ち着いて読み直す習慣を。特に「正しくないものはどれか」に注意。',
          knowledge: '該当分野の教材に戻るのが近道。あわせて間隔反復で定着を。',
          guess: '消去法で選択肢を2つまで絞る練習を。用語カードも効果的。',
        };
        const top = ['careless', 'knowledge', 'guess'].sort((a, b) => (rc[b] || 0) - (rc[a] || 0))[0];
        return `
          <div class="panel">
            <h3>間違いの内訳</h3>
            <p class="panel-note">一問一答・本番レベル演習で「なぜ間違えたか」を記録した集計です。傾向に合った対策を。</p>
            <div class="reason-stats">
              ${['careless', 'knowledge', 'guess'].map((k) => {
                const pct = Math.round(((rc[k] || 0) / total) * 100);
                return `<div class="rs-row">
                  <span class="rs-name">${labels[k]}</span>
                  <span class="rs-bar"><span class="rs-fill" style="width:${pct}%"></span></span>
                  <span class="rs-num">${rc[k] || 0}件 (${pct}%)</span>
                </div>`;
              }).join('')}
            </div>
            <p class="rs-advice"><span class="pill pill-accent">アドバイス</span> ${advice[top]}</p>
          </div>`;
      })()}

      <div class="panel">
        <h3>学習履歴</h3>
        <p class="panel-note">直近${Math.min(history.length, 10)}件</p>
        ${history.length ? `
          <div class="history-list">
            ${history.slice(0, 10).map((h) => `
              <div class="history-item">
                <span class="hi-kind">${esc(h.kind)}</span>
                <span>${esc(h.label)}</span>
                <span class="hi-score ${h.pass ? 'pass' : 'fail'}">${h.score}/${h.total}</span>
                <span class="hi-date">${fmtDate(h.at)}</span>
              </div>`).join('')}
          </div>` : '<p class="chart-empty">まだ履歴がありません。</p>'}
      </div>

      <div class="panel">
        <h3>データのバックアップ</h3>
        <p class="panel-note">学習データをファイルに書き出して保管したり、別の端末で読み込んだりできます。
          読み込みは今のデータを消さずに<b>統合</b>します(クリア状況や解答数は二重に数えられません)。</p>
        <div class="btn-row">
          <button class="btn btn-ghost" id="backup-export">ファイルに書き出す</button>
          <button class="btn btn-ghost" id="backup-import">ファイルから読み込む</button>
          <input type="file" id="backup-file" accept="application/json,.json" hidden>
        </div>
        <p class="backup-msg" id="backup-msg" role="status"></p>
      </div>

      <div class="danger-zone">
        <button id="reset-all">学習データをすべてリセットする</button>
      </div>`;

    const weakBtn = document.getElementById('weak-review');
    if (weakBtn) {
      weakBtn.addEventListener('click', () => {
        const partId = weakBtn.dataset.part;
        if (Coach.startWeakDrill(partId, () => App.navigate('stats'))) return;
        App.goHome();
        requestAnimationFrame(() => {
          const el = document.getElementById(`part-${partId}`);
          if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
      });
    }
    const reviewBtn = document.getElementById('review-start');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        Quiz.start({
          title: '復習: 間違えた問題',
          questions: Quiz.shuffle(wrongQs),
          mode: 'practice',
          passRate: 0.6,
          backLabel: '成績へ戻る',
          onBack: () => App.navigate('stats'),
          resultNote: (r) => (r.pass
            ? '正解できた問題は復習リストから消えました。'
            : 'まだ苦手が残っています。解説を読んでもう一周しましょう。'),
          onFinish: (r) => {
            Store.addHistory({ kind: '復習', label: `間違えた問題 ${r.total}問`, score: r.score, total: r.total, pass: r.pass });
          },
        });
      });
    }
    document.getElementById('backup-export').addEventListener('click', exportBackup);
    const fileInput = document.getElementById('backup-file');
    document.getElementById('backup-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) importBackup(f);
    });
    document.getElementById('reset-all').addEventListener('click', () => {
      if (confirm('学習の進捗・成績・カードの記録をすべて削除します。よろしいですか?')) {
        Store.resetAll();
        render();
      }
    });
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // 分野別正答率の横棒(HTML。スマホでも文字が小さくならない)
  function accuracyBars(answers) {
    return `<div class="acc-bars" role="list">${AP.parts.map((p) => {
      const a = answers[p.id];
      const pct = a && a.total ? Math.round((a.correct / a.total) * 100) : null;
      const cls = pct === null ? '' : pct >= 80 ? 'is-good' : pct >= 60 ? '' : 'is-weak';
      return `
        <div class="acc-row" role="listitem">
          <span class="acc-name">${esc(p.name)}</span>
          <span class="acc-bar"><span class="acc-fill ${cls}" style="width:${pct || 0}%"></span><span class="acc-pass" title="合格ライン60%"></span></span>
          <span class="acc-val">${pct === null ? '<span class="acc-none">未学習</span>' : `<b>${pct}%</b> <small>${a.correct}/${a.total}</small>`}</span>
        </div>`;
    }).join('')}</div>`;
  }

  function backupMsg(text, ok) {
    const el = document.getElementById('backup-msg');
    if (el) { el.textContent = text; el.className = `backup-msg ${ok ? 'ok' : 'ng'}`; }
  }

  function exportBackup() {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify(Store.snapshot(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manabit-backup-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    backupMsg(`「${a.download}」を書き出しました。`, true);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importState(JSON.parse(reader.result));
        render();
        backupMsg('読み込みました。今のデータと統合しています。', true);
      } catch (e) {
        backupMsg(`読み込めませんでした: ${e.message}`, false);
      }
    };
    reader.readAsText(file);
  }

  // ---------- 学習カレンダー(直近12週) ----------
  function calendarPanel() {
    const days = Store.dayCounts();
    const DAY = 86400000;
    const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // 月曜=0
    const start = today.getTime() - (dow + 7 * 11) * DAY; // 11週前の月曜
    const level = (n) => (n === 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : n < 40 ? 3 : 4);
    let cells = '', studied = 0, total = 0;
    for (let i = 0; i < 84; i++) {
      const t = start + i * DAY;
      if (t > today.getTime()) { cells += '<span class="cal-cell future"></span>'; continue; }
      const key = ymd(t);
      const n = days[key] || 0;
      if (n) { studied += 1; total += n; }
      cells += `<span class="cal-cell l${level(n)}${key === ymd(today.getTime()) ? ' today' : ''}" title="${key}: ${n}問"></span>`;
    }
    return `
      <div class="panel">
        <h3>学習カレンダー(直近12週)</h3>
        <p class="panel-note">色が濃いほど、その日にたくさん解いています。毎日少しずつでも色をつなげていこう。</p>
        <div class="cal-wrap">
          <div class="cal-days"><span>月</span><span></span><span>水</span><span></span><span>金</span><span></span><span>日</span></div>
          <div class="cal-grid">${cells}</div>
        </div>
        <div class="cal-foot">
          <span>学習した日 <b>${studied}日</b> / 合計 <b>${total}問</b></span>
          <span class="cal-legend">少 <i class="cal-cell l0"></i><i class="cal-cell l1"></i><i class="cal-cell l2"></i><i class="cal-cell l3"></i><i class="cal-cell l4"></i> 多</span>
        </div>
      </div>`;
  }

  return { render };
})();
