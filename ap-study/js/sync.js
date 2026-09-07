// 端末間同期: Googleログイン + Firestore に学習データを保存し、PC/スマホで共有する
// 設定(js/firebase-config.js)が空のときは何もせず、従来どおり端末内保存で動作する。
const Sync = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
  const DEBOUNCE = 1500;

  let state = 'off';   // off | ready | signing | on | error
  let user = null;
  let db = null, auth = null;
  let unsub = null;
  let timer = null;
  let lastPushed = '';
  let message = '';

  const cfg = () => window.AP_FIREBASE_CONFIG || {};
  const configured = () => !!(cfg().apiKey && cfg().projectId && cfg().appId);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`読み込み失敗: ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadSdk() {
    if (window.firebase && window.firebase.firestore) return;
    await loadScript(`${SDK}/firebase-app-compat.js`);
    await Promise.all([
      loadScript(`${SDK}/firebase-auth-compat.js`),
      loadScript(`${SDK}/firebase-firestore-compat.js`),
    ]);
  }

  function docRef() {
    return db.collection('users').doc(user.uid);
  }

  // リモートとローカルをマージして双方に反映する
  async function pullMergePush(remoteState) {
    const local = Store.snapshot();
    const merged = Store.mergeStates(remoteState, local);
    Store.applyState(merged);
    await push(true);
    if (window.App && App.refresh) App.refresh();
  }

  async function push(force) {
    if (state !== 'on' || !user) return;
    const snap = Store.snapshot();
    const json = JSON.stringify(snap);
    if (!force && json === lastPushed) return;
    lastPushed = json;
    try {
      await docRef().set({
        state: snap,
        writer: Store.deviceId(),
        updatedAt: Date.now(),
      });
      message = `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
      render();
    } catch (e) {
      message = '保存に失敗しました(通信環境をご確認ください)';
      render();
    }
  }

  function schedulePush() {
    if (state !== 'on') return;
    clearTimeout(timer);
    timer = setTimeout(() => push(false), DEBOUNCE);
  }

  function watch() {
    if (unsub) unsub();
    unsub = docRef().onSnapshot((snap) => {
      const d = snap.data();
      if (!d || !d.state) return;
      if (d.writer === Store.deviceId()) return; // 自分の書き込みは無視
      const merged = Store.mergeStates(d.state, Store.snapshot());
      Store.applyState(merged);
      message = '他の端末の学習を取り込みました';
      render();
      if (window.App && App.refresh) App.refresh();
    }, () => {
      message = '同期の監視が中断されました';
      render();
    });
  }

  async function init() {
    if (!configured()) { state = 'off'; render(); return; }
    try {
      await loadSdk();
      const app = firebase.initializeApp(cfg());
      auth = firebase.auth(app);
      db = firebase.firestore(app);
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      state = 'ready';
      auth.onAuthStateChanged(async (u) => {
        user = u;
        if (u) {
          state = 'on';
          message = '同期しています…';
          render();
          try {
            const snap = await docRef().get();
            const d = snap.data();
            await pullMergePush(d && d.state ? d.state : null);
            watch();
          } catch (e) {
            message = '読み込みに失敗しました';
            render();
          }
        } else {
          state = 'ready';
          message = '';
          if (unsub) { unsub(); unsub = null; }
          render();
        }
      });
      // ローカルの変更を検知して自動保存
      Store.onChange(schedulePush);
      // リダイレクト方式でのログイン結果を回収
      auth.getRedirectResult().catch(() => {});
    } catch (e) {
      state = 'error';
      message = '同期の初期化に失敗しました';
    }
    render();
  }

  async function signIn() {
    if (state === 'off') return;
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      state = 'signing'; render();
      await auth.signInWithPopup(provider);
    } catch (e) {
      // ポップアップが塞がれる環境(スマホのブラウザ等)ではリダイレクトに切り替える
      if (e && /popup/i.test(e.code || '')) {
        try { await auth.signInWithRedirect(provider); return; } catch (e2) { /* noop */ }
      }
      state = 'ready';
      message = 'ログインできませんでした';
      render();
    }
  }

  async function signOut() {
    if (!auth) return;
    await push(true).catch(() => {});
    await auth.signOut();
  }

  // ---------- 画面表示 ----------
  const ICON = {
    off: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16"/><path d="M17.5 17.5H7a4 4 0 0 1-.7-7.94"/><path d="M8.6 5.3A5.5 5.5 0 0 1 17.5 9.5a3.5 3.5 0 0 1 2.9 5.4"/></svg>',
    on: '<svg viewBox="0 0 24 24"><path d="M17.5 18H7A4 4 0 0 1 7 10a5.5 5.5 0 0 1 10.5 1.5 3.5 3.5 0 0 1 0 6.5z"/><path d="M9.5 14.5l1.8 1.8 3.4-3.6"/></svg>',
    ready: '<svg viewBox="0 0 24 24"><path d="M17.5 18H7A4 4 0 0 1 7 10a5.5 5.5 0 0 1 10.5 1.5 3.5 3.5 0 0 1 0 6.5z"/></svg>',
  };

  function render() {
    const btn = document.getElementById('sync-btn');
    if (!btn) return;
    const key = state === 'on' ? 'on' : (state === 'off' ? 'off' : 'ready');
    btn.innerHTML = ICON[key];
    btn.classList.toggle('is-on', state === 'on');
    btn.setAttribute('title', state === 'on' ? `同期中: ${user ? user.email : ''}` : '端末間の同期');
    const panel = document.getElementById('sync-panel');
    if (panel && !panel.hidden) renderPanel(panel);
  }

  function renderPanel(panel) {
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    if (state === 'off') {
      panel.innerHTML = `
        <p class="sync-title">端末間の同期</p>
        <p class="sync-note">まだ設定されていません。学習データはこの端末にのみ保存されています。
          <br>設定すると、PCとスマホで進捗・復習スケジュール・成績を共有できます。</p>`;
      return;
    }
    if (state === 'on') {
      panel.innerHTML = `
        <p class="sync-title">同期中</p>
        <p class="sync-note">${esc(user ? user.email : '')}<br>${esc(message)}</p>
        <div class="sync-actions">
          <button class="btn-mini" id="sync-now">今すぐ同期</button>
          <button class="btn-mini ghost" id="sync-out">ログアウト</button>
        </div>`;
      panel.querySelector('#sync-now').addEventListener('click', () => push(true));
      panel.querySelector('#sync-out').addEventListener('click', signOut);
      return;
    }
    panel.innerHTML = `
      <p class="sync-title">端末間の同期</p>
      <p class="sync-note">Googleでログインすると、PCとスマホで学習データを共有できます。
        ${message ? `<br>${esc(message)}` : ''}</p>
      <div class="sync-actions">
        <button class="btn-mini" id="sync-in" ${state === 'signing' ? 'disabled' : ''}>
          ${state === 'signing' ? 'ログイン中…' : 'Googleでログイン'}</button>
      </div>`;
    const b = panel.querySelector('#sync-in');
    if (b) b.addEventListener('click', signIn);
  }

  function togglePanel() {
    const panel = document.getElementById('sync-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderPanel(panel);
  }

  return { init, togglePanel, signIn, signOut, configured, status: () => state };
})();
