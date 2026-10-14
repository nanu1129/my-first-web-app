// Udemy「参考書の著者が教える 応用情報技術者試験 科目A講座」(全24セクション・51時間45分)と、このサイトのユニットの対応。
// 対応はセクション名から判断している(セクション13「応用数学」は確率・統計・待ち行列のユニットに対応させた)
AP.udemy = {
  title: '参考書の著者が教える 応用情報技術者試験 科目A講座',
  short: 'Udemy 科目A講座',
  length: '51時間45分',
  minsPerUnit: 50, // 講義(動画)+ 一問一答の目安(分)。全体の長さとセクション構成から見積もった値
  sections: [
    { no: 1, title: '必ずお読みください', kind: 'intro', units: [] },
    { no: 2, title: '情報システム開発', units: ['dev-1', 'dev-2', 'dev-3', 'dev-4'] },
    { no: 3, title: 'プロジェクトマネジメント', units: ['management-1'] },
    { no: 4, title: 'サービスマネジメント', units: ['management-2'] },
    { no: 5, title: 'システム監査', units: ['management-3'] },
    { no: 6, title: 'アルゴリズム', units: ['basics-3'] },
    { no: 7, title: '基礎理論', units: ['basics-1', 'basics-2', 'basics-5'] },
    { no: 8, title: 'コンピュータシステム', units: ['computer-1', 'computer-2', 'computer-3', 'computer-4', 'computer-5'] },
    { no: 9, title: 'データベース', units: ['database-1', 'database-2', 'database-3', 'database-4'] },
    { no: 10, title: 'ネットワーク', units: ['network-1', 'network-2', 'network-3', 'network-4'] },
    { no: 11, title: '情報セキュリティ', units: ['security-1', 'security-2', 'security-3', 'security-4'] },
    { no: 12, title: 'ストラテジ', units: ['strategy-1', 'strategy-2', 'strategy-3', 'strategy-4', 'strategy-5'] },
    { no: 13, title: '応用数学', units: ['basics-4'] },
    { no: 14, title: '令和7年秋 午前の過去問解説', kind: 'past', exam: '令和7年秋' },
    { no: 15, title: '令和7年春 午前の過去問解説', kind: 'past', exam: '令和7年春' },
    { no: 16, title: '令和6年秋 午前の過去問解説', kind: 'past', exam: '令和6年秋' },
    { no: 17, title: '令和6年春 午前の過去問解説', kind: 'past', exam: '令和6年春' },
    { no: 18, title: '令和5年秋 午前の過去問解説', kind: 'past', exam: '令和5年秋' },
    { no: 19, title: '令和5年春 午前の過去問解説', kind: 'past', exam: '令和5年春' },
    { no: 20, title: '令和4年秋 午前の過去問解説', kind: 'past', exam: '令和4年秋' },
    { no: 21, title: '令和4年春 午前の過去問解説', kind: 'past', exam: '令和4年春' },
    { no: 22, title: '令和3年秋 午前の過去問解説', kind: 'past', exam: '令和3年秋' },
    { no: 23, title: '令和3年春 午前の過去問解説', kind: 'past', exam: '令和3年春' },
    { no: 24, title: '付録: 午後問題対策用 小問題', kind: 'pm', units: [] },
  ],
};
