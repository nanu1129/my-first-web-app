// 学習データの保存(localStorage)と、端末間同期のためのマージ処理
// 同期を正しく行うため、加算値(解答数・学習日など)は端末ごとのバケットに記録し、
// 表示時に全端末分を合計する。これにより何度マージしても二重計上が起きない。
const Store = (() => {
  const KEY = 'ap-study-v1';
  const SRS_STEPS = [1, 3, 7, 16, 35, 60]; // 間隔反復の間隔(日)
  const DAY = 86400000;

  const ymd = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fromYmd = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const defaults = () => ({
    v: 2,
    deviceId: '',
    units: {},      // unitId -> { cleared, best, total, at }
    partExams: {},  // partId -> { cleared, best(%), at }
    cases: {},      // caseId -> { cleared, best(%), at }
    cards: {},      // termKey -> true(覚えた)
    srs: {},        // qid -> { reps, interval(日), due(ms) }
    lastWrong: {},  // qid -> 最後に間違えた時刻(ms)
    lastRight: {},  // qid -> 最後に正解した時刻(ms)
    history: [],    // { kind, label, score, total, pass, at }
    counters: {},   // deviceId -> { answers: {partId:{c,t}}, reasons: {}, days: {'YYYY-MM-DD': n} }
    prefs: {},      // { recall, goal, examDate, planStart, ... }
    prefsAt: 0,     // prefs の最終更新時刻(同期時は新しい方を採用)
  });

  let cache = null;
  const listeners = [];

  function newId() {
    return 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  // 旧スキーマ(v1: answers/reasons/streak/wrong がフラット)を端末バケットへ移行
  function migrate(d) {
    if (d.v >= 2) return d;
    const legacy = { answers: {}, reasons: {}, days: {} };
    Object.entries(d.answers || {}).forEach(([p, a]) => {
      legacy.answers[p] = { c: a.correct || 0, t: a.total || 0 };
    });
    legacy.reasons = Object.assign({}, d.reasons);
    const st = d.streak || {};
    if (st.lastDay) {
      // 過去の連続記録は日数だけ復元(件数は当日分のみ判明)
      const n = Math.max(1, st.current || 1);
      for (let i = 0; i < n; i++) {
        const key = ymd(fromYmd(st.lastDay) - i * DAY);
        legacy.days[key] = i === 0 ? (st.todayCount || 1) : 1;
      }
    }
    d.counters = { legacy };
    d.lastWrong = {};
    d.lastRight = {};
    (d.wrong || []).forEach((qid) => { d.lastWrong[qid] = Date.now(); });
    if (st.goal) d.prefs = Object.assign({ goal: st.goal }, d.prefs);
    delete d.answers; delete d.reasons; delete d.streak; delete d.wrong;
    d.v = 2;
    return d;
  }

  function load() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      cache = Object.assign(defaults(), parsed);
      // 保存済みデータにバージョンが無ければ旧スキーマ(v1)とみなす
      if (Object.keys(parsed).length && parsed.v === undefined) cache.v = 1;
    } catch (e) {
      cache = defaults();
    }
    cache = migrate(cache);
    if (!cache.deviceId) cache.deviceId = newId();
    if (!cache.counters[cache.deviceId]) cache.counters[cache.deviceId] = { answers: {}, reasons: {}, days: {} };
    return cache;
  }

  function save(silent) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* プライベートモード等では保存されない */ }
    if (!silent) listeners.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
  }

  // 自分の端末バケット
  function mine() {
    const d = load();
    return d.counters[d.deviceId];
  }
  // 全端末の合計を取る
  function sumBucket(field) {
    const out = {};
    Object.values(load().counters).forEach((b) => {
      Object.entries(b[field] || {}).forEach(([k, v]) => {
        if (typeof v === 'number') out[k] = (out[k] || 0) + v;
        else {
          const o = out[k] || (out[k] = { c: 0, t: 0 });
          o.c += v.c || 0; o.t += v.t || 0;
        }
      });
    });
    return out;
  }

  // ---------- マージ(同期用の純粋関数) ----------
  // 同じデータに何度適用しても結果が変わらないように設計している
  function mergeStates(a, b) {
    if (!a) return b;
    if (!b) return a;
    const out = defaults();
    out.deviceId = a.deviceId || b.deviceId;

    // 達成系: クリア済みは true が勝ち、ベストスコアは大きい方
    ['units', 'partExams', 'cases'].forEach((k) => {
      const keys = new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})]);
      keys.forEach((id) => {
        const x = (a[k] || {})[id], y = (b[k] || {})[id];
        if (!x || !y) { out[k][id] = x || y; return; }
        out[k][id] = {
          cleared: !!(x.cleared || y.cleared),
          best: Math.max(x.best || 0, y.best || 0),
          total: x.total || y.total,
          at: Math.max(x.at || 0, y.at || 0),
        };
      });
    });

    // 覚えたカード: 和集合
    out.cards = Object.assign({}, a.cards, b.cards);

    // 間隔反復: 学習が進んでいる方(反復回数が多い、同数なら次回が先の方)を採用
    const sk = new Set([...Object.keys(a.srs || {}), ...Object.keys(b.srs || {})]);
    sk.forEach((id) => {
      const x = (a.srs || {})[id], y = (b.srs || {})[id];
      if (!x || !y) { out.srs[id] = x || y; return; }
      out.srs[id] = (y.reps > x.reps || (y.reps === x.reps && (y.due || 0) > (x.due || 0))) ? y : x;
    });

    // 正誤の最終時刻: 新しい方。復習リストはこの2つから導出するので削除も正しく伝わる
    ['lastWrong', 'lastRight'].forEach((k) => {
      const keys = new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})]);
      keys.forEach((id) => {
        out[k][id] = Math.max((a[k] || {})[id] || 0, (b[k] || {})[id] || 0);
      });
    });

    // 端末別カウンタ: 端末ごとに大きい方(各端末は自分のバケットしか増やさない)
    const dev = new Set([...Object.keys(a.counters || {}), ...Object.keys(b.counters || {})]);
    dev.forEach((id) => {
      const x = (a.counters || {})[id] || {}, y = (b.counters || {})[id] || {};
      const bucket = { answers: {}, reasons: {}, days: {} };
      const ak = new Set([...Object.keys(x.answers || {}), ...Object.keys(y.answers || {})]);
      ak.forEach((p) => {
        const p1 = (x.answers || {})[p] || { c: 0, t: 0 }, p2 = (y.answers || {})[p] || { c: 0, t: 0 };
        bucket.answers[p] = { c: Math.max(p1.c, p2.c), t: Math.max(p1.t, p2.t) };
      });
      ['reasons', 'days'].forEach((f) => {
        const ks = new Set([...Object.keys(x[f] || {}), ...Object.keys(y[f] || {})]);
        ks.forEach((k) => { bucket[f][k] = Math.max((x[f] || {})[k] || 0, (y[f] || {})[k] || 0); });
      });
      out.counters[id] = bucket;
    });

    // 履歴: 時刻で重複排除して新しい順に50件
    const seen = new Set();
    out.history = [...(a.history || []), ...(b.history || [])]
      .filter((h) => {
        const k = `${h.at}|${h.kind}|${h.label}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((x, y) => (y.at || 0) - (x.at || 0))
      .slice(0, 50);

    // 設定: 後から更新された方をまるごと採用
    const aAt = a.prefsAt || 0, bAt = b.prefsAt || 0;
    out.prefs = Object.assign({}, bAt >= aAt ? a.prefs : b.prefs, bAt >= aAt ? b.prefs : a.prefs);
    out.prefsAt = Math.max(aAt, bAt);
    return out;
  }

  return {
    // --- 同期用 ---
    deviceId() { return load().deviceId; },
    snapshot() { return JSON.parse(JSON.stringify(load())); },
    applyState(state) {
      const own = load().deviceId;
      cache = Object.assign(defaults(), state);
      cache.deviceId = own; // 端末IDは常に自分のものを保つ
      if (!cache.counters[own]) cache.counters[own] = { answers: {}, reasons: {}, days: {} };
      save(true);
    },
    mergeStates,
    onChange(fn) { listeners.push(fn); },
    // バックアップファイルの読み込み: 現在のデータに統合する(上書きしない)
    importState(obj) {
      if (!obj || typeof obj !== 'object' || !(obj.units || obj.counters || obj.answers)) {
        throw new Error('マナビットのバックアップファイルではありません');
      }
      const incoming = Object.assign(defaults(), JSON.parse(JSON.stringify(obj)));
      if (obj.v === undefined) incoming.v = 1;
      migrate(incoming);
      this.applyState(mergeStates(incoming, this.snapshot()));
      save(); // 同期が有効なら、統合結果をクラウドにも反映する
    },

    // --- ユニット進捗 ---
    unitState(unitId) { return load().units[unitId] || null; },
    isUnitCleared(unitId) {
      const s = this.unitState(unitId);
      return !!(s && s.cleared);
    },
    setUnitResult(unitId, score, total, cleared) {
      const d = load();
      const prev = d.units[unitId] || { cleared: false, best: 0, total };
      d.units[unitId] = {
        cleared: prev.cleared || cleared,
        best: Math.max(prev.best, score),
        total,
        at: Date.now(),
      };
      save();
    },

    // --- パート別 本番レベル演習 ---
    partExamState(partId) { return load().partExams[partId] || null; },
    setPartExamResult(partId, percent, cleared) {
      const d = load();
      const prev = d.partExams[partId] || { cleared: false, best: 0 };
      d.partExams[partId] = {
        cleared: prev.cleared || cleared,
        best: Math.max(prev.best, percent),
        at: Date.now(),
      };
      save();
    },

    // --- 午後演習 ---
    caseState(caseId) { return load().cases[caseId] || null; },
    setCaseResult(caseId, percent, cleared) {
      const d = load();
      const prev = d.cases[caseId] || { cleared: false, best: 0 };
      d.cases[caseId] = {
        cleared: prev.cleared || cleared,
        best: Math.max(prev.best, percent),
        at: Date.now(),
      };
      save();
    },

    // --- 解答の累積(分野別正答率) ---
    recordAnswer(partId, correct) {
      const a = mine().answers;
      const o = a[partId] || (a[partId] = { c: 0, t: 0 });
      o.t += 1;
      if (correct) o.c += 1;
      save();
    },
    answerStats() {
      const sum = sumBucket('answers');
      const out = {};
      Object.entries(sum).forEach(([p, v]) => { out[p] = { correct: v.c, total: v.t }; });
      return out;
    },

    // --- 暗記カード ---
    isCardKnown(key) { return !!load().cards[key]; },
    setCardKnown(key, known) {
      const d = load();
      if (known) d.cards[key] = true;
      else delete d.cards[key];
      save();
    },

    // --- 復習リスト(最終正誤時刻から導出) ---
    wrongIds() {
      const d = load();
      return Object.keys(d.lastWrong).filter((q) => (d.lastWrong[q] || 0) > (d.lastRight[q] || 0));
    },
    markWrong(qid, wrong) {
      const d = load();
      if (wrong) d.lastWrong[qid] = Date.now();
      else d.lastRight[qid] = Date.now();
      save();
    },

    // --- 間隔反復(SRS) ---
    srsReview(qid, correct) {
      if (!qid) return;
      const d = load();
      const s = d.srs[qid] || { reps: 0, interval: 0, due: 0 };
      if (correct) {
        s.interval = SRS_STEPS[Math.min(s.reps, SRS_STEPS.length - 1)];
        s.reps += 1;
      } else {
        s.reps = 0;
        s.interval = 1; // 明日また出す
      }
      s.due = Date.now() + s.interval * DAY;
      d.srs[qid] = s;
      save();
    },
    srsDue(qids) {
      const d = load();
      const now = Date.now();
      return qids.filter((id) => d.srs[id] && d.srs[id].due <= now);
    },

    // --- 学習ストリーク・今日の目標(全端末の学習日を合算) ---
    studyTick() {
      const days = mine().days;
      const today = ymd(Date.now());
      days[today] = (days[today] || 0) + 1;
      save();
    },
    streakInfo() {
      const days = sumBucket('days');
      const today = ymd(Date.now());
      const yesterday = ymd(Date.now() - DAY);
      let current = 0;
      let cursor = days[today] ? today : (days[yesterday] ? yesterday : null);
      if (cursor) {
        let t = fromYmd(cursor);
        while (days[ymd(t)]) { current += 1; t -= DAY; }
      }
      // 最長連続日数
      const sorted = Object.keys(days).sort();
      let longest = 0, run = 0, prev = null;
      sorted.forEach((k) => {
        run = (prev !== null && fromYmd(k) - prev === DAY) ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = fromYmd(k);
      });
      return {
        current,
        longest,
        todayCount: days[today] || 0,
        goal: load().prefs.goal || 20,
        studiedToday: !!days[today],
      };
    },
    setGoal(n) { this.setPref('goal', n); },
    // 日ごとの学習問題数(全端末の合計) { 'YYYY-MM-DD': 件数 }
    dayCounts() { return sumBucket('days'); },

    // --- 間違い理由の集計 ---
    addReason(reason) {
      const r = mine().reasons;
      r[reason] = (r[reason] || 0) + 1;
      save();
    },
    reasonCounts() { return sumBucket('reasons'); },

    // --- 設定 ---
    pref(key, def) {
      const v = load().prefs[key];
      return v === undefined ? def : v;
    },
    setPref(key, val) {
      const d = load();
      d.prefs[key] = val;
      d.prefsAt = Date.now();
      save();
    },

    // --- 履歴 ---
    addHistory(entry) {
      const d = load();
      d.history.unshift(Object.assign({ at: Date.now() }, entry));
      d.history = d.history.slice(0, 50);
      save();
    },
    history() { return load().history; },

    // --- 全消去(端末IDは維持) ---
    resetAll() {
      const id = load().deviceId;
      cache = defaults();
      cache.deviceId = id;
      cache.counters[id] = { answers: {}, reasons: {}, days: {} };
      save();
    },
  };
})();
