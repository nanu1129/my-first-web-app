// 学習コーチ: 弱点の判定と、弱点ドリル・今日の復習の出題
const Coach = (() => {
  const partOf = (id) => AP.parts.find((p) => p.id === id);
  const unitsOf = (partId) => AP.lessons.filter((l) => l.partId === partId).flatMap((l) => l.units);

  // 一問一答の問題IDからユニットIDを取り出す(chk-<unitId>-<番号>)
  function unitOfQid(qid) {
    if (!qid || !qid.startsWith('chk-')) return null;
    return qid.slice(4, qid.lastIndexOf('-'));
  }

  // 学習済みの範囲の問題: 完了したユニットの一問一答 + 1ユニット以上学んだパートの本番レベル問題
  function studiedQuestions(partId) {
    const clearedUnits = new Set(unitsOf(partId).filter((u) => Store.isUnitCleared(u.id)).map((u) => u.id));
    if (!clearedUnits.size) return [];
    return (AP.allQuestions || []).filter((q) => q.partId === partId
      && (q.qid.startsWith('chk-') ? clearedUnits.has(unitOfQid(q.qid)) : true));
  }

  // 弱点の分野: 5問以上解いた分野のうち正答率が最も低いもの(80%未満)。
  // データが少ないうちは、学び始めたのにあまり解いていない分野を選ぶ
  function weakestPart() {
    const ans = Store.answerStats();
    const studied = AP.parts.filter((p) => unitsOf(p.id).some((u) => Store.isUnitCleared(u.id)));
    if (!studied.length) return null;
    const rated = studied
      .map((p) => ({ part: p, a: ans[p.id] || { correct: 0, total: 0 } }))
      .filter((x) => x.a.total >= 5)
      .map((x) => Object.assign(x, { rate: x.a.correct / x.a.total }))
      .sort((x, y) => x.rate - y.rate);
    if (rated.length && rated[0].rate < 0.8) {
      return { part: rated[0].part, rate: rated[0].rate, reason: `正答率 ${Math.round(rated[0].rate * 100)}% の分野を集中的に` };
    }
    const few = studied.filter((p) => (ans[p.id] || { total: 0 }).total < 5);
    if (few.length) return { part: few[0], rate: null, reason: 'まだ解いた数が少ない分野を固める' };
    return null;
  }

  // 弱点ドリルの出題: 間違えたまま → まだ解いていない → 定着が浅い順に n 問
  function weakQuestions(partId, n) {
    const wrong = new Set(Store.wrongIds());
    const rank = (q) => {
      if (wrong.has(q.qid)) return 0;
      const s = Store.srsState(q.qid);
      if (!s) return 1;
      return 2 + (s.reps || 0);
    };
    const pool = Quiz.shuffle(studiedQuestions(partId)).sort((x, y) => rank(x) - rank(y));
    return Quiz.shuffle(pool.slice(0, n || 10));
  }

  function startWeakDrill(partId, onBack) {
    const part = partOf(partId);
    const qs = weakQuestions(partId, 10);
    if (!qs.length) return false;
    Quiz.start({
      title: `弱点ドリル: ${part.name}`,
      questions: qs,
      mode: 'practice',
      passRate: 0.8,
      backLabel: onBack ? '戻る' : '学習マップへ',
      onBack: onBack || App.goHome,
      resultNote: (r) => (r.pass
        ? '弱点が少しずつ得意に変わっています。間違えた問題は間隔反復で自動的に出題されます。'
        : '間違えた問題は解説を読み、必要なら教材に戻りましょう。「間違えた問題だけ解き直す」も効果的です。'),
      onFinish: (r) => {
        Store.logAct('weak');
        Store.addHistory({ kind: '弱点ドリル', label: part.name, score: r.score, total: r.total, pass: r.pass });
      },
    });
    return true;
  }

  // 今日の復習: 忘れかけている順に最大 Plan.REVIEW_LIMIT 問を選び、分野を混ぜて出題する
  function startReview(onBack) {
    const ids = new Set(Store.reviewQueue((AP.allQuestions || []).map((q) => q.qid), Plan.REVIEW_LIMIT));
    const qs = Quiz.shuffle(AP.allQuestions.filter((q) => ids.has(q.qid)));
    if (!qs.length) return false;
    Quiz.start({
      title: '今日の復習(間隔反復)',
      questions: qs,
      mode: 'practice',
      passRate: 0.6,
      backLabel: '学習マップへ',
      onBack: onBack || App.goHome,
      resultNote: (r) => (r.pass
        ? 'よく覚えていました。正解した問題は、次の出題がぐっと先になります。'
        : '間違えた問題は明日また出てきます。忘れる前に定着させよう。'),
      onFinish: (r) => {
        Store.logAct('review', r.answered);
        Store.addHistory({ kind: '間隔反復の復習', label: `今日の復習 ${r.total}問`, score: r.score, total: r.total, pass: r.pass });
      },
    });
    return true;
  }

  return { weakestPart, weakQuestions, startWeakDrill, startReview, unitOfQid, studiedQuestions };
})();
