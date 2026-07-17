// 学習記録・弱点分析
const Stats = (() => {
  const $view = () => document.getElementById('view-stats');

  // ---- 合格予測モデル(午前シミュレーション) ----
  // このサイトの教材が各分野の頻出論点をカバーしている割合(推定)
  const COVERAGE = {
    basics: 0.55, computer: 0.55, database: 0.65, network: 0.65,
    security: 0.70, dev: 0.60, management: 0.70, strategy: 0.50,
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
    const wrongQs = AP.questions.filter((q) => wrongIds.includes(q.qid));
    const fc = forecast(answers);

    $view().innerHTML = `
      <h2 class="view-title">成績</h2>
      <p class="view-lead">これまでの解答をもとに、分野別の正答率と学習履歴を表示します(この端末のブラウザに保存)。</p>

      <div class="stat-tiles">
        <div class="stat-tile"><p class="st-label">総解答数</p><p class="st-value">${totals.t}<small> 問</small></p></div>
        <div class="stat-tile"><p class="st-label">総合正答率</p><p class="st-value">${totals.t ? rate + '%' : '—'}</p></div>
        <div class="stat-tile"><p class="st-label">完了ユニット</p><p class="st-value">${doneUnits}<small> / ${allUnits}</small></p></div>
      </div>

      <div class="panel">
        <h3>合格予測(午前シミュレーション)</h3>
        <p class="panel-note">これまでの分野別正答率と、本サイトの出題カバー範囲をもとにした「いま本番の午前を受けたら」の推定です。学習の目安としてどうぞ。</p>
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

      <div class="panel">
        <h3>分野別正答率</h3>
        <p class="panel-note">一問一答・過去問演習・模擬試験のすべての解答の累積です。</p>
        ${totals.t ? chartSvg(answers) : '<p class="chart-empty">まだ解答がありません。ホームの学習マップから始めましょう。</p>'}
        ${weak ? `
          <div class="weak-callout">
            <span><span class="pill pill-ng">弱点</span> <b>${esc(weak.part.name)}</b> が苦手みたい(正答率 ${Math.round(weak.rate * 100)}%)。教材から復習してみよう。</span>
            <button class="btn btn-primary" id="weak-review" data-part="${weak.part.id}">この分野を復習</button>
          </div>` : ''}
      </div>

      <div class="panel">
        <h3>間違えた問題の復習</h3>
        <p class="panel-note">過去問演習・模擬試験で間違えた問題は自動でここに溜まります。正解し直すとリストから消えます。</p>
        ${wrongQs.length ? `
          <div class="weak-callout" style="background:var(--accent-soft)">
            <span><span class="pill pill-accent">復習</span> 復習待ちの問題が <b style="color:var(--accent)">${wrongQs.length}問</b> あります。</span>
            <button class="btn btn-primary" id="review-start">復習を始める</button>
          </div>` : '<p class="chart-empty">復習待ちの問題はありません。間違えた問題があるとここに表示されます。</p>'}
      </div>

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

      <div class="danger-zone">
        <button id="reset-all">学習データをすべてリセットする</button>
      </div>`;

    const weakBtn = document.getElementById('weak-review');
    if (weakBtn) {
      weakBtn.addEventListener('click', () => {
        const partId = weakBtn.dataset.part;
        App.goHome();
        requestAnimationFrame(() => {
          const el = document.getElementById(`part-${partId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // 横棒グラフ(単一系列・SVG)
  function chartSvg(answers) {
    const W = 640, ROW = 36, PAD_TOP = 6;
    const LABEL_W = 128, BAR_X = LABEL_W + 10, BAR_W = W - BAR_X - 96, BAR_H = 10;
    const H = PAD_TOP + AP.parts.length * ROW;

    const rows = AP.parts.map((p, i) => {
      const y = PAD_TOP + i * ROW + ROW / 2;
      const a = answers[p.id];
      const label = `<text x="${LABEL_W}" y="${y}" text-anchor="end" dominant-baseline="middle"
        font-size="12.5" font-weight="700" fill="var(--ink-2)">${esc(p.name)}</text>`;
      const track = `<rect x="${BAR_X}" y="${y - BAR_H / 2}" width="${BAR_W}" height="${BAR_H}"
        rx="5" fill="var(--surface-2)"/>`;
      if (!a || !a.total) {
        return `${label}${track}
          <text x="${BAR_X + BAR_W + 10}" y="${y}" dominant-baseline="middle"
            font-size="12" fill="var(--ink-3)">未学習</text>`;
      }
      const pct = a.correct / a.total;
      const w = Math.max(BAR_H, BAR_W * pct);
      const bar = `<path d="${roundedRight(BAR_X, y - BAR_H / 2, w, BAR_H, 5)}" fill="var(--accent)"/>`;
      const value = `<text x="${BAR_X + BAR_W + 10}" y="${y}" dominant-baseline="middle"
        font-size="12.5" font-weight="900" fill="var(--ink)">${Math.round(pct * 100)}%</text>
        <text x="${BAR_X + BAR_W + 50}" y="${y}" dominant-baseline="middle"
        font-size="11" fill="var(--ink-3)">${a.correct}/${a.total}</text>`;
      return `${label}${track}${bar}${value}`;
    }).join('');

    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="分野別正答率の横棒グラフ" style="width:100%;height:auto">${rows}</svg>`;
  }

  // 右端だけ角丸の横棒
  function roundedRight(x, y, w, h, r) {
    const rr = Math.min(r, w / 2);
    return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr}
      V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
  }

  return { render };
})();
