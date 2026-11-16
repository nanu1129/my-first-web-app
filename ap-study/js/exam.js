// 模擬試験モード: 本試験の配分比でランダム出題 + 制限時間
const Exam = (() => {
  const $view = () => document.getElementById('view-exam');

  // 本試験は80問150分 ≒ 1問あたり112.5秒
  const PLANS = [
    { count: 20, minutes: 38, desc: 'すきま時間でサクッと実力チェック' },
    { count: 40, minutes: 75, desc: 'ハーフ模試。じっくり弱点を洗い出す' },
    { count: 80, minutes: 150, desc: '本試験と同じボリュームの完全模試' },
  ];

  const fmtWhen = (t) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  function render() {
    const total = AP.questions.length;
    // 中断した模試(この端末に保存)。教材の更新で問題が合わなくなったものは、再開できないので片づける
    const saved = Quiz.loadMock();
    const stale = !saved && Quiz.hasSavedMock();
    if (stale) Quiz.discardMock();
    const resumeBox = saved ? `
      <div class="exam-resume" id="exam-resume">
        <div class="er-main">
          <b>中断した模試があります</b>
          <span>${saved.total}問 / ${saved.plan.minutes}分 ・ 解答 ${saved.answered}/${saved.total}問 ・ 残り時間 約${Math.ceil(saved.remainSec / 60)}分<br>${fmtWhen(saved.savedAt)} に中断(この端末に保存しています)</span>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="exam-resume-btn">続きから再開する</button>
          <button class="btn-text" id="exam-discard-btn">破棄する</button>
        </div>
      </div>` : stale ? '<p class="exam-stale" role="status">問題が更新されたため、中断していた模試は再開できなくなりました。お手数ですが、新しく始めてください。</p>' : '';
    $view().innerHTML = `
      <h2 class="view-title">模擬試験</h2>
      <p class="view-lead">科目A(旧午前)と同じ80問・150分の形式です。全分野の本番レベル問題から、本試験の分野配分に合わせてランダムに出題します。制限時間つき・採点は最後にまとめて行います(合格ライン60%)。</p>
      <p class="exam-cbt"><span class="pill pill-accent">本番と同じ操作</span> 前後の問題への移動、「後で見直す」の印、問題一覧、答えの変更ができます。終了後は、1問ごとにかかった時間も分かります。</p>
      ${resumeBox}
      <div class="exam-options">
        ${PLANS.map((p, i) => `
          <button class="exam-option" data-plan="${i}">
            <span class="eo-count">${p.count}問<small> / ${p.minutes}分</small></span>
            <p class="eo-desc">${p.desc}</p>
          </button>`).join('')}
      </div>
      <p class="exam-note">本番はCBT方式で、パソコンの画面で解答します。この模試も画面で解くので、そのまま本番の練習になります。<br>収録問題: ${total}問(科目A・旧午前の頻出テーマをもとに作成した演習問題)。途中で中断しても、この端末で続きから再開できます(時計は止まります)。
        本物の過去問題は <a href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">IPA 公式サイト</a> で公開されています。仕上げに解いておきましょう。</p>`;

    $view().querySelectorAll('.exam-option').forEach((btn) => {
      btn.addEventListener('click', () => start(PLANS[Number(btn.dataset.plan)]));
    });
    const resumeBtn = document.getElementById('exam-resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', resume);
    const discardBtn = document.getElementById('exam-discard-btn');
    if (discardBtn) discardBtn.addEventListener('click', () => {
      if (confirm('中断した模試を破棄します。解答した内容は採点されません。よろしいですか?')) { Quiz.discardMock(); render(); }
    });
  }

  // 配分比(AP.examWeights)に沿って各パートから抽出する。
  // 最近解いていない問題から順に選ぶので、何回受けても同じ問題ばかりにならない。
  // 各パートの3割ほどは、教材の一問一答からも出す(出題の幅を広げる)
  const CHECK_SHARE = 0.3;
  function pickQuestions(count) {
    const fresh = (list) => Quiz.shuffle(list).sort((a, b) => Store.lastSeen(a.qid) - Store.lastSeen(b.qid));
    const asMock = (q) => Object.assign({}, q, { source: `一問一答「${q.unitTitle}」` });
    const bank = {}, checks = {};
    AP.parts.forEach((p) => {
      bank[p.id] = fresh(AP.questions.filter((q) => q.partId === p.id));
      checks[p.id] = fresh((AP.allQuestions || []).filter((q) => q.partId === p.id && /^chk-/.test(q.qid))).map(asMock);
    });
    // パートごとの問題数(最大剰余法で、合計がちょうど count 問になるように配分する)
    const quota = AP.parts.map((p) => {
      const x = (AP.examWeights[p.id] || 0) * count;
      return { id: p.id, x, n: Math.floor(x) };
    });
    let left = count - quota.reduce((n, q) => n + q.n, 0);
    quota.slice().sort((a, b) => (b.x - b.n) - (a.x - a.n)).forEach((q) => { if (left > 0) { q.n += 1; left -= 1; } });
    const picked = [];
    quota.forEach(({ id, n: want }) => {
      const nCheck = Math.min(checks[id].length, Math.round(want * CHECK_SHARE));
      const fromBank = bank[id].splice(0, want - nCheck);
      picked.push(...fromBank, ...checks[id].splice(0, want - fromBank.length));
    });
    // 端数調整: 不足分は残りから(最近解いていない順に)、超過分は削る
    const rest = fresh(Object.values(bank).flat()).concat(fresh(Object.values(checks).flat()));
    while (picked.length < count && rest.length) picked.push(rest.shift());
    return Quiz.shuffle(picked.slice(0, count));
  }

  // plan を渡しておくと、途中の進み具合が端末に保存され、中断しても続きから再開できる
  function config(plan, questions) {
    return {
      title: `模擬試験(${questions.length}問 / ${plan.minutes}分)`,
      questions,
      plan: { count: plan.count, minutes: plan.minutes },
      mode: 'mock',
      passRate: 0.6,
      timeLimitSec: plan.minutes * 60,
      backLabel: '模試メニューへ',
      onBack: () => App.navigate('exam'),
      passLabel: null,
      resultNote: (r) => (r.pass
        ? '合格ライン(60%)を突破しました!この調子で仕上げていきましょう。'
        : '合格ラインは60%です。分野別の内訳から弱点を確認しましょう。'),
      onFinish: (r) => {
        Store.logAct('mock');
        Store.addHistory({ kind: '模擬試験', label: `${r.total}問`, score: r.score, total: r.total, pass: r.pass });
      },
    };
  }

  function start(plan) {
    if (Quiz.loadMock() && !confirm('中断した模試があります。新しく始めると、中断した模試は破棄されます。よろしいですか?')) return;
    Quiz.discardMock();
    Quiz.start(config(plan, pickQuestions(plan.count)));
  }

  // 中断した模試を、同じ問題・同じ選択肢の並び・残り時間で再開する
  function resume() {
    const saved = Quiz.loadMock();
    if (!saved) { render(); return; }
    Quiz.start(config(saved.plan, saved.questions), saved);
  }

  return { render, resume };
})();
