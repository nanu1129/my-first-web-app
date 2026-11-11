// 端末間同期: Googleログイン + Firestore に学習データを保存し、PC/スマホで共有する
// 設定(js/firebase-config.js)が空のときは自動同期は使えないが、記録をファイルで送って移すことはできる。
const Sync = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
  const GUIDE = 'https://github.com/nanu1129/my-first-web-app/blob/main/ap-study/SYNC-SETUP.md';
  const DEBOUNCE = 1500;

  let state = 'off';   // off(未設定) | ready(ログイン前) | signing | on(同期中) | error
  let user = null;
  let db = null, auth = null;
  let unsub = null;
  let timer = null;
  let lastPushed = '';
  let dirty = false;   // 送れなかった変更がある
  let message = '';
  let notice = '';     // 利用者に必ず伝えたいこと(ほかの端末でのリセットなど)。パネルを閉じるまで表示する
  let fileMsg = '';

  const cfg = () => window.AP_FIREBASE_CONFIG || {};
  const configured = () => !!(cfg().apiKey && cfg().projectId && cfg().appId);
  const now = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  // 中身の比較用: キーの順番と端末IDの違いは無視する
  function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
    return JSON.stringify(v);
  }
  const content = (st) => (st ? stable(Object.assign({}, st, { deviceId: '' })) : '');

  // つまずきやすい失敗の理由を、直し方が分かる言葉にする
  function errText(e) {
    const code = String((e && e.code) || '');
    const map = {
      'auth/unauthorized-domain': 'このサイトのドメインがFirebaseで許可されていません(Authenticationの承認済みドメインに nanu1129.github.io を追加)',
      'auth/operation-not-allowed': 'FirebaseでGoogleログインが有効になっていません(Authenticationのログイン方法でGoogleを有効に)',
      'auth/popup-blocked': 'ログイン画面(ポップアップ)がブロックされました。ブラウザでこのサイトのポップアップを許可して、もう一度押してください',
      'auth/popup-closed-by-user': 'ログインが途中で閉じられました',
      'auth/cancelled-popup-request': 'ログインが途中で閉じられました',
      'auth/network-request-failed': '通信できませんでした。インターネット接続を確認してください',
      'auth/web-storage-unsupported': 'このブラウザの設定(プライベートモードなど)ではログインできません',
      'auth/invalid-api-key': 'Firebaseの設定値(apiKey)が正しくありません',
      'permission-denied': 'データベースのルールで拒否されました(Firestoreのルールを手順書のとおりに設定)',
      'unavailable': '通信できませんでした',
      'not-found': 'データベース(Firestore)がまだ作られていません',
      'failed-precondition': 'データベース(Firestore)がまだ作られていません',
    };
    const key = code.replace(/^firestore\//, '');
    return map[key] || map[code] || `うまくいきませんでした${code ? `(${code})` : ''}`;
  }

  // LINEなどアプリの中のブラウザでは、Googleがログインを受け付けない
  function inAppBrowser() {
    const ua = navigator.userAgent || '';
    if (/ Line\//i.test(ua)) return 'line';
    if (/FBAN|FBAV|Instagram|MicroMessenger|Twitter/i.test(ua)) return 'other';
    return '';
  }

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

  // この端末だけに置くメモ: 同期したアカウント(uid)、反映済みのリセット時刻(resetSeen)、
  // この端末で行ってまだクラウドに送れていないリセット(pendingReset)
  const META_KEY = 'ap-sync-meta';
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) {
    try {
      if (m) localStorage.setItem(META_KEY, JSON.stringify(m)); else localStorage.removeItem(META_KEY);
    } catch (e) { /* 保存できない環境では、毎回「初めての端末」として扱われる(記録はまとめるだけで消えない) */ }
  }

  const docRef = () => db.collection('users').doc(user.uid);
  // App は const で定義されているため window.App では参照できない
  const refresh = () => { if (typeof App !== 'undefined' && App.refresh) App.refresh(); };

  // クラウドの最新の記録とこの端末の記録をまとめてから書き込む(トランザクション)。
  // 2台で同時に勉強しても、どちらかの記録が上書きで消えることはない。
  // 「すべてリセット」だけは別扱い: リセットした端末はクラウドを置き換え、同期していたほかの端末は記録を消して合わせる
  // (まとめてしまうと、消したはずの記録がほかの端末から戻ってきてしまうため)
  async function push(force) {
    if (state !== 'on' || !user) return;
    clearTimeout(timer);
    const json = JSON.stringify(Store.snapshot());
    const meta = loadMeta();
    const mine = meta.uid === user.uid; // この端末は、このアカウントと同期したことがある
    if (!force && !dirty && !meta.pendingReset && json === lastPushed) return;
    const before = content(Store.snapshot());
    try {
      let next = null, wiped = false, newMeta = null;
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(docRef());
        const d = doc.exists ? (doc.data() || {}) : {};
        const remoteReset = d.resetAt || 0;
        wiped = false;
        if (mine && meta.pendingReset && meta.pendingReset > remoteReset) {
          // この端末でリセットした: クラウドをこの端末の(空になった)記録で置き換える
          next = Store.snapshot();
          tx.set(docRef(), { state: next, writer: Store.deviceId(), updatedAt: Date.now(), resetAt: meta.pendingReset });
          newMeta = { uid: user.uid, resetSeen: meta.pendingReset };
        } else if (mine && d.state && remoteReset > (meta.resetSeen || 0)) {
          // ほかの端末でリセットされた: この端末の記録は送らず、クラウドの記録に合わせる
          next = d.state;
          wiped = true;
          newMeta = { uid: user.uid, resetSeen: remoteReset };
        } else {
          next = Store.mergeStates(d.state || null, Store.snapshot());
          next.deviceId = Store.deviceId();
          tx.set(docRef(), { state: next, writer: Store.deviceId(), updatedAt: Date.now(), resetAt: remoteReset });
          newMeta = { uid: user.uid, resetSeen: remoteReset };
        }
      });
      Store.applyState(next);
      saveMeta(newMeta);
      lastPushed = JSON.stringify(Store.snapshot());
      dirty = false;
      message = `同期済み ${now()}`;
      if (wiped) announceReset();
      if (content(Store.snapshot()) !== before) refresh();
    } catch (e) {
      dirty = true;
      message = `保存できませんでした: ${errText(e)}。通信が戻ると自動でやり直します`;
    }
    render();
  }

  // ほかの端末でのリセットを反映したことを知らせる(急に記録が消えたように見えるので、パネルを開いて理由を示す)
  function announceReset() {
    notice = `ほかの端末で「すべてリセット」が行われたため、この端末の記録も消しました(${now()})`;
    const panel = document.getElementById('sync-panel');
    if (panel) panel.hidden = false;
  }

  // すべてリセット(同期中): この端末を空にして、クラウドとほかの端末にも伝える
  function resetEverywhere() {
    if (state !== 'on' || !user) { Store.resetAll(); return Promise.resolve(); }
    const meta = loadMeta();
    saveMeta({ uid: user.uid, resetSeen: meta.uid === user.uid ? (meta.resetSeen || 0) : 0, pendingReset: Date.now() });
    Store.resetAll();
    return push(true);
  }

  function schedulePush() {
    if (state !== 'on') return;
    clearTimeout(timer);
    timer = setTimeout(() => push(false), DEBOUNCE);
  }

  // ほかの端末の書き込みを受け取ったら、この端末の記録とまとめる
  function watch() {
    if (unsub) unsub();
    unsub = docRef().onSnapshot((snap) => {
      const d = snap.data();
      if (!d || !d.state || d.writer === Store.deviceId()) { if (dirty) schedulePush(); return; }
      const meta = loadMeta();
      const remoteReset = d.resetAt || 0;
      if (meta.uid === user.uid && remoteReset > (meta.resetSeen || 0) && !(meta.pendingReset > remoteReset)) {
        Store.applyState(d.state);
        saveMeta({ uid: user.uid, resetSeen: remoteReset });
        lastPushed = JSON.stringify(Store.snapshot());
        dirty = false;
        clearTimeout(timer);
        message = `同期済み ${now()}`;
        announceReset();
        render();
        refresh();
        return;
      }
      const before = content(Store.snapshot());
      Store.applyState(Store.mergeStates(d.state, Store.snapshot()));
      const after = content(Store.snapshot());
      if (after !== before) {
        message = `ほかの端末の学習を取り込みました ${now()}`;
        render();
        refresh();
      }
      if (after !== content(d.state)) schedulePush(); // この端末にしかない記録をクラウドへ
    }, (e) => {
      message = `同期の受信が止まりました: ${errText(e)}`;
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
          await push(true);
          watch();
        } else {
          state = 'ready';
          if (unsub) { unsub(); unsub = null; }
          render();
        }
      });
      // ローカルの変更を検知して自動保存。通信が戻ったとき・画面に戻ったときは、送れなかった分を送る
      Store.onChange(schedulePush);
      window.addEventListener('online', () => { if (dirty) push(true); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && dirty) push(true); });
      // 以前のリダイレクト方式でのログイン結果を回収
      if (auth.getRedirectResult) auth.getRedirectResult().catch((e) => { message = errText(e); render(); });
    } catch (e) {
      state = 'error';
      message = '同期の準備ができませんでした。通信を確認して、ページを再読み込みしてください';
    }
    render();
  }

  // ポップアップでログインする(GitHub Pages ではリダイレクト方式は最近のブラウザで使えないため)
  async function signIn() {
    if (state !== 'ready' && state !== 'error') return;
    if (!auth) return;
    state = 'signing';
    message = '';
    render();
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) {
      state = 'ready';
      message = errText(e);
      render();
    }
  }

  async function signOut() {
    if (!auth) return;
    await push(true).catch(() => {});
    await auth.signOut();
    saveMeta(null);
    message = 'ログアウトしました。この端末の記録はそのまま残っています';
    render();
  }

  // ---------- 記録をファイルで送る・受け取る(自動同期を設定する前でも使える) ----------
  async function sendFile() {
    const r = await Backup.share();
    fileMsg = r.how === 'shared' ? '送りました。受け取った端末で「受け取った記録を読み込む」を押してください'
      : r.how === 'cancelled' ? '' : `「${r.name}」を保存しました。もう一方の端末に移して読み込んでください`;
    render();
  }
  function receiveFile(file) {
    Backup.read(file).then(() => {
      fileMsg = '読み込みました。2台の記録を1つにまとめています(二重には数えません)';
      render();
      refresh();
    }).catch((e) => { fileMsg = `読み込めませんでした: ${e.message}`; render(); });
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

  const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  function fileBlock(lead) {
    return `
      <p class="sync-sub">${lead}</p>
      <div class="sync-actions">
        <button class="btn-mini" id="sync-send">この端末の記録を送る</button>
        <button class="btn-mini ghost" id="sync-recv">受け取った記録を読み込む</button>
        <input type="file" id="sync-file" accept="application/json,.json,text/plain,.txt" hidden>
      </div>
      ${fileMsg ? `<p class="sync-note sync-msg" role="status">${esc(fileMsg)}</p>` : ''}`;
  }
  function bindFileBlock(panel) {
    const send = panel.querySelector('#sync-send');
    if (!send) return;
    send.addEventListener('click', sendFile);
    const input = panel.querySelector('#sync-file');
    panel.querySelector('#sync-recv').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files && input.files[0]) receiveFile(input.files[0]); });
  }

  function renderPanel(panel) {
    if (state === 'off') {
      panel.innerHTML = `
        <p class="sync-title">端末間の同期</p>
        <p class="sync-note">いまは、この端末の中だけに記録しています。PCとスマホで<b>自動で共有</b>するには、最初に一度だけFirebaseの設定(約10分)が必要です。
          <a href="${GUIDE}" target="_blank" rel="noopener">設定のしかた</a></p>
        ${fileBlock('設定する前でも、記録をファイルで送って、もう一方の端末で読み込めば1つにまとまります。')}`;
      bindFileBlock(panel);
      return;
    }
    if (state === 'on') {
      panel.innerHTML = `
        <p class="sync-title">同期中</p>
        <p class="sync-note">${esc(user ? user.email : '')}<br>${esc(message)}</p>
        ${notice ? `<p class="sync-note sync-warn" role="status">${esc(notice)}</p>` : ''}
        <p class="sync-note">ほかの端末でも同じGoogleアカウントでログインすると、記録が自動で共有されます。</p>
        <div class="sync-actions">
          <button class="btn-mini" id="sync-now">今すぐ同期</button>
          <button class="btn-mini ghost" id="sync-out">ログアウト</button>
        </div>`;
      panel.querySelector('#sync-now').addEventListener('click', () => push(true));
      panel.querySelector('#sync-out').addEventListener('click', signOut);
      return;
    }
    const app = inAppBrowser();
    const external = `${location.origin}${location.pathname}?openExternalBrowser=1`;
    panel.innerHTML = `
      <p class="sync-title">端末間の同期</p>
      <p class="sync-note">Googleでログインすると、PCとスマホで進捗・復習の予定・成績を自動で共有できます。どの端末でも同じGoogleアカウントでログインしてください。</p>
      ${app ? `<p class="sync-note sync-warn">${app === 'line'
        ? `LINEの中のブラウザではGoogleログインができません。<a href="${external}">Safari・Chromeで開く</a>`
        : 'アプリの中のブラウザではGoogleログインができません。メニューの「ブラウザで開く」から開き直してください。'}</p>` : ''}
      ${message ? `<p class="sync-note sync-warn" role="status">${esc(message)}</p>` : ''}
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
    if (!panel.hidden) { fileMsg = ''; renderPanel(panel); } else notice = '';
  }

  function closePanel() {
    const panel = document.getElementById('sync-panel');
    if (panel) panel.hidden = true;
    notice = '';
  }

  return { init, togglePanel, closePanel, signIn, signOut, configured, resetEverywhere, status: () => state };
})();
