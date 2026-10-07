// 模擬試験モード: 本試験の配分比でランダム出題 + 制限時間
const Exam = (() => {
  const $view = () => document.getElementById('view-exam');

  // 本試験は80問150分 ≒ 1問あたり112.5秒
  const PLANS = [
    { count: 20, minutes: 38, desc: 'すきま時間でサクッと実力チェック' },
    { count: 40, minutes: 75, desc: 'ハーフ模試。じっくり弱点を洗い出す' },
    { count: 80, minutes: 150, desc: '本試験と同じボリュームの完全模試' },
  ];

  function render() {
    const total = AP.questions.length;
    $view().innerHTML = `
      <h2 class="view-title">模擬試験</h2>
      <p class="view-lead">科目A(旧午前)と同じ80問・150分の形式です。全分野の本番レベル問題から、本試験の分野配分に合わせてランダムに出題します。制限時間つき・採点は最後にまとめて行います(合格ライン60%)。</p>
      <div class="exam-options">
        ${PLANS.map((p, i) => `
          <button class="exam-option" data-plan="${i}">
            <span class="eo-count">${p.count}問<small> / ${p.minutes}分</small></span>
            <p class="eo-desc">${p.desc}</p>
          </button>`).join('')}
      </div>
      <p class="exam-note">本番はCBT方式で、パソコンの画面で解答します。この模試も画面で解くので、そのまま本番の練習になります。<br>収録問題: ${total}問(科目A・旧午前の頻出テーマをもとに作成した演習問題)。途中でやめると採点されません。
        本物の過去問題は <a href="https://www.ipa.go.jp/shiken/" target="_blank" rel="noopener">IPA 公式サイト</a> で公開されています。仕上げに解いておきましょう。</p>`;

    $view().querySelectorAll('.exam-option').forEach((btn) => {
      btn.addEventListener('click', () => start(PLANS[Number(btn.dataset.plan)]));
    });
  }

  // 配分比(AP.examWeights)に沿って各パートから抽出
  function pickQuestions(count) {
    const byPart = {};
    AP.parts.forEach((p) => {
      byPart[p.id] = Quiz.shuffle(AP.questions.filter((q) => q.partId === p.id));
    });
    const picked = [];
    AP.parts.forEach((p) => {
      const want = Math.round((AP.examWeights[p.id] || 0) * count);
      picked.push(...byPart[p.id].splice(0, want));
    });
    // 端数調整: 不足分は残りからランダムに、超過分は削る
    const rest = Quiz.shuffle(Object.values(byPart).flat());
    while (picked.length < count && rest.length) picked.push(rest.pop());
    return Quiz.shuffle(picked.slice(0, count));
  }

  function start(plan) {
    const questions = pickQuestions(plan.count);
    Quiz.start({
      title: `模擬試験(${questions.length}問 / ${plan.minutes}分)`,
      questions,
      mode: 'mock',
      passRate: 0.6,
      timeLimitSec: plan.minutes * 60,
      backLabel: '模試メニューへ',
      onBack: () => App.show('exam'),
      passLabel: null,
      resultNote: (r) => (r.pass
        ? '合格ライン(60%)を突破しました!この調子で仕上げていきましょう。'
        : '合格ラインは60%です。分野別の内訳から弱点を確認しましょう。'),
      onFinish: (r) => {
        Store.logAct('mock');
        Store.addHistory({ kind: '模擬試験', label: `${r.total}問`, score: r.score, total: r.total, pass: r.pass });
      },
    });
  }

  return { render };
})();
