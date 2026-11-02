// ===== 端末間同期の設定 =====
// Firebase コンソール( https://console.firebase.google.com/ )で作成したウェブアプリの構成。
// これがあると、Googleでログインした端末どうしで学習データが自動で同期されます。
//
// 貼り付けている値は公開されても問題ない識別子です(秘密鍵ではありません)。
// 実際のアクセス制御は Firestore のセキュリティルール(自分のデータは自分だけ)で行います。
window.AP_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDjuSXQVEDpSvZGUJ9IOduPDsOdHR6y_Xk',
  authDomain: 'manabit-53cab.firebaseapp.com',
  projectId: 'manabit-53cab',
  storageBucket: 'manabit-53cab.firebasestorage.app',
  messagingSenderId: '976489454953',
  appId: '1:976489454953:web:1f725b43a34303e45971f8',
};
