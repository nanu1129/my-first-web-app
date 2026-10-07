// 試験日から逆算した学習計画: カウントダウン・フェーズ配分・今日のメニュー
// 令和8年度からCBT方式。科目A(旧午前)と科目B(旧午後)は別の期間に、それぞれ期間内の好きな日時を予約して受験する。
const Plan = (() => {
  const DAY = 86400000;
  // IPAが公表した令和8年度の日程(申込期間・科目A・科目Bの実施期間)。受験日はこの期間の中から予約する
  const SCHEDULES = [
    { name: '令和8年度 前期', apply: ['2026-10-06', '2026-11-07'], a: ['2026-10-28', '2026-11-10'], b: ['2026-11-24', '2026-12-06'] },
    { name: '令和8年度 後期', apply: ['2027-01-27', '2027-02-16'], a: ['2027-02-06', '2027-02-19'], b: ['2027-03-03', '2027-03-15'] },
  ];
  const DEFAULT_A = '2027-02-06'; // 後期・科目Aの初日(予約した日に変更する)
  const OLD_DEFAULT = '2027-02-21'; // 旧版の既定値(紙の試験を想定していた頃)
  const REVIEW_LIMIT = 30; // 1回の復習で出す最大問題数
  const IPA_URL = 'https://www.ipa.go.jp/shiken/';

  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const parse = (s) => midnight(new Date(`${s}T00:00:00`));
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const jp = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  const within = (s, [from, to]) => s >= from && s <= to;

  function examDate() {
    const v = Store.pref('examDate', null);
    return !v || v === OLD_DEFAULT ? DEFAULT_A : v;
  }
  function setExamDate(s) { Store.setPref('examDate', s); }
  function scheduleOf(aStr) { return SCHEDULES.find((sc) => within(aStr, sc.a)) || null; }
  function examBDate() {
    const v = Store.pref('examBDate', null);
    if (v) return v;
    const sc = scheduleOf(examDate());
    return sc ? sc.b[0] : fmt(new Date(parse(examDate()).getTime() + 25 * DAY));
  }
  function setExamBDate(s) { Store.setPref('examBDate', s); }

  // 学習開始日(初回に記録し、以降フェーズの基準として固定する)
  function planStart() {
    let s = Store.pref('planStart', null);
    if (!s) { s = fmt(midnight(new Date())); Store.setPref('planStart', s); }
    return s;
  }

  const cleared = (st) => !!(st && st.cleared);

  function compute() {
    const today = midnight(new Date());
    const todayStr = fmt(today);
    const exam = parse(examDate());
    let examB = parse(examBDate());
    if (examB <= exam) examB = new Date(exam.getTime() + 21 * DAY); // 科目Bは科目Aより後
    const start = (() => {
      const s = parse(planStart());
      return s < exam ? s : today; // 試験日を後ろ倒しした場合の保険
    })();
    const stage = today <= exam ? 'A' : (today <= examB ? 'B' : 'done');
    const target = stage === 'B' ? examB : exam;
    const daysLeft = Math.max(0, Math.round((target - today) / DAY));
    const totalDays = Math.max(1, Math.round((exam - start) / DAY));
    const elapsed = Math.max(0, Math.round((today - start) / DAY));
    const sched = scheduleOf(fmt(exam));

    // 進捗の実測
    const units = AP.lessons.flatMap((l) => l.units);
    const unitsTotal = units.length;
    const unitsDone = units.filter((u) => Store.isUnitCleared(u.id)).length;
    const nextUnit = units.find((u) => !Store.isUnitCleared(u.id)) || null;
    const unitsClearedToday = units.filter((u) => {
      const st = Store.unitState(u.id);
      return st && st.cleared && fmt(new Date(st.clearedAt || st.at || 0)) === todayStr;
    }).length;
    const partUnlocked = (p) => {
      const us = AP.lessons.filter((l) => l.partId === p.id).flatMap((l) => l.units);
      return us.length > 0 && us.every((u) => Store.isUnitCleared(u.id));
    };
    const partsDone = AP.parts.filter((p) => cleared(Store.partExamState(p.id))).length;
    const nextPart = AP.parts.find((p) => partUnlocked(p) && !cleared(Store.partExamState(p.id))) || null;
    const cases = AP.cases || [];
    const casesDone = cases.filter((c) => cleared(Store.caseState(c.id))).length;
    const nextCase = cases.find((c) => !cleared(Store.caseState(c.id)))
      || cases.slice().sort((x, y) => ((Store.caseState(x.id) || {}).best || 0) - ((Store.caseState(y.id) || {}).best || 0))[0] || null;
    const qids = (AP.allQuestions || []).map((q) => q.qid);
    const dueCount = Store.srsDue(qids).length;
    const acts = Store.actsToday();
    const weak = typeof Coach !== 'undefined' ? Coach.weakestPart() : null;
    const cardCount = typeof Cards !== 'undefined' ? Cards.todayCount() : 0;
    const lastMock = Store.history().find((h) => h.kind === '模擬試験');
    const mockRecent = lastMock && (Date.now() - lastMock.at) < 3 * DAY;

    // フェーズ配分(科目Aまで: 基礎固め50% → 演習30% → 仕上げ20%。科目Aのあと科目Bまでは科目Bに集中)
    const aEnd = new Date(start.getTime() + Math.round(totalDays * 0.5) * DAY);
    const bEnd = new Date(start.getTime() + Math.round(totalDays * 0.8) * DAY);
    const phases = [
      { key: 'input', name: '基礎固め', desc: '教材と一問一答で全ユニットを一周し、復習で定着させる', end: aEnd },
      { key: 'drill', name: '演習期', desc: '本番レベル演習・弱点ドリル・計算ドリルで解く力をつける', end: bEnd },
      { key: 'final', name: '科目A 仕上げ', desc: '模試で時間配分を固め、弱点と復習をゼロに近づける', end: exam },
      { key: 'b', name: '科目B 対策', desc: '午後演習(長文・記述)とトレースに集中する', end: examB },
    ];
    const phaseIdx = stage !== 'A' ? 3 : (today >= bEnd ? 2 : (today >= aEnd ? 1 : 0));
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
    const recommended = Math.max(10, Math.round(Math.max(unitsPerDay, 0) * 6) + Math.min(dueCount, REVIEW_LIMIT));

    // 予定どおりか(インプット期の進み具合を基準に判定)
    const inputTotalDays = Math.max(1, Math.round((aEnd - start) / DAY));
    const expectedUnits = Math.min(unitsTotal, Math.round(unitsTotal * (elapsed / inputTotalDays)));
    const diff = unitsDone - expectedUnits;
    const onTrack = diff > 0 ? 'ahead' : (diff >= -2 ? 'ontrack' : 'behind');

    // 申込みの案内(申込開始の3週間前から締切まで)
    let apply = null;
    if (sched) {
      const from = parse(sched.apply[0]), to = parse(sched.apply[1]);
      if (today <= to) {
        apply = {
          from, to, open: today >= from, soon: today >= new Date(from.getTime() - 21 * DAY),
          done: !!Store.pref(`applied-${sched.name}`, false), key: `applied-${sched.name}`, name: sched.name,
          aRange: sched.a.map(parse), bRange: sched.b.map(parse),
        };
      }
    }

    // ---- 今日のメニュー(上から順に取り組む) ----
    const tasks = [];
    const add = (t) => tasks.push(Object.assign({ done: false }, t));
    if (dueCount > 0 || acts.review) {
      const n = Math.min(dueCount, REVIEW_LIMIT);
      add(dueCount > 0
        ? { act: 'review', label: `今日の復習 ${n}問`, sub: dueCount > REVIEW_LIMIT ? `期限が来た${dueCount}問のうち、忘れかけている順に${n}問` : '忘れかけた問題を思い出して定着させる', mins: Math.ceil(n * 0.7) }
        : { act: 'review', label: '今日の復習', sub: `${acts.review}問 復習しました`, done: true });
    }
    if (stage === 'A' && unitsRemaining > 0) {
      const n = Math.max(1, Math.ceil(unitsPerDay));
      const done = unitsClearedToday >= n;
      add({
        act: 'unit', id: nextUnit.id, done,
        label: phaseIdx === 0 ? `教材を ${n}ユニット 進める` : '残りの教材を進める',
        sub: done ? `今日 ${unitsClearedToday}ユニット 完了` : `次: ${nextUnit.title}${unitsClearedToday ? `(今日 ${unitsClearedToday}/${n})` : ''}`,
        mins: nextUnit.minutes + 5,
      });
    }
    // パートを終えたら、基礎固めの時期でも一度は本番レベル演習に挑戦する(覚えた直後に本番形式で確かめる)
    if (stage === 'A' && nextPart && (phaseIdx >= 1 || !Store.partExamState(nextPart.id))) {
      add({ act: 'part', id: nextPart.id, label: `本番レベル演習: ${nextPart.name}`, sub: '正答率60%以上でパートクリア', done: !!acts.part, mins: 20 });
    }
    if (stage === 'A' && (phaseIdx >= 1 || unitsDone >= 6) && weak) {
      add({ act: 'weak', id: weak.part.id, label: `弱点ドリル: ${weak.part.name} 10問`, sub: weak.reason, done: !!acts.weak, mins: 10 });
    }
    if (stage === 'A' && phaseIdx >= 1) {
      add({ act: 'drill', label: '計算ドリル 10問', sub: '数値が変わっても解ける状態に', done: (acts.drill || 0) >= 10, mins: 10 });
    }
    if (stage === 'A' && phaseIdx === 2 && (!mockRecent || acts.mock)) {
      add({ act: 'mock', label: '模擬試験(科目A形式・80問)', sub: '3日に1回。本番と同じ150分で時間配分を練習', done: !!acts.mock, mins: 150 });
    }
    if (stage === 'B' || (stage === 'A' && phaseIdx === 2)) {
      if (nextCase) add({ act: 'case', id: nextCase.id, label: `午後演習: ${nextCase.title}`, sub: '長文から根拠を拾い、記述は字数内でまとめる', done: !!acts.case, mins: 30 });
    }
    if (stage === 'B') {
      add({ act: 'trace', label: 'アルゴリズムトレース 1題', sub: '変数の変化を1行ずつ正確に追う', done: !!acts.trace, mins: 10 });
    }
    if (cardCount > 0 || acts.cards) {
      add(cardCount > 0
        ? { act: 'cards', label: `用語カード ${cardCount}枚`, sub: '忘れかけた用語と、新しい用語', done: false, mins: Math.ceil(cardCount / 4) }
        : { act: 'cards', label: '用語カード', sub: `${acts.cards}枚 確認しました`, done: true });
    }
    if (apply && apply.open && !apply.done) {
      tasks.unshift({ act: 'apply', label: '受験の申込み(CBTの会場と日時を予約)', sub: `申込受付は${jp(apply.to)}まで`, done: false, mins: 15 });
    }
    const nextTask = tasks.find((t) => !t.done) || null;

    return {
      exam, examB, examStr: fmt(exam), examBStr: fmt(examB), stage, target, daysLeft, totalDays, elapsed,
      passed: stage === 'done',
      phases, phase, phaseIdx,
      unitsTotal, unitsDone, unitsRemaining, nextUnit,
      partsDone, casesDone, dueCount,
      paceLabel, recommended, onTrack, diff, expectedUnits,
      tasks, nextTask, apply, jp,
    };
  }

  function markApplied(key, v) { Store.setPref(key, v); }

  return { compute, examDate, examBDate, setExamDate, setExamBDate, markApplied, DEFAULT_A, REVIEW_LIMIT, IPA_URL, SCHEDULES };
})();
