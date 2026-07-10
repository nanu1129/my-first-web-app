// 図解データ(後半: セキュリティ〜ストラテジ)
(() => {
  const { C, svg, txt, box, arrow } = ArtKit;

  const key = (x, y, label, gold) => {
    const col = gold ? C.gold : C.acc, fill = gold ? C.goldSoft : C.accSoft;
    return `<circle cx="${x}" cy="${y}" r="9" fill="${fill}" stroke="${col}" stroke-width="2"/>
      <path d="M${x + 8},${y} h14 m-6,0 v7 m6,-7 v5" stroke="${col}" stroke-width="2.5" fill="none"/>` +
      txt(x + 14, y + 22, label, { fs: 10.5, col, w: 700 });
  };

  // ---- 公開鍵暗号(アニメ) ----
  {
    function frame(step) {
      let s = box(50, 45, 130, 46, 'A(送信者)', { fs: 13 }) + box(380, 45, 130, 46, 'B(受信者)', { fs: 13 });
      if (step === 0) {
        s += key(400, 125, 'Bの公開鍵', false) + key(470, 125, 'Bの秘密鍵', true);
        s += arrow(392, 122, 205, 122, { col: C.acc, dash: true, label: '公開鍵は誰に渡してもよい(公開)', dy: -12, lfs: 11 });
        s += txt(475, 168, '秘密鍵は絶対に渡さない', { fs: 11, col: C.gold, w: 700 });
      }
      if (step === 1) {
        s += box(70, 115, 90, 40, '平文', { fs: 12 });
        s += arrow(165, 135, 215, 135, { col: C.acc, label: 'Bの公開鍵で暗号化', dy: -12, lfs: 10.5 });
        s += box(225, 115, 100, 40, '暗号文', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12 });
        s += arrow(330, 135, 420, 135, { col: C.ink3, label: '送信(盗聴されても読めない)', dy: 26, lfs: 10.5 });
      }
      if (step === 2) {
        s += box(225, 115, 100, 40, '暗号文', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12 });
        s += arrow(330, 135, 385, 135, { col: C.gold, label: 'Bの秘密鍵で復号', dy: 30, lfs: 10.5 });
        s += box(395, 115, 90, 40, '平文', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 12 });
        s += txt(280, 185, '復号できるのは秘密鍵を持つB本人だけ = 機密性の確保', { fs: 12, col: C.ok, w: 700 });
      }
      return svg(210, s);
    }
    AP.art['pubkey'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: 受信者Bが鍵ペアを作り、公開鍵だけを世界に公開する。' },
        { svg: frame(1), cap: 'ステップ2: 送信者Aは「Bの公開鍵」で暗号化して送る。途中で盗聴されても復号できない。' },
        { svg: frame(2), cap: 'ステップ3: Bだけが持つ「Bの秘密鍵」で復号。暗号化=受信者の公開鍵、復号=受信者の秘密鍵。' },
      ],
    };
  }

  // ---- ディジタル署名(アニメ) ----
  {
    function frame(step) {
      let s = box(50, 40, 130, 42, 'A(送信者)', { fs: 13 }) + box(380, 40, 130, 42, 'B(受信者)', { fs: 13 });
      if (step === 0) {
        s += box(60, 110, 90, 38, '文書', { fs: 12 });
        s += arrow(155, 129, 200, 129, { col: C.ink3, label: 'ハッシュ化', dy: -12, lfs: 10.5 });
        s += box(205, 112, 84, 34, 'ハッシュ値', { fill: C.s2, stroke: 'none', fs: 11.5, col: C.ink2 });
        s += arrow(294, 129, 340, 129, { col: C.gold, label: 'Aの秘密鍵で暗号化', dy: -12, lfs: 10 });
        s += box(345, 112, 84, 34, '署名', { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 12 });
      }
      if (step === 1) {
        s += box(150, 108, 90, 40, '文書', { fs: 12 });
        s += box(250, 108, 84, 40, '署名', { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 12 });
        s += arrow(340, 128, 420, 128, { col: C.ink3, label: 'セットで送信', dy: -12, lfs: 11 });
      }
      if (step === 2) {
        s += box(60, 105, 84, 34, '文書', { fs: 11.5 });
        s += arrow(148, 122, 185, 122, { col: C.ink3 });
        s += box(190, 105, 90, 34, 'ハッシュ値', { fill: C.s2, stroke: 'none', fs: 11, col: C.ink2 });
        s += box(60, 155, 84, 34, '署名', { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 11.5 });
        s += arrow(148, 172, 185, 172, { col: C.acc, label: 'Aの公開鍵で復号', dy: 14, lfs: 10 });
        s += box(190, 155, 90, 34, 'ハッシュ値', { fill: C.s2, stroke: 'none', fs: 11, col: C.ink2 });
        s += `<path d="M285,122 h30 v50 h-30" fill="none" stroke="${C.ok}" stroke-width="2"/>`;
        s += box(325, 128, 130, 38, '一致 → 改ざんなし\n作成者はA本人', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 11 });
      }
      return svg(210, s);
    }
    AP.art['signature'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: 文書のハッシュ値を「Aの秘密鍵」で暗号化したものが署名。秘密鍵はAしか持っていない。' },
        { svg: frame(1), cap: 'ステップ2: 文書と署名をセットで送信する(文書自体は暗号化されない点に注意)。' },
        { svg: frame(2), cap: 'ステップ3: Bは「Aの公開鍵」で署名を復号し、自分で計算したハッシュ値と照合。一致すれば改ざんなし+A本人と確認できる。' },
      ],
    };
  }

  // ---- DMZ(静止画) ----
  {
    let s = box(30, 60, 110, 60, 'インターネット', { fill: C.s2, stroke: 'none', fs: 12, col: C.ink2 });
    s += box(165, 55, 34, 70, 'F\nW', { fill: C.ng, stroke: 'none', col: '#fff', fs: 13 });
    s += box(225, 40, 140, 100, '', { fill: C.goldSoft, stroke: C.gold, dash: true });
    s += txt(295, 56, 'DMZ', { fs: 12, w: 900, col: C.gold });
    s += box(245, 72, 100, 52, 'Webサーバ\nメールサーバ', { fs: 11, col: C.ink });
    s += box(390, 55, 34, 70, 'F\nW', { fill: C.ng, stroke: 'none', col: '#fff', fs: 13 });
    s += box(450, 40, 90, 100, '社内LAN\n(内部NW)', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12 });
    s += arrow(142, 90, 163, 90, { col: C.ink3 }) + arrow(201, 90, 223, 90, { col: C.ink3 });
    s += arrow(367, 90, 388, 90, { col: C.ink3 }) + arrow(426, 90, 448, 90, { col: C.ink3 });
    s += txt(280, 165, '公開サーバはDMZに設置。侵入されても2つ目のFWが内部LANを守る', { fs: 12, col: C.ink2, w: 700 });
    AP.art['dmz'] = {
      frames: [{ svg: svg(185, s), cap: 'DMZ(非武装地帯): 外部公開サーバを内部ネットワークから分離する区域。' }],
    };
  }

  // ---- 境界値分析(静止画) ----
  {
    let s = txt(280, 22, '仕様:「0以上100以下を受け付ける」', { fs: 13, w: 900, col: C.ink });
    s += `<line x1="40" y1="90" x2="520" y2="90" stroke="${C.line}" stroke-width="2"/>`;
    s += `<rect x="140" y="78" width="280" height="24" rx="6" fill="${C.okSoft}"/>`;
    s += txt(280, 90, '有効(0〜100)', { fs: 11.5, col: C.ok, w: 700 });
    s += txt(85, 90, '無効', { fs: 11.5, col: C.ng, w: 700 }) + txt(475, 90, '無効', { fs: 11.5, col: C.ng, w: 700 });
    [['−1', 118, C.ng], ['0', 148, C.ok], ['100', 412, C.ok], ['101', 442, C.ng]].forEach(([v, x, col]) => {
      s += `<circle cx="${x}" cy="90" r="7" fill="${col}"/>` + txt(x, 122, v, { fs: 13, w: 900, col });
    });
    s += txt(280, 152, '境界のすぐ内側と外側(−1, 0, 100, 101)を選ぶ = バグは境界に潜みやすい', { fs: 12, col: C.ink2, w: 700 });
    AP.art['boundary'] = {
      frames: [{ svg: svg(175, s), cap: '境界値分析: 仕様の境界の両側をテストデータに選ぶ技法。' }],
    };
  }

  // ---- V字モデル(静止画) ----
  {
    const L = [['要件定義', 40, 35], ['外部設計', 105, 80], ['内部設計', 170, 125], ['プログラミング', 240, 170]];
    const R = [['受入れテスト', 420, 35], ['システムテスト', 355, 80], ['結合テスト', 290, 125]];
    let s = '';
    L.forEach(([n, x, y]) => { s += box(x, y, 105, 34, n, { fs: 11.5 }); });
    R.forEach(([n, x, y]) => { s += box(x, y, 105, 34, n, { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 11.5 }); });
    // 対応の点線
    s += arrow(148, 52, 418, 52, { col: C.ink3, dash: true, label: '検証', dy: -10, lfs: 10.5 });
    s += arrow(213, 97, 353, 97, { col: C.ink3, dash: true });
    s += arrow(278, 142, 288, 142, { col: C.ink3, dash: true });
    AP.art['vmodel'] = {
      frames: [{ svg: svg(225, s), cap: 'V字モデル: 設計工程とテスト工程が対応する。要件定義⇔受入れ、外部設計⇔システム、内部設計⇔結合。' }],
    };
  }

  // ---- スクラムのサイクル(静止画) ----
  {
    let s = `<ellipse cx="280" cy="115" rx="185" ry="75" fill="none" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 5"/>`;
    s += box(210, 20, 140, 32, 'スプリント計画', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12 });
    s += box(420, 95, 130, 44, 'スプリント\n(1〜4週間の開発)', { fs: 11 });
    s += box(210, 175, 140, 32, 'スプリントレビュー', { fs: 12 });
    s += box(15, 95, 130, 44, 'レトロスペクティブ\n(ふりかえり)', { fs: 11 });
    s += txt(280, 105, '毎日15分の', { fs: 11, col: C.ink3, w: 700 });
    s += txt(280, 122, 'デイリースクラム', { fs: 12, col: C.ink, w: 900 });
    s += arrow(360, 40, 445, 88, { col: C.acc });
    s += arrow(470, 145, 360, 188, { col: C.acc });
    s += arrow(205, 188, 95, 145, { col: C.acc });
    s += arrow(95, 90, 200, 45, { col: C.acc, label: '次のスプリントへ', dx: -20, dy: -14, lfs: 10.5 });
    AP.art['scrum'] = {
      frames: [{ svg: svg(230, s), cap: 'スクラム: スプリントを繰り返し、動くソフトウェアを頻繁にリリースする。' }],
    };
  }

  // ---- クリティカルパス(静止画) ----
  {
    const node = (x, y, n, hot) => box(x, y, 74, 34, n, hot
      ? { fill: C.ngSoft, stroke: C.ng, col: C.ng, fs: 12 } : { fs: 12 });
    let s = node(20, 88, '開始', true);
    s += node(180, 30, 'A(3日)', false) + node(340, 30, 'B(2日)', false);
    s += node(180, 145, 'C(4日)', true) + node(340, 145, 'D(4日)', true);
    s += node(480, 88, '終了', true);
    s += arrow(96, 96, 178, 52, { col: C.ink3 });
    s += arrow(256, 47, 338, 47, { col: C.ink3 });
    s += arrow(416, 42, 490, 82, { col: C.ink3, label: '上の経路: 3+2 = 5日', dx: -70, dy: -18, lfs: 10.5 });
    s += arrow(96, 112, 178, 158, { col: C.ng, sw: 3 });
    s += arrow(256, 162, 338, 162, { col: C.ng, sw: 3 });
    s += arrow(416, 168, 490, 128, { col: C.ng, sw: 3, label: '下の経路: 4+4 = 8日', dx: -70, dy: 20, lfs: 10.5 });
    s += txt(280, 212, 'クリティカルパス = C→D(最長8日)。この経路の遅れ=プロジェクト全体の遅れ', { fs: 12, col: C.ng, w: 700 });
    AP.art['critical-path'] = {
      frames: [{ svg: svg(232, s), cap: '全体の所要日数は最長経路(クリティカルパス)で決まる。余裕ゼロの経路。' }],
    };
  }

  // ---- RTO / RPO(静止画) ----
  {
    let s = `<line x1="40" y1="90" x2="520" y2="90" stroke="${C.line}" stroke-width="2"/>`;
    [['バックアップ取得', 110, C.acc], ['障害発生!', 280, C.ng], ['復旧完了', 450, C.ok]].forEach(([n, x, col]) => {
      s += `<circle cx="${x}" cy="90" r="8" fill="${col}"/>` + txt(x, 62, n, { fs: 12, w: 900, col });
    });
    s += arrow(272, 125, 118, 125, { col: C.acc, sw: 2 });
    s += arrow(118, 125, 272, 125, { col: C.acc, sw: 2, label: 'RPO: どの時点のデータまで戻すか', dy: 20, lfs: 11 });
    s += arrow(288, 155, 442, 155, { col: C.ok, sw: 2, label: 'RTO: どれだけの時間で復旧するか', dy: 20, lfs: 11 });
    s += arrow(442, 155, 288, 155, { col: C.ok, sw: 2 });
    AP.art['rto-rpo'] = {
      frames: [{ svg: svg(200, s), cap: 'RPO=復旧するデータの時点の目標(失ってよいデータの範囲)、RTO=復旧までの時間の目標。' }],
    };
  }

  // ---- PPM(静止画) ----
  {
    const q = (x, y, name, sub, fill, col) =>
      box(x, y, 190, 74, '', { fill, stroke: 'none', r: 10 }) +
      txt(x + 95, y + 28, name, { fs: 14, w: 900, col }) +
      txt(x + 95, y + 50, sub, { fs: 10.5, col });
    let s = q(115, 35, '花形', '成長率高×シェア高: 継続投資', C.accSoft, C.acc);
    s += q(315, 35, '問題児', '成長率高×シェア低: 投資判断', C.ngSoft, C.ng);
    s += q(115, 119, '金のなる木', '成長率低×シェア高: 資金源', C.goldSoft, C.gold);
    s += q(315, 119, '負け犬', '成長率低×シェア低: 撤退検討', C.s2, C.ink3);
    s += arrow(75, 190, 75, 40, { col: C.ink3 }) + txt(58, 115, '市場成長率', { fs: 11, col: C.ink3, w: 700 });
    s += arrow(510, 215, 120, 215, { col: C.ink3 }) + txt(305, 232, '市場占有率(シェア) ← 高いほど左', { fs: 11, col: C.ink3, w: 700 });
    AP.art['ppm'] = {
      frames: [{ svg: svg(245, s), cap: 'PPM: 「金のなる木」で稼いだ資金を「問題児」に投資して「花形」に育てるのが定石。' }],
    };
  }

  // ---- 損益分岐点(静止画) ----
  {
    // 座標系: x=40..520, y=190(0円)..30
    let s = `<line x1="60" y1="190" x2="520" y2="190" stroke="${C.line}" stroke-width="2"/>
             <line x1="60" y1="190" x2="60" y2="30" stroke="${C.line}" stroke-width="2"/>`;
    s += txt(290, 208, '売上高 →', { fs: 11, col: C.ink3, w: 700 });
    s += txt(44, 110, '金額', { fs: 11, col: C.ink3, w: 700 });
    // 固定費(水平線 y=150)・総費用(150→90)・売上(190→40)
    s += `<line x1="60" y1="150" x2="500" y2="150" stroke="${C.ink3}" stroke-width="2" stroke-dasharray="5 4"/>`;
    s += txt(462, 138, '固定費', { fs: 11, col: C.ink3, w: 700 });
    s += `<line x1="60" y1="150" x2="500" y2="82" stroke="${C.gold}" stroke-width="2.5"/>`;
    s += txt(462, 70, '総費用(固定費+変動費)', { fs: 11, col: C.gold, w: 700 });
    s += `<line x1="60" y1="190" x2="500" y2="36" stroke="${C.acc}" stroke-width="2.5"/>`;
    s += txt(500, 24, '売上高', { fs: 11, col: C.acc, w: 700 });
    // 交点: 売上線 y=190-(x-60)*154/440, 費用線 y=150-(x-60)*68/440 → 交点 x≈408, y≈96 概算
    // 実際: 190-154t = 150-68t → 40 = 86t → t=0.465 → x=60+440*0.465≈265, y≈118
    s += `<circle cx="265" cy="118" r="7" fill="${C.ng}"/>`;
    s += `<line x1="265" y1="118" x2="265" y2="190" stroke="${C.ng}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    s += txt(265, 100, '損益分岐点(利益ゼロ)', { fs: 11.5, col: C.ng, w: 900 });
    s += txt(190, 165, '損失', { fs: 12, col: C.ng, w: 700 });
    s += txt(400, 60, '利益', { fs: 12, col: C.ok, w: 700 });
    AP.art['breakeven'] = {
      frames: [{ svg: svg(225, s), cap: '売上線と総費用線の交点が損益分岐点。右側(売上が大きい側)が利益。固定費÷(1−変動費率)で計算。' }],
    };
  }
})();
