// 用語カード(間隔反復): 忘れかけたカードと、1日10枚までの新しいカードを出題する
const Cards = (() => {
  const $view = () => document.getElementById('view-cards');
  const NEW_PER_DAY = 10;   // 1日に新しく覚えるカードの上限
  const REVIEW_LIMIT = 30;  // 1日の復習カードの上限
  let mode = 'today';       // 'today'(今日のカード) | 'all'(すべてを順に)
  let filter = 'all';       // 'all' | partId
  let deck = [];
  let flipped = false;
  let doneInSession = 0;

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  const keyOf = (t) => `${t.partId}:${t.term}`;
  const DAY = 86400000;

  // 今日のカード: 期限が来た復習カード(古い順) + 新しいカード(1日の上限まで)
  function todayDeck(part) {
    const now = Date.now();
    const terms = AP.terms.filter((t) => part === 'all' || t.partId === part);
    const due = terms.filter((t) => { const s = Store.cardState(keyOf(t)); return s && s.due <= now; })
      .sort((a, b) => Store.cardState(keyOf(a)).due - Store.cardState(keyOf(b)).due)
      .slice(0, REVIEW_LIMIT);
    const newLeft = Math.max(0, NEW_PER_DAY - (Store.actsToday().cardNew || 0));
    const fresh = terms.filter((t) => !Store.cardState(keyOf(t))).slice(0, newLeft);
    return Quiz.shuffle(due).concat(fresh);
  }
  function todayCount() { return todayDeck('all').length; }

  function buildDeck() {
    deck = mode === 'today'
      ? todayDeck(filter)
      : Quiz.shuffle(AP.terms.filter((t) => filter === 'all' || t.partId === filter));
    flipped = false;
    doneInSession = 0;
  }

  function render() {
    buildDeck();
    paint();
  }

  function statusOf(t) {
    const s = Store.cardState(keyOf(t));
    if (!s) return { cls: 'new', label: '未学習' };
    if (s.box === 0) return { cls: 'learning', label: '学習中' };
    const d = new Date(s.due);
    return { cls: s.box >= 3 ? 'solid' : 'known', label: s.due <= Date.now() ? '復習の時期' : `次回 ${d.getMonth() + 1}/${d.getDate()}` };
  }

  function paint() {
    const known = AP.terms.filter((t) => Store.isCardKnown(keyOf(t))).length;
    const solid = AP.terms.filter((t) => { const s = Store.cardState(keyOf(t)); return s && s.box >= 3; }).length;
    const chips = [
      `<button class="chip ${filter === 'all' ? 'is-active' : ''}" data-filter="all">すべての分野</button>`,
      ...AP.parts.map((p) => `<button class="chip ${filter === p.id ? 'is-active' : ''}" data-filter="${p.id}">${p.name}</button>`),
    ].join('');

    const t = deck[0];
    const partName = t ? (AP.parts.find((p) => p.id === t.partId) || {}).name : '';
    const st = t ? Store.cardState(keyOf(t)) : null;
    const nextDays = Store.CARD_STEPS[Math.min((st ? st.box : 0) + 1, Store.CARD_STEPS.length) - 1];
    const cardHtml = t
      ? `
      <button class="flashcard ${flipped ? 'is-flipped' : ''}" id="flashcard" aria-label="カードをめくる">
        <span class="flashcard-inner">
          <span class="card-face front">
            <span class="cf-label">${st ? (st.box === 0 ? '学習中' : '復習') : '新しい用語'}</span>
            <span class="cf-term">${esc(t.term)}</span>
            <span class="cf-part">${esc(partName)}</span>
            <span class="cf-hint">意味を思い出してから、タップしてめくろう</span>
          </span>
          <span class="card-face back">
            <span class="cf-label">意味</span>
            <span class="cf-term" style="font-size:18px">${esc(t.term)}</span>
            <span class="cf-def">${esc(t.def)}</span>
          </span>
        </span>
      </button>
      <div class="card-controls">
        <button class="btn btn-dontknow" id="card-no">まだ<small>もう一度出す</small></button>
        <button class="btn btn-know" id="card-yes">覚えた<small>次は${nextDays}日後</small></button>
      </div>
      <p class="card-counter">残り ${deck.length} 枚 ・ 覚えた用語 ${known} / ${AP.terms.length}(しっかり定着 ${solid})</p>
      <p class="card-keys">キーボード: Space でめくる ・ ← まだ ・ → 覚えた</p>`
      : `<div class="cards-empty">
           <p class="ce-title">${mode === 'today' ? (doneInSession ? '今日のカードは完了!' : '今日のカードはありません') : 'すべてのカードを確認しました'}</p>
           <p>${mode === 'today'
             ? '覚えたカードは、忘れかけた頃(1日後 → 3日後 → 7日後 …)にまた出てきます。新しいカードは1日10枚ずつ増えます。'
             : 'おつかれさま。「今日のカード」に戻ると、忘れかけたカードから復習できます。'}</p>
           ${mode === 'today' ? '<button class="btn btn-ghost" id="cards-all">すべてのカードを順に見る</button>' : '<button class="btn btn-ghost" id="cards-today">今日のカードに戻る</button>'}
         </div>`;

    const listTerms = AP.terms.filter((x) => filter === 'all' || x.partId === filter);
    const list = `
      <details class="term-details">
        <summary>用語一覧を開く(${listTerms.length}語)</summary>
        <div class="term-list">
          ${listTerms.map((x) => {
            const s = statusOf(x);
            return `
            <div class="term-item">
              <span class="ti-term">${esc(x.term)}</span>
              <span class="ti-def">${esc(x.def)}</span>
              <span class="ti-badge is-${s.cls}">${s.label}</span>
            </div>`;
          }).join('')}
        </div>
      </details>`;

    $view().innerHTML = `
      <h2 class="view-title">用語カード</h2>
      <p class="view-lead">用語を見て意味を思い出してから、めくって確認します。「覚えた」カードは忘れかけた頃に、「まだ」のカードはすぐにもう一度出てきます。</p>
      <div class="seg-tabs" role="tablist">
        <button class="seg-tab ${mode === 'today' ? 'is-active' : ''}" data-mode="today" role="tab" aria-selected="${mode === 'today'}">今日のカード(${todayDeck(filter).length}枚)</button>
        <button class="seg-tab ${mode === 'all' ? 'is-active' : ''}" data-mode="all" role="tab" aria-selected="${mode === 'all'}">すべてを順に見る</button>
      </div>
      <div class="chip-row">${chips}</div>
      <div class="flashcard-zone">${cardHtml}</div>
      ${list}`;

    $view().querySelectorAll('[data-filter]').forEach((c) => {
      c.addEventListener('click', () => { filter = c.dataset.filter; render(); });
    });
    $view().querySelectorAll('[data-mode]').forEach((c) => {
      c.addEventListener('click', () => { mode = c.dataset.mode; render(); });
    });
    const allBtn = document.getElementById('cards-all');
    if (allBtn) allBtn.addEventListener('click', () => { mode = 'all'; render(); });
    const todayBtn = document.getElementById('cards-today');
    if (todayBtn) todayBtn.addEventListener('click', () => { mode = 'today'; render(); });
    const card = document.getElementById('flashcard');
    if (card) {
      card.addEventListener('click', flip);
      document.getElementById('card-yes').addEventListener('click', () => mark(true));
      document.getElementById('card-no').addEventListener('click', () => mark(false));
    }
  }

  function flip() {
    const card = document.getElementById('flashcard');
    if (!card) return;
    flipped = !flipped;
    card.classList.toggle('is-flipped', flipped);
  }

  function mark(known) {
    const t = deck[0];
    if (!t) return;
    const isNew = !Store.cardState(keyOf(t));
    Store.cardReview(keyOf(t), known);
    if (isNew) Store.logAct('cardNew');
    Store.logAct('cards');
    deck.shift();
    if (!known) deck.push(t); // 「まだ」は、ほかのカードのあとでもう一度
    doneInSession += 1;
    flipped = false;
    paint();
  }

  // キーボード操作(用語カードの画面を表示しているときだけ)
  document.addEventListener('keydown', (e) => {
    const v = $view();
    if (!v || v.hidden || e.target.closest('input, select, textarea')) return;
    if (!document.getElementById('flashcard')) return;
    if (e.key === ' ') { e.preventDefault(); flip(); } else if (e.key === 'ArrowLeft') mark(false); else if (e.key === 'ArrowRight') mark(true);
  });

  return { render, todayCount };
})();
