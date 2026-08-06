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
    srs: {},       // qid -> { reps, interval(日), due(ms) } 間隔反復スケジュール
    streak: {},    // { current, longest, lastDay 'YYYY-MM-DD', todayCount, goal }
    reasons: {},   // { careless, knowledge, guess } 間違い理由の集計
    prefs: {},     // { recall: bool, ... } 設定
  });

  // 間隔反復の間隔(日)。正解を重ねるほど次回が遠くなる
  const SRS_STEPS = [1, 3, 7, 16, 35, 60];
  const DAY = 86400000;
  const ymd = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

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

    // --- 間隔反復(SRS) ---
    // 解答結果を受けて次回の出題日をスケジュール
    srsReview(qid, correct) {
      if (!qid) return;
      const d = load();
      const s = d.srs[qid] || { reps: 0, interval: 0, due: 0 };
      if (correct) {
        const idx = Math.min(s.reps, SRS_STEPS.length - 1);
        s.interval = SRS_STEPS[idx];
        s.reps += 1;
      } else {
        s.reps = 0;
        s.interval = 1; // 明日また出す
      }
      s.due = Date.now() + s.interval * DAY;
      d.srs[qid] = s;
      save();
    },
    // 与えたqid群のうち、復習期限が来ている(過去に一度解いた)ものを返す
    srsDue(qids) {
      const d = load();
      const now = Date.now();
      return qids.filter((id) => d.srs[id] && d.srs[id].due <= now);
    },

    // --- 学習ストリーク・今日の目標 ---
    studyTick() {
      const d = load();
      const s = d.streak;
      const today = ymd(Date.now());
      if (s.lastDay !== today) {
        const yesterday = ymd(Date.now() - DAY);
        s.current = (s.lastDay === yesterday) ? (s.current || 0) + 1 : 1;
        s.longest = Math.max(s.longest || 0, s.current);
        s.lastDay = today;
        s.todayCount = 0;
      }
      s.todayCount = (s.todayCount || 0) + 1;
      save();
    },
    streakInfo() {
      const s = load().streak;
      const today = ymd(Date.now());
      const yesterday = ymd(Date.now() - DAY);
      // 今日か昨日まで続いていれば継続中、それ以外は途切れ
      const alive = s.lastDay === today || s.lastDay === yesterday;
      return {
        current: alive ? (s.current || 0) : 0,
        longest: s.longest || 0,
        todayCount: s.lastDay === today ? (s.todayCount || 0) : 0,
        goal: s.goal || 20,
        studiedToday: s.lastDay === today,
      };
    },
    setGoal(n) {
      const d = load();
      d.streak.goal = n;
      save();
    },

    // --- 間違い理由の集計 ---
    addReason(reason) {
      const d = load();
      d.reasons[reason] = (d.reasons[reason] || 0) + 1;
      save();
    },
    reasonCounts() {
      return load().reasons;
    },

    // --- 設定 ---
    pref(key, def) {
      const v = load().prefs[key];
      return v === undefined ? def : v;
    },
    setPref(key, val) {
      const d = load();
      d.prefs[key] = val;
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
