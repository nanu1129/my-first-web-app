// 試験日から逆算した学習計画: カウントダウン・3フェーズ配分・今日やること
const Plan = (() => {
  const DAY = 86400000;
  const DEFAULT_EXAM = '2027-02-21'; // 2月の日曜(設定画面でいつでも変更可)

  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const parse = (s) => midnight(new Date(`${s}T00:00:00`));
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const jp = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;

  function examDate() { return Store.pref('examDate', DEFAULT_EXAM); }
  function setExamDate(s) { Store.setPref('examDate', s); }

  // 学習開始日(初回に記録し、以降フェーズの基準として固定する)
  function planStart() {
    let s = Store.pref('planStart', null);
    if (!s) { s = fmt(midnight(new Date())); Store.setPref('planStart', s); }
    return s;
  }

  function compute() {
    const today = midnight(new Date());
    const exam = parse(examDate());
    const start = (() => {
      const s = parse(planStart());
      return s < exam ? s : today; // 試験日を後ろ倒しした場合の保険
    })();
    const daysLeft = Math.max(0, Math.round((exam - today) / DAY));
    const totalDays = Math.max(1, Math.round((exam - start) / DAY));
    const elapsed = Math.max(0, Math.round((today - start) / DAY));

    // 進捗の実測
    const units = AP.lessons.flatMap((l) => l.units);
    const unitsTotal = units.length;
    const unitsDone = units.filter((u) => Store.isUnitCleared(u.id)).length;
    const nextUnit = units.find((u) => !Store.isUnitCleared(u.id)) || null;
    const partsDone = AP.parts.filter((p) => {
      const s = Store.partExamState(p.id);
      return s && s.cleared;
    }).length;
    const nextPart = AP.parts.find((p) => {
      const s = Store.partExamState(p.id);
      return !(s && s.cleared);
    }) || null;
    const cases = AP.cases || [];
    const casesDone = cases.filter((c) => {
      const s = Store.caseState(c.id);
      return s && s.cleared;
    }).length;
    const nextCase = cases.find((c) => {
      const s = Store.caseState(c.id);
      return !(s && s.cleared);
    }) || null;
    const dueCount = Store.srsDue((AP.allQuestions || []).map((q) => q.qid)).length;

    // 3フェーズ配分(インプット50% → 演習30% → 仕上げ20%)
    const aEnd = new Date(start.getTime() + Math.round(totalDays * 0.5) * DAY);
    const bEnd = new Date(start.getTime() + Math.round(totalDays * 0.8) * DAY);
    const phases = [
      { key: 'input', name: '基礎固め', desc: '教材と一問一答で全ユニットを一周', end: aEnd },
      { key: 'drill', name: '演習期', desc: '過去問演習と計算ドリルで解く力をつける', end: bEnd },
      { key: 'final', name: '仕上げ', desc: '模試・午後演習・復習ゼロ化で本番に備える', end: exam },
    ];
    const phaseIdx = today >= bEnd ? 2 : (today >= aEnd ? 1 : 0);
    const phase = phases[phaseIdx];

    // インプットに使える残り日数から1日あたりのペースを算出
    const unitsRemaining = unitsTotal - unitsDone;
    const inputDaysLeft = Math.max(1, Math.round((aEnd - today) / DAY));
    const unitsPerDay = unitsRemaining / inputDaysLeft;
    const paceLabel = unitsRemaining === 0
      ? '教材は一周完了'
      : (unitsPerDay >= 1
        ? `1日 ${Math.ceil(unitsPerDay)} ユニット`
        : `${Math.ceil(1 / unitsPerDay)}日に 1 ユニット`);
    // 推奨の1日問題数(教材の一問一答 + その日の復習)
    const recommended = Math.max(10, Math.round(Math.max(unitsPerDay, 0) * 5) + dueCount);

    // 予定どおりか(インプット期の進み具合を基準に判定)
    const inputTotalDays = Math.max(1, Math.round((aEnd - start) / DAY));
    const expectedUnits = Math.min(unitsTotal, Math.round(unitsTotal * (elapsed / inputTotalDays)));
    const diff = unitsDone - expectedUnits;
    const onTrack = diff > 0 ? 'ahead' : (diff >= -2 ? 'ontrack' : 'behind');

    // 今日やること
    const tasks = [];
    if (dueCount > 0) {
      tasks.push({ act: 'review', label: `今日の復習 ${dueCount}問`, sub: '忘れかけた問題が出題されます' });
    }
    if (unitsRemaining > 0) {
      const n = Math.max(1, Math.ceil(unitsPerDay));
      tasks.push({
        act: 'unit', id: nextUnit.id,
        label: `教材を ${n}ユニット 進める`,
        sub: `次: ${nextUnit.title}`,
      });
    }
    if (phaseIdx >= 1 && nextPart) {
      tasks.push({ act: 'part', id: nextPart.id, label: `過去問演習: ${nextPart.name}`, sub: '正答率60%以上でクリア' });
    }
    if (phaseIdx >= 1) {
      tasks.push({ act: 'drill', label: '計算ドリル 10問', sub: '数値が変わっても解ける状態に' });
    }
    if (phaseIdx === 2) {
      tasks.push({ act: 'mock', label: '模擬試験 1回(80問)', sub: '時間配分の練習も兼ねて' });
      if (nextCase) tasks.push({ act: 'case', label: `午後演習: ${nextCase.title}`, sub: '長文から根拠を拾う練習' });
    }

    return {
      exam, examStr: examDate(), daysLeft, totalDays, elapsed,
      phases, phase, phaseIdx,
      unitsTotal, unitsDone, unitsRemaining, nextUnit,
      partsDone, casesDone, dueCount,
      paceLabel, recommended, onTrack, diff, expectedUnits,
      tasks, jp,
    };
  }

  return { compute, examDate, setExamDate, DEFAULT_EXAM };
})();
