// 画面遷移と初期化
const App = (() => {
  const VIEWS = ['home', 'lesson', 'quiz', 'practice', 'exam', 'cards', 'stats'];
  // ナビタブに対応する画面(lesson/quiz は home 配下の扱い)
  const NAV_OF = { home: 'home', lesson: 'home', quiz: null, practice: 'practice', exam: 'exam', cards: 'cards', stats: 'stats' };

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
    if (nav === 'practice') { Practice.renderMenu(); show('practice'); return; }
    if (nav === 'exam') { Exam.render(); show('exam'); return; }
    if (nav === 'cards') { Cards.render(); show('cards'); return; }
    if (nav === 'stats') { Stats.render(); show('stats'); return; }
  }

  // テーマ切替(マナビットDS: data-theme。無指定はOS設定に追従)
  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    const isDark = () => {
      const t = document.documentElement.dataset.theme;
      return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    };
    const paint = () => { btn.innerHTML = isDark() ? SUN : MOON; };
    const saved = localStorage.getItem('ap-theme');
    if (saved) document.documentElement.dataset.theme = saved;
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('ap-theme', next);
      paint();
    });
    paint();
  }

  function init() {
    // 過去問に復習リスト用の安定IDを付与
    AP.questions.forEach((q, i) => { q.qid = `${q.partId}-${i}`; });
    initTheme();

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

  return { show, goHome, navigate };
})();
