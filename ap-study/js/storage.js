// localStorage ラッパー: 学習進捗・成績・カード習熟度の保存
const Store = (() => {
  const KEY = 'ap-study-v1';

  const defaults = () => ({
    units: {},     // unitId -> { cleared, best, total, at }
    partExams: {}, // partId -> { cleared, best(%), at }
    answers: {},   // partId -> { correct, total } 全解答の累積(弱点分析用)
    cards: {},     // termKey -> true(覚えた)
    history: [],   // { kind, label, score, total, pass, at }
    wrong: [],     // 間違えた過去問の qid(正解し直すと消える)
    cases: {},     // 午後演習 caseId -> { cleared, best(%), at }
  });

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      cache = defaults();
    }
    return cache;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* プライベートモード等では保存されない */ }
  }

  return {
    // --- ユニット進捗 ---
    unitState(unitId) {
      return load().units[unitId] || null;
    },
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

    // --- パート過去問 ---
    partExamState(partId) {
      return load().partExams[partId] || null;
    },
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

    // --- 解答の累積(分野別正答率) ---
    recordAnswer(partId, correct) {
      const d = load();
      const a = d.answers[partId] || { correct: 0, total: 0 };
      a.total += 1;
      if (correct) a.correct += 1;
      d.answers[partId] = a;
      save();
    },
    answerStats() {
      return load().answers;
    },

    // --- 暗記カード ---
    isCardKnown(key) {
      return !!load().cards[key];
    },
    setCardKnown(key, known) {
      const d = load();
      if (known) d.cards[key] = true;
      else delete d.cards[key];
      save();
    },

    // --- 復習リスト(間違えた過去問) ---
    wrongIds() {
      return load().wrong || [];
    },
    markWrong(qid, wrong) {
      const d = load();
      d.wrong = d.wrong || [];
      if (wrong && !d.wrong.includes(qid)) d.wrong.push(qid);
      if (!wrong) d.wrong = d.wrong.filter((x) => x !== qid);
      save();
    },

    // --- 午後演習 ---
    caseState(caseId) {
      return load().cases[caseId] || null;
    },
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

    // --- 履歴 ---
    addHistory(entry) {
      const d = load();
      d.history.unshift(Object.assign({ at: Date.now() }, entry));
      d.history = d.history.slice(0, 50);
      save();
    },
    history() {
      return load().history;
    },

    // --- 全消去 ---
    resetAll() {
      cache = defaults();
      save();
    },
  };
})();
