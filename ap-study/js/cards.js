// 用語集・暗記カード
const Cards = (() => {
  const $view = () => document.getElementById('view-cards');
  let filter = 'all';      // 'all' | partId
  let onlyUnknown = false; // 「まだ」だけ復習
  let deck = [];
  let idx = 0;
  let flipped = false;

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function keyOf(t) {
    return `${t.partId}:${t.term}`;
  }

  function buildDeck() {
    let terms = AP.terms.filter((t) => filter === 'all' || t.partId === filter);
    if (onlyUnknown) terms = terms.filter((t) => !Store.isCardKnown(keyOf(t)));
    deck = Quiz.shuffle(terms);
    idx = 0;
    flipped = false;
  }

  function render() {
    buildDeck();
    paint();
  }

  function paint() {
    const knownCount = AP.terms.filter((t) => Store.isCardKnown(keyOf(t))).length;
    const chips = [
      `<button class="chip ${filter === 'all' ? 'is-active' : ''}" data-filter="all">すべて</button>`,
      ...AP.parts.map((p) => `<button class="chip ${filter === p.id ? 'is-active' : ''}" data-filter="${p.id}">${p.name}</button>`),
      `<button class="chip ${onlyUnknown ? 'is-active' : ''}" data-unknown>「まだ」だけ復習</button>`,
    ].join('');

    const t = deck[idx];
    const partName = t ? (AP.parts.find((p) => p.id === t.partId) || {}).name : '';
    const cardHtml = t
      ? `
      <button class="flashcard ${flipped ? 'is-flipped' : ''}" id="flashcard" aria-label="カードをめくる">
        <span class="flashcard-inner">
          <span class="card-face front">
            <span class="cf-label">TERM</span>
            <span class="cf-term">${esc(t.term)}</span>
            <span class="cf-part">${esc(partName)}</span>
            <span class="cf-hint">タップして意味を表示</span>
          </span>
          <span class="card-face back">
            <span class="cf-label">MEANING</span>
            <span class="cf-term" style="font-size:18px">${esc(t.term)}</span>
            <span class="cf-def">${esc(t.def)}</span>
          </span>
        </span>
      </button>
      <div class="card-controls">
        <button class="btn btn-dontknow" id="card-no">まだ</button>
        <button class="btn btn-know" id="card-yes">覚えた!</button>
      </div>
      <p class="card-counter">${idx + 1} / ${deck.length} 枚 ・ 覚えた用語 ${knownCount} / ${AP.terms.length}</p>`
      : `<div class="cards-empty">
           <p style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--ok)">ぜんぶ覚えた!</p>
           <p>この条件のカードはすべて「覚えた」になっています。おつかれさま。</p>
         </div>`;

    // 用語一覧
    const listTerms = AP.terms.filter((x) => filter === 'all' || x.partId === filter);
    const list = `
      <h3 style="font-size:15px;font-weight:900;margin-top:34px;margin-bottom:10px">用語一覧(${listTerms.length}語)</h3>
      <div class="term-list">
        ${listTerms.map((x) => `
          <div class="term-item">
            <span class="ti-term">${esc(x.term)}</span>
            <span class="ti-def">${esc(x.def)}</span>
            ${Store.isCardKnown(keyOf(x)) ? '<span class="ti-badge">✓ 覚えた</span>' : ''}
          </div>`).join('')}
      </div>`;

    $view().innerHTML = `
      <h2 class="view-title">用語カード</h2>
      <p class="view-lead">カードをめくって意味を確認し、「覚えた / まだ」で仕分けましょう。「まだ」のカードだけを繰り返し復習できます。</p>
      <div class="chip-row">${chips}</div>
      <div class="flashcard-zone">${cardHtml}</div>
      ${list}`;

    // イベント
    $view().querySelectorAll('[data-filter]').forEach((c) => {
      c.addEventListener('click', () => { filter = c.dataset.filter; render(); });
    });
    $view().querySelector('[data-unknown]').addEventListener('click', () => {
      onlyUnknown = !onlyUnknown; render();
    });
    const card = document.getElementById('flashcard');
    if (card) {
      card.addEventListener('click', () => {
        flipped = !flipped;
        card.classList.toggle('is-flipped', flipped);
      });
      document.getElementById('card-yes').addEventListener('click', () => mark(true));
      document.getElementById('card-no').addEventListener('click', () => mark(false));
    }
  }

  function mark(known) {
    const t = deck[idx];
    if (!t) return;
    Store.setCardKnown(keyOf(t), known);
    if (onlyUnknown && known) {
      deck.splice(idx, 1); // 覚えたカードは復習デッキから外す
      if (idx >= deck.length) idx = 0;
    } else {
      idx = (idx + 1) % deck.length;
      if (deck.length === 0) idx = 0;
    }
    flipped = false;
    paint();
  }

  return { render };
})();
