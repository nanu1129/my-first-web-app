// 応用情報技術者試験 学習サイト - データコンテナとパート定義
window.AP = window.AP || {};
AP.lessons = [];   // 各 lessons-*.js が push する
AP.questions = []; // 各 questions-*.js が push する
AP.terms = [];     // terms.js が push する

// パート(章)の定義。表示順もこの順。
// icon はパートを表す1文字(マナビットDS: 絵文字は使わず文字を円形バッジに)
AP.parts = [
  { id: 'basics',   name: '基礎理論',
    desc: '基数変換・論理演算・データ構造とアルゴリズム', icon: '基' },
  { id: 'computer', name: 'コンピュータシステム',
    desc: 'プロセッサ・メモリ・システム構成と信頼性・OS', icon: 'コ' },
  { id: 'database', name: 'データベース',
    desc: '関係モデル・正規化・SQL・トランザクション', icon: 'デ' },
  { id: 'network',  name: 'ネットワーク',
    desc: 'TCP/IP・IPアドレス・ルーティング・プロトコル', icon: 'ネ' },
  { id: 'security', name: 'セキュリティ',
    desc: '暗号・認証・PKI・攻撃手法と対策', icon: 'セ' },
  { id: 'dev',      name: '開発技術',
    desc: '開発プロセス・設計手法・テスト技法', icon: '開' },
  { id: 'management', name: 'マネジメント',
    desc: 'プロジェクトマネジメント・サービスマネジメント・監査', icon: 'マ' },
  { id: 'strategy', name: 'ストラテジ',
    desc: '経営戦略・システム戦略・企業会計と法務', icon: 'ス' },
];

// 模擬試験での出題配分(本試験の午前80問のおおよその比率)
AP.examWeights = {
  basics: 0.125, computer: 0.15, database: 0.0875, network: 0.0875,
  security: 0.125, dev: 0.10, management: 0.125, strategy: 0.20,
};

// ユニット完了に必要な一問一答の正答率
AP.PASS_RATE = 0.8;
