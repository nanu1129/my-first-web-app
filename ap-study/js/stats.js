// 学習記録・弱点分析
const Stats = (() => {
  const $view = () => document.getElementById('view-stats');

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

    $view().innerHTML = `
      <h2 class="view-title">成績</h2>
      <p class="view-lead">これまでの解答をもとに、分野別の正答率と学習履歴を表示します(この端末のブラウザに保存)。</p>

      <div class="stat-tiles">
        <div class="stat-tile"><p class="st-label">総解答数</p><p class="st-value">${totals.t}<small> 問</small></p></div>
        <div class="stat-tile"><p class="st-label">総合正答率</p><p class="st-value">${totals.t ? rate + '%' : '—'}</p></div>
        <div class="stat-tile"><p class="st-label">完了ユニット</p><p class="st-value">${doneUnits}<small> / ${allUnits}</small></p></div>
      </div>

      <div class="panel">
        <h3>分野別正答率</h3>
        <p class="panel-note">一問一答・過去問演習・模擬試験のすべての解答の累積です。</p>
        ${totals.t ? chartSvg(answers) : '<p class="chart-empty">まだ解答がありません。ホームの学習マップから始めましょう。</p>'}
        ${weak ? `
          <div class="weak-callout">
            <span>⚠ <b>${esc(weak.part.name)}</b> が苦手のようです(正答率 ${Math.round(weak.rate * 100)}%)。教材から復習しましょう。</span>
            <button class="btn btn-primary" id="weak-review" data-part="${weak.part.id}">この分野を復習</button>
          </div>` : ''}
      </div>

      <div class="panel">
        <h3>間違えた問題の復習</h3>
        <p class="panel-note">過去問演習・模擬試験で間違えた問題は自動でここに溜まります。正解し直すとリストから消えます。</p>
        ${wrongQs.length ? `
          <div class="weak-callout" style="background:var(--accent-soft)">
            <span>📌 復習待ちの問題が <b style="color:var(--accent)">${wrongQs.length}問</b> あります。</span>
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
