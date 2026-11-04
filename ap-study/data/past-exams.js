// IPAが公開している応用情報技術者試験 午前(科目A)の過去問題。得点を記録するための一覧(新しい順)
// 令和2年度は春期が中止となり、10月に実施された
AP.pastExamList = [
  { id: 'r07a', name: '令和7年度 秋期' }, { id: 'r07s', name: '令和7年度 春期' },
  { id: 'r06a', name: '令和6年度 秋期' }, { id: 'r06s', name: '令和6年度 春期' },
  { id: 'r05a', name: '令和5年度 秋期' }, { id: 'r05s', name: '令和5年度 春期' },
  { id: 'r04a', name: '令和4年度 秋期' }, { id: 'r04s', name: '令和4年度 春期' },
  { id: 'r03a', name: '令和3年度 秋期' }, { id: 'r03s', name: '令和3年度 春期' },
  { id: 'r02o', name: '令和2年度 10月' }, { id: 'r01a', name: '令和元年度 秋期' },
  { id: 'h31s', name: '平成31年度 春期' }, { id: 'h30a', name: '平成30年度 秋期' }, { id: 'h30s', name: '平成30年度 春期' },
];

// 科目B(旧午後)の分野と問題番号。問1 情報セキュリティは必須、問2〜問11の10分野から4問を選ぶ(CBTでも形式は同じ)。
// part は、その分野の土台になる科目Aのパート(選ぶときの目安に正答率を表示する)
AP.pmFields = [
  { id: 'sec', no: 1, name: '情報セキュリティ', part: 'security', required: true },
  { id: 'st', no: 2, name: '経営戦略', part: 'strategy', hint: '文章とマーケティング・財務の計算' },
  { id: 'algo', no: 3, name: 'プログラミング', part: 'basics', hint: '擬似言語のアルゴリズムを追う' },
  { id: 'arch', no: 4, name: 'システムアーキテクチャ', part: 'computer', hint: '稼働率・性能の計算、クラウド' },
  { id: 'nw', no: 5, name: 'ネットワーク', part: 'network', hint: 'IPアドレス・プロトコル・構成' },
  { id: 'db', no: 6, name: 'データベース', part: 'database', hint: 'E-R図・SQL・正規化' },
  { id: 'emb', no: 7, name: '組込みシステム開発', part: 'computer', hint: 'タスク・センサ・状態遷移' },
  { id: 'dev', no: 8, name: '情報システム開発', part: 'dev', hint: 'UML・テスト設計・開発手法' },
  { id: 'pm', no: 9, name: 'プロジェクトマネジメント', part: 'management', hint: '文章読解・スケジュール・EVM' },
  { id: 'sm', no: 10, name: 'サービスマネジメント', part: 'management', hint: '文章読解・SLA・インシデント' },
  { id: 'audit', no: 11, name: 'システム監査', part: 'management', hint: '文章読解・監査手続・統制' },
];
