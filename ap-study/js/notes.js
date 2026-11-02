// 暗記タブの「公式集」と「要点まとめ」
const Notes = (() => {
  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // 科目Aの計算問題で使う公式。drill は計算ドリルの種類(同じ形の問題を数値を変えて練習できる)
  const FORMULAS = [
    { part: 'basics', name: '必要なビット数', f: '2ᵇ ≧ n となる最小の b', note: 'n通りを区別するのに必要なビット数', ex: '26文字なら 2⁵ = 32 ≧ 26 なので 5ビット', drill: 'bits' },
    { part: 'basics', name: '2の補数で表せる範囲', f: '−2ⁿ⁻¹ 〜 2ⁿ⁻¹ − 1', note: 'nビットの2の補数', ex: '8ビットなら −128 〜 127' },
    { part: 'basics', name: '待ち行列(M/M/1)', f: 'ρ = 平均サービス時間 ÷ 平均到着間隔\n平均待ち時間 = ρ ÷ (1 − ρ) × 平均サービス時間', note: 'ρ(利用率)は到着率 ÷ サービス率でも同じ。応答時間 = 待ち時間 + サービス時間', ex: 'サービス4分・到着間隔5分 → ρ = 0.8 → 待ち 0.8 ÷ 0.2 × 4 = 16分' },
    { part: 'basics', name: '期待値', f: '期待値 = Σ(値 × その確率)', note: 'デシジョンツリーでも同じ考え方', ex: '確率0.3で100万円・0.7で−20万円 → 30 − 14 = 16万円' },
    { part: 'basics', name: '組合せ', f: 'nCr = n! ÷ (r! × (n − r)!)', note: '並べる順序を区別するなら順列 nPr = n! ÷ (n − r)!', ex: '5人から2人 → 5C2 = 10通り' },
    { part: 'computer', name: 'CPUの性能', f: '1命令の実行時間 = CPI ÷ クロック周波数\nMIPS = クロック周波数 ÷ CPI ÷ 10⁶', note: 'CPI: 1命令あたりのクロック数', ex: '1GHz・CPI 5 → 1秒に 2億命令 = 200MIPS', drill: 'cpu' },
    { part: 'computer', name: '実効アクセス時間', f: 'キャッシュ × h + 主記憶 × (1 − h)', note: 'h: ヒット率', ex: '10ns・60ns・h = 0.9 → 9 + 6 = 15ns', drill: 'cache' },
    { part: 'computer', name: '稼働率', f: '稼働率 = MTBF ÷ (MTBF + MTTR)\n直列 = A × B\n並列 = 1 − (1 − A)(1 − B)', note: 'MTBF: 平均故障間隔 / MTTR: 平均修理時間', ex: '0.9 の装置2台: 直列 0.81・並列 0.99', drill: 'avail' },
    { part: 'computer', name: 'アムダールの法則', f: '全体の速度向上 = 1 ÷ ((1 − P) + P ÷ N)', note: 'P: 並列化できる処理の割合 / N: プロセッサ数', ex: 'P = 0.8・N = 4 → 1 ÷ (0.2 + 0.2) = 2.5倍' },
    { part: 'computer', name: 'RAIDの使える容量', f: 'RAID1 = 全体の半分\nRAID5 = (台数 − 1)台分\nRAID6 = (台数 − 2)台分', note: 'RAID0 は全台数分(冗長性なし)', ex: '1TB × 4台の RAID5 → 3TB' },
    { part: 'network', name: '伝送時間', f: 'データ量(ビット)÷(回線速度 × 伝送効率)', note: '1バイト = 8ビット。まず単位をそろえる', ex: '1Gバイト・100Mbps・効率80% → 8,000 ÷ 80 = 100秒', drill: 'transfer' },
    { part: 'network', name: '割り当てられるホスト数', f: '2^(ホスト部のビット数) − 2', note: 'ネットワークアドレスとブロードキャストアドレスの2つを除く', ex: '/26 → 2⁶ − 2 = 62台', drill: 'subnet' },
    { part: 'security', name: '必要な鍵の数', f: '共通鍵暗号 = n(n − 1) ÷ 2\n公開鍵暗号 = 2n(n組の鍵ペア)', note: 'n人が互いに暗号通信する場合', ex: '10人 → 共通鍵 45個・公開鍵 20個' },
    { part: 'security', name: '年間予想損失額', f: '1回の損失額 × 年間の発生回数', note: '対策費が妥当かの判断に使う', ex: '2,000万円 × 0.1回 = 200万円' },
    { part: 'dev', name: 'バグ埋込み法', f: '元からのバグの総数 = 見つかった元のバグ × 埋め込んだ数 ÷ 見つかった埋込みバグ', note: '埋め込んだバグが見つかった割合で、全体を推定する', ex: '50個埋込み・40個発見・元のバグ32個発見 → 32 × 50 ÷ 40 = 40個' },
    { part: 'dev', name: '複数条件網羅のケース数', f: '2^(条件の数)', note: '条件ごとに真と偽があるため', ex: '条件3つ → 8通り' },
    { part: 'management', name: 'EVM', f: 'SV = EV − PV / CV = EV − AC\nSPI = EV ÷ PV / CPI = EV ÷ AC', note: '負(1未満)なら、遅れ・予算超過', ex: 'PV 200・EV 160 → SV −40・SPI 0.8', drill: 'evm' },
    { part: 'management', name: '許される停止時間(SLA)', f: '運用時間 × (1 − 稼働率)', note: '1か月30日・24時間運用なら 43,200分', ex: '99.9% → 43,200 × 0.001 ≒ 43分' },
    { part: 'strategy', name: '損益分岐点売上高', f: '固定費 ÷ (1 − 変動費率)\n変動費率 = 変動費 ÷ 売上高', note: '利益 = 売上高 − 変動費 − 固定費', ex: '固定費600万円・変動費率0.6 → 1,500万円', drill: 'cvp' },
    { part: 'strategy', name: 'ROI(投資利益率)', f: '利益 ÷ 投資額 × 100(%)', note: '大きいほど効率のよい投資', ex: '投資500万円で利益100万円 → 20%' },
    { part: 'strategy', name: '現在価値', f: '将来の金額 ÷ (1 + 割引率)ⁿ', note: 'NPV = 効果の現在価値の合計 − 投資額', ex: '1年後の110万円・10% → 100万円' },
    { part: 'strategy', name: '減価償却(定額法)', f: '(取得価額 − 残存価額)÷ 耐用年数', note: '定率法は、はじめの年ほど大きい', ex: '500万円・残存0・5年 → 毎年100万円' },
    { part: 'strategy', name: '発注点', f: '1日の平均使用量 × 調達期間 + 安全在庫', note: '定量発注方式で使う', ex: '20個/日・5日・安全在庫40 → 140個' },
    { part: 'strategy', name: '財務指標', f: '流動比率 = 流動資産 ÷ 流動負債\n自己資本比率 = 自己資本 ÷ 総資本', note: '流動比率は高いほど短期の支払能力が高い', ex: '流動資産300・流動負債200 → 150%' },
  ];

  // 公式集: 分野で絞り込める。「隠して思い出す」では公式と例を隠し、説明から思い出してからめくる
  let formulaPart = 'all';
  let formulaQuiz = false;

  function formulasHtml() {
    const parts = Order.parts().filter((p) => FORMULAS.some((f) => f.part === p.id));
    const shown = parts.filter((p) => formulaPart === 'all' || p.id === formulaPart);
    return `
      <p class="view-lead">科目Aの計算問題でよく使う公式です。「隠して思い出す」にすると公式が隠れるので、説明を見て思い出してからめくりましょう。形を覚えたら、数値が毎回変わる計算ドリルで「使える」状態に。</p>
      <div class="pt-tools">
        <button class="btn ${formulaQuiz ? 'btn-primary' : 'btn-ghost'} fc-quiz-btn" id="fc-quiz" aria-pressed="${formulaQuiz}">${formulaQuiz ? '公式をすべて表示' : '隠して思い出す'}</button>
        <button class="btn btn-ghost" id="pt-print">印刷する</button>
      </div>
      <div class="chip-row pt-chips">
        <button class="chip ${formulaPart === 'all' ? 'is-active' : ''}" data-fpart="all">すべて(${FORMULAS.length})</button>
        ${parts.map((p) => `<button class="chip ${formulaPart === p.id ? 'is-active' : ''}" data-fpart="${p.id}">${esc(p.name)}</button>`).join('')}
      </div>
      ${shown.map((p) => `
        <section class="formula-group">
          <h3 class="fg-title">${esc(p.name)}</h3>
          ${FORMULAS.filter((f) => f.part === p.id).map((f) => `
            <div class="formula-card ${formulaQuiz ? 'is-quiz' : ''}">
              <div class="fc-head">
                <span class="fc-name">${esc(f.name)}</span>
                ${f.drill ? `<button class="btn-mini" data-drill="${f.drill}">ドリルで練習 →</button>` : ''}
              </div>
              <button class="fc-reveal" type="button">思い出したらタップ → 公式を見る</button>
              <pre class="fc-formula">${esc(f.f)}</pre>
              <p class="fc-note">${esc(f.note)}</p>
              <p class="fc-ex"><span>例</span>${esc(f.ex)}</p>
            </div>`).join('')}
        </section>`).join('')}`;
  }

  // 要点まとめ: 全ユニットのPOINTを、学習の順に分野ごとに並べる
  let pointQuery = '';
  let pointPart = 'all';
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase();

  function pointsHtml() {
    const parts = Order.parts();
    const q = norm(pointQuery).trim();
    let total = 0;
    const blocks = parts.filter((p) => pointPart === 'all' || p.id === pointPart).map((p) => {
      const units = Order.unitsOfPart(p.id).map((u) => {
        const pts = u.sections.flatMap((s) => s.points || []).filter((t) => !q || norm(t).includes(q));
        total += pts.length;
        if (!pts.length) return '';
        return `
          <div class="pt-unit">
            <div class="pt-unit-head">
              <span class="pt-unit-title">${Store.isUnitCleared(u.id) ? '<span class="pt-done" title="完了">✓</span>' : ''}${esc(u.title)}</span>
              <button class="btn-mini pt-open" data-unit="${u.id}">教材 →</button>
            </div>
            <ul>${pts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          </div>`;
      }).join('');
      return units ? `<section class="pt-part"><h3 class="fg-title">${esc(p.name)}</h3>${units}</section>` : '';
    }).join('');
    return `
      <p class="view-lead">全ユニットの「POINT」を1か所にまとめました。試験の直前や、すきま時間の見直しに。印刷して持ち歩くこともできます。</p>
      <div class="pt-tools">
        <input type="search" id="pt-search" class="search-input" placeholder="要点を絞り込む(例: RAID、SQL、稼働率)" value="${esc(pointQuery)}" aria-label="要点を絞り込む">
        <button class="btn btn-ghost" id="pt-print">印刷する</button>
      </div>
      <div class="chip-row pt-chips">
        <button class="chip ${pointPart === 'all' ? 'is-active' : ''}" data-ppart="all">すべて</button>
        ${parts.map((p) => `<button class="chip ${pointPart === p.id ? 'is-active' : ''}" data-ppart="${p.id}">${esc(p.name)}</button>`).join('')}
      </div>
      <p class="pt-count">${total}個の要点</p>
      ${blocks || '<p class="chart-empty">見つかりませんでした。別の言葉で絞り込んでみよう。</p>'}`;
  }

  // イベントの割り当て(rerender: 自分の部分を描き直す関数)
  function bind(root, rerender) {
    root.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => {
      App.navigate('practice');
      Drill.render(b.dataset.drill);
    }));
    root.querySelectorAll('.pt-open').forEach((b) => b.addEventListener('click', () => Course.openLesson(b.dataset.unit)));
    root.querySelectorAll('[data-ppart]').forEach((b) => b.addEventListener('click', () => { pointPart = b.dataset.ppart; rerender(); }));
    root.querySelectorAll('[data-fpart]').forEach((b) => b.addEventListener('click', () => { formulaPart = b.dataset.fpart; rerender(); }));
    root.querySelectorAll('.fc-reveal').forEach((b) => b.addEventListener('click', () => b.closest('.formula-card').classList.add('is-open')));
    const quiz = root.querySelector('#fc-quiz');
    if (quiz) quiz.addEventListener('click', () => { formulaQuiz = !formulaQuiz; rerender(); });
    const search = root.querySelector('#pt-search');
    if (search) {
      let t = null;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { pointQuery = search.value; rerender(); const s2 = document.getElementById('pt-search'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 200);
      });
    }
    const pr = root.querySelector('#pt-print');
    if (pr) pr.addEventListener('click', () => window.print());
  }

  return { formulasHtml, pointsHtml, bind, FORMULAS };
})();
