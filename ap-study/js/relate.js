// 問題と教材の節の対応づけ: 間違えた問題から、関係する教材の要点をすぐ確認できるようにする。
// 一問一答(ユニットが分かっている問題)はそのユニットの中から、本番レベルの問題は全教材から、
// 問題文・正解・解説に出てくる語が最もよく当てはまる節を選ぶ。はっきりした対応がなければ何も返さない
const Relate = (() => {
  // どの問題にも出てくる語(手がかりにならない)
  const STOP = new Set(['適切', '説明', '記述', '場合', '方法', '目的', '特徴', '該当', '次', '何', '最も', '用いる', '行う', '方式', '処理', '情報',
    'システム', 'データ', '利用', '使用', '実行', '管理', '機能', '可能', '必要', '結果', '対象', '関係', '内容', '作成', '実施', '確認', '種類',
    '技術', '活動', '時間', '以上', '以下', '一つ', '組合せ', '問題', '発生', '状態', '作業', '単位', 'プログラム', 'コンピュータ', 'サービス',
    'ユーザ', '利用者', '企業', '業務', '全体', '部分', '複数', '同じ', '自分', '相手', '手法', '考え方', '仕組み', '名称', '役割', '段階',
    '効果', '対策', '自動', '設定', '開発', '提供']);
  const SAME_PART_RATIO = 0.4; // 同じ分野の節は、全体の1位の4割以上の点があれば優先する
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase();
  const ASCII = /[a-z][a-z0-9]*(?:[\/.+-][a-z0-9]+)*/g;

  // 文章から手がかりになる語を取り出す
  function tokens(text) {
    const t = norm(text);
    const out = new Set();
    (t.match(/[ァ-ヶー]{3,}/g) || []).forEach((x) => out.add(x));                    // カタカナ語
    (t.match(ASCII) || []).forEach((x) => {                                          // 英数字の語(RAID5 は RAID としても探す)
      if (x.length >= 2) out.add(x);
      const b = x.replace(/[0-9]+$/, '');
      if (b.length >= 3) out.add(b);
    });
    (t.match(/[一-龠々]{2,}/g) || []).forEach((x) => out.add(x));                    // 漢字の連なり
    (t.match(/第?[0-9]+[一-龠々]+/g) || []).forEach((x) => out.add(x));              // 2進数・第3正規形 など
    (t.match(/[ァ-ヶー一-龠々]{4,}/g) || []).forEach((x) => { if (/[ァ-ヶ]/.test(x) && /[一-龠]/.test(x)) out.add(x); }); // リスク対応・シフト演算 など
    STOP.forEach((w) => out.delete(norm(w)));
    return [...out];
  }
  const isAscii = (t) => /^[a-z]/.test(t);
  // 用語らしい語(英数字・カタカナ4字以上・漢字3字以上)。「解析」「仕様」のような一般的な2字の語だけでは対応させない
  const keyTerm = (t) => (isAscii(t) ? t.length >= 2 : (/^[ァ-ヶー]+$/.test(t) ? t.length >= 4 : t.length >= 3));

  let secs = null;
  const df = new Map();
  function index() {
    if (secs) return;
    secs = [];
    const words = (x) => {
      const set = new Set();
      (x.match(ASCII) || []).forEach((w) => { set.add(w); set.add(w.replace(/[0-9]+$/, '')); });
      return set;
    };
    AP.lessons.forEach((l) => l.units.forEach((u) => u.sections.forEach((s, i) => {
      const tables = (s.tables || (s.table ? [s.table] : [])).map((t) => [t.cap, ...(t.head || []), ...(t.rows || []).flat()].join(' ')).join(' ');
      const ex = s.example ? [s.example.q, ...(s.example.steps || []), s.example.a].join(' ') : '';
      const head = norm(`${s.h} ${(s.points || []).join(' ')}`);
      const text = norm(`${s.h} ${s.body} ${(s.points || []).join(' ')} ${tables} ${ex} ${s.code || ''}`);
      secs.push({ partId: l.partId, unit: u, sec: s, idx: i, head, text, words: words(text), headWords: words(head) });
    })));
  }
  // 英数字の語は単語として一致するものだけ(lan が plan に一致しないように)。日本語は部分一致
  const has = (s, t) => (isAscii(t) ? s.words.has(t) : s.text.includes(t));
  const inHead = (s, t) => (isAscii(t) ? s.headWords.has(t) : s.head.includes(t));
  // めずらしい語ほど重くする
  const idf = (t) => {
    if (!df.has(t)) df.set(t, secs.filter((s) => has(s, t)).length);
    const d = df.get(t);
    return d ? Math.log(1 + secs.length / d) : 0;
  };

  const cache = new Map();
  // 戻り値: { unit, sec, idx(節の番号), snippet(本文の中の該当する1文。なければ null) } または null
  function find(q) {
    if (!q || !q.choices) return null;
    const key = q.qid || q.q;
    if (cache.has(key)) return cache.get(key);
    index();
    const strong = tokens(`${q.q} ${q.choices[q.answer]}`);
    const weak = tokens(q.exp || '').filter((t) => !strong.includes(t));
    const pool = q.unitId ? secs.filter((s) => s.unit.id === q.unitId) : secs;
    let best = null, own = null; // best: 全体の1位 / own: 問題と同じ分野の中での1位
    pool.forEach((s) => {
      let score = 0, specific = 0;
      strong.forEach((t) => { if (has(s, t)) { const w = idf(t); score += w * (inHead(s, t) ? 1.6 : 1) * 2; if (w >= 2.6 && keyTerm(t)) specific += 1; } });
      weak.forEach((t) => { if (has(s, t)) score += idf(t) * (inHead(s, t) ? 1.6 : 1) * 0.7; });
      const r = { unit: s.unit, sec: s.sec, idx: s.idx, score, specific };
      if (!best || score > best.score) best = r;
      if (s.partId === q.partId && (!own || score > own.score)) own = r;
    });
    let res = null;
    if (best) {
      if (q.unitId) res = best.score >= 8 ? best : null;
      else {
        const good = (r) => r && r.score >= 15 && r.specific >= 1;
        if (good(own) && own.score >= best.score * SAME_PART_RATIO) res = own;
        else if (good(best) && best.score >= 24) res = best;
      }
    }
    // その節の本文から、問題の語にいちばんよく当てはまる1文を抜き出す(要点に載っていない用語でも、説明している文を見せる)
    if (res && res.sec) {
      let top = null;
      const sens = res.sec.body.replace(/。/g, '。\n').split(/\n+/).map((x) => x.trim()).filter((x) => x.length >= 8);
      sens.forEach((sen, i) => {
        const n = norm(sen);
        const w = new Set();
        (n.match(ASCII) || []).forEach((x) => { w.add(x); w.add(x.replace(/[0-9]+$/, '')); });
        let sc = 0;
        strong.forEach((t) => { if (isAscii(t) ? w.has(t) : n.includes(t)) sc += idf(t) * (keyTerm(t) ? 1.5 : 1); });
        if (sc > 0 && (!top || sc > top.sc)) top = { i, sc };
      });
      let snip = null;
      if (top && top.sc >= 4) {
        snip = sens[top.i];
        // 「これを〜といいます」のように前の文を受けている文は、前の文も一緒に見せる
        if (top.i > 0 && /^(これ|この|その|それ|こう|そう)/.test(snip)) snip = `${sens[top.i - 1]}${snip}`;
        if (snip.length > 230) snip = `${snip.slice(0, 228)}…`;
      }
      res.snippet = snip;
    }
    // 一問一答は、節まで絞れなくてもユニットは分かる
    if (!res && q.unitId) {
      const u = AP.lessons.flatMap((l) => l.units).find((x) => x.id === q.unitId);
      if (u) res = { unit: u, sec: null, idx: null };
    }
    cache.set(key, res);
    return res;
  }

  return { find };
})();
