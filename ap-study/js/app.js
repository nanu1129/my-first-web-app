// 画面遷移と初期化
const App = (() => {
  const VIEWS = ['home', 'lesson', 'quiz', 'exam', 'cards', 'stats'];
  // ナビタブに対応する画面(lesson/quiz は home 配下の扱い)
  const NAV_OF = { home: 'home', lesson: 'home', quiz: null, exam: 'exam', cards: 'cards', stats: 'stats' };

  function show(view) {
    VIEWS.forEach((v) => {
      document.getElementById(`view-${v}`).hidden = v !== view;
    });
    const nav = NAV_OF[view];
    document.querySelectorAll('#main-nav .tab').forEach((t) => {
      t.classList.toggle('is-active', !!nav && t.dataset.nav === nav);
    });
    window.scrollTo(0, 0);
  }

  function goHome() {
    Course.renderHome();
    show('home');
  }

  function navigate(nav) {
    if (nav === 'home') { goHome(); return; }
    if (nav === 'exam') { Exam.render(); show('exam'); return; }
    if (nav === 'cards') { Cards.render(); show('cards'); return; }
    if (nav === 'stats') { Stats.render(); show('stats'); return; }
  }

  function init() {
    document.querySelectorAll('#main-nav .tab').forEach((t) => {
      t.addEventListener('click', () => navigate(t.dataset.nav));
    });
    document.getElementById('logo-link').addEventListener('click', (e) => {
      e.preventDefault();
      goHome();
    });
    goHome();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { show, goHome };
})();
