// 実践タブのハブ画面(計算ドリル / アルゴリズムトレース / 午後演習)
const Practice = (() => {
  const $view = () => document.getElementById('view-practice');

  function renderMenu() {
    const clearedCases = AP.cases.filter((c) => {
      const s = Store.caseState(c.id);
      return s && s.cleared;
    }).length;

    $view().innerHTML = `
      <h2 class="view-title">実践トレーニング</h2>
      <p class="view-lead">知識を「使える力」に変える演習です。計算は手を動かし、コードは1行ずつ追い、長文は本番の午後試験形式で。</p>
      <div class="practice-menu">
        <button class="practice-card" data-go="drill">
          <span class="pc-icon">🧮</span>
          <span class="pc-title">計算ドリル</span>
          <span class="pc-desc">サブネット・稼働率・EVM・損益分岐点などを毎回数値が変わる問題で反復練習。答えは自分で計算して入力。</span>
          <span class="pc-cta">挑戦する →</span>
        </button>
        <button class="practice-card" data-go="trace">
          <span class="pc-icon">🔍</span>
          <span class="pc-title">アルゴリズムトレース</span>
          <span class="pc-desc">擬似言語のコードを1行ずつ実行し、変数の値を予測しながら追いかける。午後のアルゴリズム問題の基礎体力に。</span>
          <span class="pc-cta">挑戦する →</span>
        </button>
        <button class="practice-card" data-go="afternoon">
          <span class="pc-icon">📄</span>
          <span class="pc-title">午後演習(ケーススタディ)</span>
          <span class="pc-desc">本番の午後試験風の長文シナリオを読み、設問に答える演習。セキュリティ・DB・ネットワークの3題。</span>
          <span class="pc-cta">${clearedCases} / ${AP.cases.length} 題クリア →</span>
        </button>
      </div>`;

    $view().querySelector('[data-go="drill"]').addEventListener('click', () => Drill.render());
    $view().querySelector('[data-go="trace"]').addEventListener('click', () => Trace.renderMenu());
    $view().querySelector('[data-go="afternoon"]').addEventListener('click', () => Afternoon.renderMenu());
  }

  return { renderMenu };
})();
