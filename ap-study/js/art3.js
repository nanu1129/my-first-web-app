// 図解データ(追加分: 各パートの未カバーだったユニット向け)
(() => {
  const { C, svg, txt, box, arrow } = ArtKit;

  // ---- デュアルとデュプレックス(静止画) ----
  {
    let s = txt(150, 22, 'デュアルシステム', { fs: 13, w: 900, col: C.ink });
    s += box(45, 40, 95, 40, '系1', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12.5 });
    s += box(160, 40, 95, 40, '系2', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12.5 });
    s += box(80, 108, 140, 32, '結果を照合', { fs: 11.5 });
    s += arrow(92, 84, 125, 105, { col: C.ink3 }) + arrow(207, 84, 175, 105, { col: C.ink3 });
    s += txt(150, 160, '2系統が同じ処理を実行し', { fs: 11, col: C.ink2, w: 700 });
    s += txt(150, 176, '結果を突き合わせる(超高信頼)', { fs: 11, col: C.ink2, w: 700 });

    s += txt(425, 22, 'デュプレックスシステム', { fs: 13, w: 900, col: C.ink });
    s += box(320, 40, 95, 40, '現用系\n(本番)', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 11 });
    s += box(435, 40, 95, 40, '待機系', { fill: C.surf, stroke: C.line, col: C.ink2, fs: 12.5, dash: true });
    s += arrow(418, 60, 432, 60, { col: C.ng, label: '障害時に切替', dy: -14, lfs: 10.5 });
    s += txt(425, 160, '普段は現用系だけが本番処理。', { fs: 11, col: C.ink2, w: 700 });
    s += txt(425, 176, '待機系を温めておくのがホットスタンバイ', { fs: 11, col: C.ink2, w: 700 });
    AP.art['duplex'] = {
      frames: [{ svg: svg(195, s), cap: 'デュアル=2系統で同時処理して照合 / デュプレックス=本番+控え。混同注意!' }],
    };
  }

  // ---- SELECT文の解剖図(静止画) ----
  {
    const parts = [
      ['SELECT 氏名, 部署', '何の列がほしい?', C.acc, 60],
      ['FROM 社員', 'どの表から?', C.gold, 200],
      ['WHERE 部署 = \'営業\'', 'どんな条件の行?', C.ok, 300],
    ];
    let s = '';
    let x = 40;
    parts.forEach(([code, label, col]) => {
      const w = code.length * 9.5 + 24;
      s += box(x, 60, w, 42, code, { fill: C.s2, stroke: 'none', fs: 13, col: C.ink });
      s += `<line x1="${x + w / 2}" y1="106" x2="${x + w / 2}" y2="128" stroke="${col}" stroke-width="2"/>`;
      s += txt(x + w / 2, 142, label, { fs: 11.5, col, w: 900 });
      x += w + 14;
    });
    s += txt(280, 30, 'SQLは「データベースへの注文書」', { fs: 13.5, w: 900, col: C.ink });
    s += txt(280, 180, '読む順番のコツ: FROM(表)→ WHERE(行を絞る)→ SELECT(列を選ぶ)', { fs: 12, col: C.ink2, w: 700 });
    AP.art['sql-anatomy'] = {
      frames: [{ svg: svg(200, s), cap: '「社員表から、部署が営業の人の、氏名と部署をください」をSQLで書くとこうなる。' }],
    };
  }

  // ---- DNSの名前解決(アニメ) ----
  {
    function frame(step) {
      let s = box(30, 70, 100, 46, 'あなたの\nPC', { fs: 11.5 });
      s += box(215, 70, 130, 46, 'キャッシュ\nDNSサーバ', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 11.5 });
      s += box(430, 20, 110, 40, 'ルート\nサーバ', { fs: 11 });
      s += box(430, 120, 110, 40, '権威DNS\n(example.jp担当)', { fs: 10 });
      if (step >= 0) s += arrow(134, 85, 211, 85, { col: step === 0 ? C.acc : C.ink3, label: '① example.jpのIPは?', dy: -12, lfs: 10.5 });
      if (step === 1) {
        s += arrow(340, 75, 428, 45, { col: C.acc, label: '② 知らないので順にたずねる', dx: -30, dy: -12, lfs: 10.5 });
        s += arrow(350, 100, 428, 133, { col: C.acc });
      }
      if (step >= 2) {
        s += arrow(428, 145, 350, 105, { col: C.ink3, label: '③ 203.0.113.5 だよ', dx: 55, dy: 16, lfs: 10.5 });
        s += arrow(211, 100, 134, 100, { col: C.ok, label: '④ 回答(しばらく記憶=キャッシュ)', dy: 18, lfs: 10.5 });
      }
      return svg(185, s);
    }
    AP.art['dns'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: PCが「電話帳係」のキャッシュDNSサーバに、ドメイン名のIPアドレスをたずねる。' },
        { svg: frame(1), cap: 'ステップ2: 知らなければ、ルートサーバから順に「その名前の担当」をたどって権威サーバに聞く。' },
        { svg: frame(2), cap: 'ステップ3: 答えのIPアドレスをPCへ返し、次に備えてしばらく記憶(キャッシュ)する。' },
      ],
    };
  }

  // ---- ディジタル証明書とPKI(静止画) ----
  {
    let s = box(215, 20, 130, 44, '認証局(CA)\n=身分証の発行所', { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 10.5 });
    s += box(40, 120, 130, 44, 'Webサーバ\n(証明したい人)', { fs: 11 });
    s += box(390, 120, 130, 44, 'ブラウザ\n(確認したい人)', { fs: 11 });
    s += arrow(115, 118, 225, 66, { col: C.ink3, label: '① 本人確認+申請', dx: -35, dy: 0, lfs: 10.5 });
    s += arrow(280, 68, 120, 118, { col: C.gold, label: '② 証明書を発行', dx: 55, dy: 8, lfs: 10.5 });
    s += arrow(174, 142, 386, 142, { col: C.acc, label: '③ 通信時に証明書を提示', dy: -12, lfs: 10.5 });
    s += arrow(400, 118, 340, 66, { col: C.ok, label: '④ CAの署名を検証', dx: 55, dy: -4, lfs: 10.5 });
    s += txt(280, 190, '「CAが保証しているから、この公開鍵は本物」と信頼できる仕組み = PKI', { fs: 12, col: C.ink2, w: 700 });
    AP.art['pki'] = {
      frames: [{ svg: svg(210, s), cap: 'ディジタル証明書は公開鍵の「身分証明書」。発行所(CA)の署名で本物と確認できる。' }],
    };
  }

  // ---- ウォーターフォールの階段(静止画) ----
  {
    const steps = ['要件定義', '外部設計', '内部設計', 'プログラミング', 'テスト'];
    let s = '';
    steps.forEach((n, i) => {
      s += box(30 + i * 102, 24 + i * 32, 96, 34, n, {
        fill: i === 0 ? C.accSoft : C.surf, stroke: i === 0 ? C.acc : C.line,
        col: i === 0 ? C.acc : C.ink, fs: 11.5,
      });
      if (i < steps.length - 1) {
        s += arrow(30 + i * 102 + 96, 41 + i * 32 + 14, 30 + (i + 1) * 102 + 20, 41 + (i + 1) * 32, { col: C.acc });
      }
    });
    s += arrow(330, 60, 230, 60, { col: C.ng, dash: true, label: '後戻りは原則NG(だから変更に弱い)', dy: -12, lfs: 10.5 });
    AP.art['waterfall'] = {
      frames: [{ svg: svg(215, s), cap: 'ウォーターフォール: 滝の水が上から下へ流れるように、工程を順番に進める。' }],
    };
  }

  // ---- WBSツリー(静止画) ----
  {
    let s = box(205, 20, 150, 34, '文化祭の模擬店', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12 });
    const kids = [['企画', 60], ['調理', 235], ['宣伝', 410]];
    kids.forEach(([n, x]) => {
      s += box(x, 84, 90, 30, n, { fs: 11.5 });
      s += `<line x1="280" y1="56" x2="${x + 45}" y2="82" stroke="${C.line}" stroke-width="2"/>`;
    });
    const leaves = [
      ['メニュー決め', 20], ['予算計画', 130], ['仕入れ', 245], ['当日の調理', 340, true], ['ポスター', 455],
    ];
    leaves.forEach(([n, x, hot]) => {
      s += box(x, 140, 100, 28, n, hot
        ? { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 10.5 }
        : { fill: C.s2, stroke: 'none', col: C.ink2, fs: 10.5 });
    });
    [[105, 70], [105, 180], [280, 295], [280, 390], [455, 505]].forEach(([px, cx]) => {
      s += `<line x1="${px}" y1="116" x2="${cx}" y2="138" stroke="${C.line}" stroke-width="2"/>`;
    });
    s += txt(280, 192, '大きな仕事を「担当を割り当てられる大きさ」まで分解する = WBS', { fs: 12, col: C.ink2, w: 700 });
    AP.art['wbs'] = {
      frames: [{ svg: svg(215, s), cap: 'WBS: 成果物と作業を階層的に分解。一番下の単位がワークパッケージ。' }],
    };
  }

  // ---- システム監査の流れ(静止画) ----
  {
    const steps = [['監査計画', C.surf], ['予備調査', C.surf], ['本調査\n(証拠集め)', C.accSoft], ['報告・勧告', C.surf], ['フォロー\nアップ', C.goldSoft]];
    let s = '';
    steps.forEach(([n, fill], i) => {
      const hot = fill !== C.surf;
      s += box(25 + i * 108, 45, 96, 46, n, {
        fill, fs: 10.5,
        stroke: fill === C.accSoft ? C.acc : fill === C.goldSoft ? C.gold : C.line,
        col: fill === C.accSoft ? C.acc : fill === C.goldSoft ? C.gold : C.ink,
      });
      if (i < steps.length - 1) s += arrow(121 + i * 108, 68, 133 + i * 108, 68, { col: C.ink3 });
    });
    s += txt(280, 120, '監査人は「独立した審判」: 意見は必ず証拠に基づき、改善の実施は現場(被監査部門)が行う', { fs: 11.5, col: C.ink2, w: 700 });
    AP.art['audit-flow'] = {
      frames: [{ svg: svg(145, s), cap: 'システム監査の流れ。最後のフォローアップ(改善されたかの確認)まで監査人の仕事。' }],
    };
  }

  // ---- 調達の流れ(静止画) ----
  {
    const steps = [['RFI\n情報ください', C.surf], ['RFP\n提案ください', C.accSoft], ['提案書の評価', C.surf], ['契約', C.okSoft]];
    let s = '';
    steps.forEach(([n, fill], i) => {
      s += box(35 + i * 130, 45, 115, 48, n, {
        fill, fs: 11,
        stroke: fill === C.accSoft ? C.acc : fill === C.okSoft ? C.ok : C.line,
        col: fill === C.accSoft ? C.acc : fill === C.okSoft ? C.ok : C.ink,
      });
      if (i < steps.length - 1) s += arrow(150 + i * 130, 69, 163 + i * 130, 69, { col: C.ink3 });
    });
    s += txt(280, 122, '「こんな家を建てたい」という要望書(RFP)を複数の会社に渡し、提案を比べて選ぶ', { fs: 11.5, col: C.ink2, w: 700 });
    AP.art['procurement'] = {
      frames: [{ svg: svg(148, s), cap: 'RFI(情報収集)→ RFP(提案依頼)→ 評価 → 契約。RFIが先、RFPが後。' }],
    };
  }

  // ---- 4P(静止画) ----
  {
    const q = [
      ['Product 製品', '何を売る?', 115, 30], ['Price 価格', 'いくらで売る?', 315, 30],
      ['Place 流通', 'どこで売る?', 115, 105], ['Promotion 販促', 'どう知らせる?', 315, 105],
    ];
    let s = '';
    q.forEach(([n, sub, x, y]) => {
      s += box(x, y, 190, 62, '', { fill: C.accSoft, stroke: 'none', r: 10 });
      s += txt(x + 95, y + 24, n, { fs: 13, w: 900, col: C.acc });
      s += txt(x + 95, y + 44, sub, { fs: 11, col: C.ink2 });
    });
    s += txt(280, 195, '売り手の4つの作戦をまとめて「マーケティングミックス(4P)」と呼ぶ', { fs: 11.5, col: C.ink2, w: 700 });
    AP.art['fourp'] = {
      frames: [{ svg: svg(215, s), cap: '新しいお菓子を売るなら: 味(Product)・値段(Price)・売る場所(Place)・CM(Promotion)。' }],
    };
  }
})();
