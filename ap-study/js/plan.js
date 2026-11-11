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
  const PAST_URL = 'https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html'; // IPAの過去問題(問題冊子・解答例)

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

  // ---- 1日に使える時間(分)。平日と土日で別に設定できる(未設定は null = 制限なし) ----
  const LONG = 120; // 過去問・模試のような長い課題に取り組める日の目安(分)
  function budgets() {
    const n = (k) => { const v = Number(Store.pref(k, 0)); return v > 0 ? v : null; };
    return { weekday: n('minsWeekday'), holiday: n('minsHoliday') };
  }
  function setBudget(kind, mins) { Store.setPref(kind === 'holiday' ? 'minsHoliday' : 'minsWeekday', Number(mins) || 0); }
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const OVERHEAD = 20; // 復習と用語カードにかかる時間の目安(分)
  // 1回の復習で出す問題数。使える時間が短い日は、復習だけで終わらないように減らす(忘れかけている順に出る)
  function reviewLimit() {
    const bud = budgets();
    const b = isWeekend(new Date()) ? bud.holiday : bud.weekday;
    // 使える時間の2割ほどを復習に(1問 約0.7分)。少なくとも10問、多くても REVIEW_LIMIT 問
    return b == null ? REVIEW_LIMIT : Math.min(REVIEW_LIMIT, Math.max(10, Math.floor((b * 0.2) / 0.7)));
  }
  // その種類の日(平日/土日)に長い課題を入れてよいか。時間が足りない種類の日は避け、取れる日に回す。
  // どちらの日も足りない設定なら、長く取れる方の日に入れる
  function longOk(bud, holiday) {
    const mine = holiday ? bud.holiday : bud.weekday;
    const other = holiday ? bud.weekday : bud.holiday;
    return mine == null || mine >= LONG || (other != null && other < LONG && mine >= other);
  }

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
    const units = Order.units(); // 学習順(Udemy講座の順 / サイト標準)
    const udemy = Order.active();
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
    const pmFieldIds = pmChosen().length ? pmTargets().map((f) => f.id) : null;
    const inMyFields = (c) => !pmFieldIds || pmFieldIds.includes(c.fieldId);
    // 問題番号の順(問1 セキュリティ → 問2 …)に並べてから選ぶ
    const fieldNo = (c) => ((AP.pmFields || []).find((f) => f.id === c.fieldId) || { no: 99 }).no;
    const byNo = cases.slice().sort((x, y) => fieldNo(x) - fieldNo(y));
    const nextCase = byNo.find((c) => inMyFields(c) && !cleared(Store.caseState(c.id)))
      || byNo.find((c) => !cleared(Store.caseState(c.id)))
      || cases.slice().sort((x, y) => ((Store.caseState(x.id) || {}).best || 0) - ((Store.caseState(y.id) || {}).best || 0))[0] || null;
    // 午後の過去問: 最後に記録した日
    const pmRecs = Store.pmExams();
    const pmLast = pmRecs.length ? Math.max(...pmRecs.map((r) => r.at)) : 0;
    const pmToday = pmRecs.filter((r) => fmt(new Date(r.at)) === todayStr).length;
    const pmNextQ = pmNext();
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
      { key: 'input', name: '基礎固め', desc: udemy ? 'Udemyの講義(§2〜13)と一問一答で全範囲を一周し、復習で定着させる' : '教材と一問一答で全ユニットを一周し、復習で定着させる', end: aEnd },
      { key: 'drill', name: '演習期', desc: udemy ? '過去問とUdemyの解説・弱点ドリル・計算ドリルで解く力をつける' : '本番レベル演習・弱点ドリル・計算ドリルで解く力をつける', end: bEnd },
      { key: 'final', name: '科目A 仕上げ', desc: udemy ? '残りの過去問で時間配分を固め、弱点と復習をゼロに近づける' : '模試で時間配分を固め、弱点と復習をゼロに近づける', end: exam },
      { key: 'b', name: '科目B 対策', desc: '選んだ分野の午後の過去問と午後演習(長文・記述)に集中する', end: examB },
    ];
    const phaseIdx = stage !== 'A' ? 3 : (today >= bEnd ? 2 : (today >= aEnd ? 1 : 0));
    const phase = phases[phaseIdx];

    // インプットに使える残り日数から1日あたりのペースを算出
    const unitsRemaining = unitsTotal - unitsDone;
    const inputDaysLeft = Math.max(1, Math.round((aEnd - today) / DAY));
    const unitsPerDay = unitsRemaining / inputDaysLeft;
    // 必要なペースを下回らない表し方にする(0.9/日 を「2日に1」と言わない)
    const paceLabel = unitsRemaining === 0
      ? '教材は一周完了'
      : (unitsPerDay > 0.5
        ? `1日 ${Math.ceil(unitsPerDay)} ユニット`
        : `${Math.floor(1 / unitsPerDay)}日に 1 ユニット`);
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

    // 今日使える時間と、長い課題(過去問・模試)に取り組める日かどうか
    const bud = budgets();
    const holiday = isWeekend(today);
    const budget = holiday ? bud.holiday : bud.weekday;
    const longDay = longOk(bud, holiday);
    const longLimited = !(longOk(bud, false) && longOk(bud, true)); // 長い課題を入れられる日が限られている

    // ---- 今日のメニュー(上から順に取り組む) ----
    const tasks = [];
    const add = (t) => tasks.push(Object.assign({ done: false }, t));
    if (dueCount > 0 || acts.review) {
      const limit = reviewLimit();
      const n = Math.min(dueCount, limit);
      add(dueCount > 0
        ? { act: 'review', label: `今日の復習 ${n}問`, sub: dueCount > limit ? `期限が来た${dueCount}問のうち、忘れかけている順に${n}問` : '忘れかけた問題を思い出して定着させる', mins: Math.ceil(n * 0.7) }
        : { act: 'review', label: '今日の復習', sub: `${acts.review}問 復習しました`, done: true });
    }
    if (stage === 'A' && unitsRemaining > 0) {
      const needPerDay = phaseIdx === 0 ? unitsPerDay : unitsRemaining / 7; // 基礎固めを過ぎていたら、1週間で終える
      const unitMins = udemy ? AP.udemy.minsPerUnit : nextUnit.minutes + 5;
      let n = Math.max(1, Math.ceil(needPerDay));
      if (budget != null) {
        // 使える時間を設定しているとき: 1週間に必要な数を、平日と土日の時間の比で割りふる(その日に収まる数まで)
        const wB = Math.max(0, (bud.weekday || bud.holiday) - OVERHEAD), hB = Math.max(0, (bud.holiday || bud.weekday) - OVERHEAD);
        const weekB = 5 * wB + 2 * hB, dayB = Math.max(0, budget - OVERHEAD);
        const share = weekB > 0 ? Math.ceil((needPerDay * 7 * dayB) / weekB) : 1;
        n = Math.max(1, Math.min(share, Math.max(1, Math.floor(dayB / unitMins))));
      }
      n = Math.min(n, unitsRemaining + unitsClearedToday);
      const done = unitsClearedToday >= n;
      const leftMins = unitMins * Math.max(1, n - unitsClearedToday);
      const sec = udemy ? Order.sectionOf(nextUnit.id) : null;
      const progress = unitsClearedToday ? `(今日 ${unitsClearedToday}/${n})` : '';
      add(sec
        ? {
          act: 'unit', id: nextUnit.id, done,
          label: `Udemy §${sec.no}「${sec.title}」→ 一問一答 ${n}ユニット`,
          sub: done ? `今日 ${unitsClearedToday}ユニット 完了` : `次: ${nextUnit.title}${progress}。動画を見てから要点まとめと一問一答へ`,
          mins: leftMins,
        }
        : {
          act: 'unit', id: nextUnit.id, done,
          label: phaseIdx === 0 ? `教材を ${n}ユニット 進める` : '残りの教材を進める',
          sub: done ? `今日 ${unitsClearedToday}ユニット 完了` : `次: ${nextUnit.title}${progress}`,
          mins: leftMins,
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
    // Udemy講座の過去問解説(§14〜23): 演習期からは、本物の過去問を解いてから解説動画で見直す(3日に1回)
    const past = udemy ? Order.pastStatus() : null;
    // 時間の取れる日が限られている設定(平日は短い、など)では、3日おきではなく、取れる日ごとに1回
    if (past && stage === 'A' && phaseIdx >= 1 && (past.today || (past.next && longDay && (longLimited || !past.recent)))) {
      add(past.today
        ? { act: 'udemy', label: '過去問1回分 + Udemyの解説', sub: `今日1回分を終えました(${past.done}/${past.total}回)`, done: true }
        : {
          act: 'udemy', label: `過去問(${past.next.exam})→ Udemy §${past.next.no} の解説`,
          sub: 'IPAの過去問題80問を150分で解き、得点を記録してから、間違えた問題の解説動画を見る', mins: 180,
        });
    }
    // 模試: Udemy講座を使う場合は、過去問をすべて終えてから(本物の過去問を優先する)
    if (stage === 'A' && phaseIdx === 2 && (acts.mock || (longDay && (longLimited || !mockRecent))) && (!past || !past.next)) {
      add({ act: 'mock', label: '模擬試験(科目A形式・80問)', sub: '3日に1回。本番と同じ150分で時間配分を練習', done: !!acts.mock, mins: 150 });
    }
    // 科目B: 演習期に入ったら解く分野を決め、週に1問は午後の過去問で記述に慣れておく。科目B期は毎日
    if (stage === 'B' || (stage === 'A' && phaseIdx >= 1)) {
      if (!pmChosen().length) {
        add({ act: 'pmfields', label: '科目Bで解く分野を決める', sub: '問1(情報セキュリティ)は必須。残り10分野から得意な4分野を選ぶ', mins: 5 });
      } else if (pmToday || (pmNextQ && (stage === 'B' || Date.now() - pmLast >= 7 * DAY))) {
        add(pmToday
          ? { act: 'pmpast', label: '午後の過去問', sub: `今日 ${pmToday}問 解きました`, done: true }
          : {
            act: 'pmpast', id: pmNextQ.key,
            label: `午後の過去問: ${pmNextQ.exam.name} 問${pmNextQ.field.no}(${pmNextQ.field.name})`,
            sub: stage === 'B' ? '30分で解き、IPAの解答例で自己採点して記録する' : '週に1問。30分で解き、IPAの解答例で自己採点して記録する',
            mins: 40,
          });
      }
    }
    if (stage === 'B' || (stage === 'A' && phaseIdx === 2)) {
      if (nextCase) add({ act: 'case', id: nextCase.id, label: `午後演習: ${nextCase.title}`, sub: '長文から根拠を拾い、記述は字数内でまとめる', done: !!acts.case, mins: 30 });
    }
    if (stage === 'B' && udemy && (!Order.watched()[24] || Order.sameDay(Order.watched()[24]))) {
      const w24 = Order.watched()[24];
      add({ act: 'udemy', label: 'Udemy §24「午後問題対策用 小問題」', sub: w24 ? '見終えました' : '記述式の答え方に慣れる。見終えたら講座の進み具合にチェック', done: !!w24, mins: 60 });
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
    // ---- 使える時間が設定されていれば、その時間に収まる分を「今日やること」、残りを「時間があれば」に分ける ----
    // 復習・用語カード(忘れる前に見直すもの)と、その時期の中心になる課題1つは、必ず「今日やること」に入れる
    if (budget != null) {
      const always = new Set(['apply', 'review', 'cards', 'pmfields']);
      // 中心になる課題: 教材 → 過去問・模試 → 週1回の午後の過去問 → 演習・ドリル の順で、今日あるものを1つ
      const mainOrder = stage === 'B'
        ? ['pmpast', 'case', 'udemy', 'trace']
        : ['unit', 'udemy', 'mock', 'pmpast', 'part', 'weak', 'drill', 'case'];
      const main = mainOrder.map((a) => tasks.find((t) => t.act === a)).find(Boolean) || null;
      let used = 0;
      tasks.forEach((t) => { if (always.has(t.act) || t === main) { t.core = true; used += t.mins || 0; } });
      tasks.forEach((t) => {
        if (t.core) return;
        if (used + (t.mins || 0) <= budget) { t.core = true; used += t.mins || 0; } else t.optional = true;
      });
    }
    const nextTask = tasks.find((t) => !t.done && !t.optional) || null;

    // ---- 進み具合の目安: 今日までにどこまで進んでいるべきか、これからどのペースで進めるか ----
    const pace = (() => {
      if (stage === 'done') return null;
      const inputTotal = Math.max(1, Math.round((aEnd - start) / DAY));
      // その日までに終えているべきユニット数(基礎固めの期間で均等に一周する計画)
      const unitsBy = (d) => Math.min(unitsTotal, Math.round(unitsTotal * Math.min(1, Math.max(0, (d - start) / DAY / inputTotal))));
      const expUnits = stage === 'A' ? unitsBy(today) : unitsTotal;
      const secOf = (u) => (udemy && u ? Order.sectionOf(u.id) : null);
      const expSec = expUnits > 0 ? secOf(units[expUnits - 1]) : null;
      const nowSec = secOf(nextUnit);
      // 基礎固めの終わりまでに教材を一周するためのペース(過ぎていたら、1週間で)
      const daysToInputEnd = Math.max(1, Math.round((aEnd - today) / DAY));
      const perDay = unitsRemaining / (phaseIdx === 0 ? daysToInputEnd : 7);
      // 今週(日曜まで)の目標: これからのペースで、今日を含めて日曜までに進める数
      const sunday = new Date(today.getTime() + ((7 - today.getDay()) % 7) * DAY);
      const daysInWeek = Math.round((sunday - today) / DAY) + 1;
      const weekNeed = stage === 'A' && phaseIdx === 0 ? Math.min(unitsRemaining, Math.ceil(perDay * Math.min(daysInWeek, daysToInputEnd))) : 0;
      const minsPerUnit = udemy ? AP.udemy.minsPerUnit : 25;
      // 最近2週間のペースのまま進めたときに、教材が一周する日
      const since = today.getTime() - 14 * DAY;
      const recent = units.filter((u) => {
        const st = Store.unitState(u.id);
        return st && st.cleared && (st.clearedAt || st.at || 0) >= since;
      }).length;
      const finish = unitsRemaining && recent ? new Date(today.getTime() + Math.ceil(unitsRemaining / (recent / 14)) * DAY) : null;
      // 演習期からの過去問(Udemy §14〜23 の解説とセット。3日に1回)
      const pastTotal = past ? past.total : 0;
      const pastDone = past ? past.done : 0;
      const pastExp = past && stage === 'A' && today >= aEnd ? Math.min(pastTotal, Math.floor((today - aEnd) / DAY / 3) + 1) : 0;
      const pastLeft = pastTotal - pastDone;
      const daysToExam = Math.max(1, Math.round((exam - today) / DAY));
      // 残りの過去問を、試験の3日前までに終えるための間隔(日)
      const pastEvery = pastLeft > 0 && stage === 'A' ? Math.max(1, Math.floor(Math.max(1, daysToExam - 3) / pastLeft)) : null;
      // 1日の学習時間の目安(分): 教材 + 過去問(解く150分 + 見直し60分)+ 復習・用語カード
      const inputMins = Math.round(perDay * minsPerUnit);
      const pastMins = phaseIdx >= 1 && pastLeft ? Math.round((pastLeft * 210) / daysToExam) : 0;
      const dailyMins = stage === 'B' ? 90 : inputMins + pastMins + (phaseIdx === 0 ? 20 : 30);
      // 設定した時間(平日・土日)で進めた場合の見通し。片方だけ設定されていれば、もう片方も同じとみなす
      const w = bud.weekday || bud.holiday, h = bud.holiday || bud.weekday;
      let budgetPlan = null;
      if (w && stage === 'A' && phaseIdx === 0 && unitsRemaining > 0) {
        const weekUnits = (5 * Math.max(0, w - OVERHEAD) + 2 * Math.max(0, h - OVERHEAD)) / minsPerUnit;
        const needWeekMins = Math.ceil(perDay * 7 * minsPerUnit) + 7 * OVERHEAD;
        const haveWeekMins = 5 * w + 2 * h;
        const finishBy = weekUnits > 0 ? new Date(today.getTime() + Math.ceil(unitsRemaining / (weekUnits / 7)) * DAY) : null;
        budgetPlan = { weekUnits, needWeekMins, haveWeekMins, finishBy, enough: !!finishBy && finishBy <= aEnd };
      }
      // 過去問に取り組める日(時間の取れる日)が、試験の前日までに何日あるか
      let longDays = 0;
      if (stage === 'A') {
        for (let d = new Date(today); d < exam; d = new Date(d.getTime() + DAY)) if (longOk(bud, isWeekend(d))) longDays += 1;
      }
      return {
        w, h, budgetPlan, longDays, longLimited,
        expUnits, expSec, nowSec, weekNeed, sunday, perDay, minsPerUnit, recent, finish,
        pastTotal, pastDone, pastExp, pastLeft, pastEvery, daysToExam, dailyMins, aEnd, bEnd,
      };
    })();

    return {
      exam, examB, examStr: fmt(exam), examBStr: fmt(examB), stage, target, daysLeft, totalDays, elapsed,
      passed: stage === 'done',
      phases, phase, phaseIdx,
      unitsTotal, unitsDone, unitsRemaining, nextUnit,
      partsDone, casesDone, dueCount,
      paceLabel, recommended, onTrack, diff, expectedUnits,
      tasks, nextTask, apply, jp, udemy, pace, budget, holiday,
    };
  }

  function markApplied(key, v) { Store.setPref(key, v); }

  // ---- 科目B(午後)の過去問: 選んだ分野と、次に解く1問 ----
  const PM_MAX = 5; // 本番で解く4分野 + 予備1分野
  function pmChosen() {
    const ids = Store.pref('pmFields', []) || [];
    return (AP.pmFields || []).filter((f) => !f.required && ids.includes(f.id)).map((f) => f.id);
  }
  function setPmChosen(ids) { Store.setPref('pmFields', ids.slice(0, PM_MAX)); }
  // 練習する分野(問1 情報セキュリティ + 選んだ分野)を問題番号の順に
  function pmTargets() {
    const chosen = pmChosen();
    return (AP.pmFields || []).filter((f) => f.required || chosen.includes(f.id));
  }
  const pmKey = (examId, fieldNo) => `${examId}-${fieldNo}`;
  // 新しい試験から順に、1回分(問1 + 選んだ分野)を通して解いていく
  function pmNext() {
    if (!pmChosen().length) return null;
    const done = new Set(Store.pmExams().map((r) => r.id));
    for (const e of AP.pastExamList || []) {
      for (const f of pmTargets()) {
        if (!done.has(pmKey(e.id, f.no))) return { exam: e, field: f, key: pmKey(e.id, f.no) };
      }
    }
    return null;
  }

  return { compute, examDate, examBDate, setExamDate, setExamBDate, markApplied, DEFAULT_A, REVIEW_LIMIT, IPA_URL, PAST_URL, SCHEDULES,
    PM_MAX, pmChosen, setPmChosen, pmTargets, pmNext, pmKey, scheduleOf, budgets, setBudget, reviewLimit };
})();
