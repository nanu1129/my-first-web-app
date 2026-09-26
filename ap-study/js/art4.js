// 図解データ(追加分: 後から追加したユニットと、教材に補った論点向け)
(() => {
  const { C, svg, txt, box, arrow } = ArtKit;
  const circle = (cx, cy, r, fill, stroke) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="1.5"/>`;
  const line = (x1, y1, x2, y2, col, o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || C.line}" stroke-width="${o.sw || 2}" ${o.dash ? 'stroke-dasharray="5 4"' : ''}/>`;

  // ---- 2分木の走査(アニメ) ----
  {
    const N = {
      50: [280, 40], 30: [160, 105], 70: [400, 105], 20: [100, 170], 40: [220, 170], 60: [340, 170], 80: [460, 170],
    };
    const edges = [[50, 30], [50, 70], [30, 20], [30, 40], [70, 60], [70, 80]];
    function frame(order, label) {
      let s = edges.map(([a, b]) => line(N[a][0], N[a][1], N[b][0], N[b][1], C.line)).join('');
      Object.entries(N).forEach(([v, [x, y]]) => {
        s += circle(x, y, 20, C.surf, C.acc) + txt(x, y, v, { fs: 13, w: 700, col: C.ink });
        const k = order.indexOf(Number(v)) + 1;
        s += circle(x + 20, y - 18, 10, C.gold) + txt(x + 20, y - 18, k, { fs: 11, w: 700, col: '#fff' });
      });
      s += txt(280, 222, `${label}: ${order.join(' → ')}`, { fs: 13, w: 700, col: C.acc });
      return svg(245, s);
    }
    AP.art['tree-walk'] = {
      frames: [
        { svg: frame([50, 30, 20, 40, 70, 60, 80], '先行順'), cap: '先行順(前順): 根 → 左 → 右。根を最初に訪れる。数字は訪れる順番。' },
        { svg: frame([20, 30, 40, 50, 60, 70, 80], '中間順'), cap: '中間順(間順): 左 → 根 → 右。2分探索木をこの順でたどると、小さい順(昇順)に並ぶ!' },
        { svg: frame([20, 40, 30, 60, 80, 70, 50], '後行順'), cap: '後行順(後順): 左 → 右 → 根。根は最後。式を表す木をこの順でたどると逆ポーランド記法になる。' },
      ],
    };
  }

  // ---- 機械学習の3分類 ----
  {
    let s = '';
    const panel = (x, title) => box(x, 8, 172, 168, '', { fill: C.s2, stroke: 'none', r: 10 }) + txt(x + 86, 28, title, { fs: 13, w: 700, col: C.ink });
    // 教師あり
    s += panel(8, '教師あり学習');
    [[40, 130], [58, 110], [72, 140], [50, 150]].forEach(([x, y]) => { s += circle(x, y, 7, C.accSoft, C.acc); });
    [[120, 70], [140, 90], [130, 55], [150, 66]].forEach(([x, y]) => { s += txt(x, y, '×', { fs: 17, w: 700, col: C.ng }); });
    s += line(30, 60, 160, 150, C.ink3, { dash: true, sw: 1.5 });
    s += txt(94, 190, '正解付きデータ → 分類・回帰', { fs: 11, w: 700, col: C.ink2 });
    // 教師なし
    s += panel(194, '教師なし学習');
    s += `<ellipse cx="240" cy="120" rx="34" ry="30" fill="none" stroke="${C.acc}" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    s += `<ellipse cx="322" cy="78" rx="32" ry="28" fill="none" stroke="${C.gold}" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    [[228, 110], [248, 128], [236, 136], [255, 108], [222, 124]].forEach(([x, y]) => { s += circle(x, y, 6, C.ink3); });
    [[312, 70], [330, 86], [322, 62], [338, 72], [310, 88]].forEach(([x, y]) => { s += circle(x, y, 6, C.ink3); });
    s += txt(280, 190, 'ラベルなし → グループ分け', { fs: 11, w: 700, col: C.ink2 });
    // 強化学習
    s += panel(380, '強化学習');
    s += box(416, 44, 100, 34, 'エージェント', { fs: 11.5 });
    s += box(416, 124, 100, 34, '環境', { fs: 11.5 });
    s += arrow(440, 80, 440, 121, { col: C.acc, label: '行動', dx: -20, dy: 0, lfs: 10.5 });
    s += arrow(492, 121, 492, 80, { col: C.ok, label: '報酬', dx: 22, dy: 0, lfs: 10.5 });
    s += txt(466, 190, '報酬が最大になる行動を学ぶ', { fs: 11, w: 700, col: C.ink2 });
    AP.art['ml-types'] = {
      frames: [{ svg: svg(205, s), cap: '学習のさせ方で3つに分かれる。「正解があるか」「報酬で学ぶか」で見分けよう。' }],
    };
  }

  // ---- クラウドの管理範囲(IaaS/PaaS/SaaS) ----
  {
    const cols = ['オンプレミス', 'IaaS', 'PaaS', 'SaaS'];
    const rows = ['アプリケーション', 'ミドルウェア', 'OS', 'ハードウェア'];
    const user = [[1, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]]; // [列][行]
    let s = '';
    rows.forEach((r, ri) => { s += txt(98, 58 + ri * 38, r, { a: 'end', fs: 10.5, w: 700, col: C.ink2 }); });
    cols.forEach((c, ci) => {
      const x = 110 + ci * 112;
      s += txt(x + 50, 22, c, { fs: 12.5, w: 700, col: C.ink });
      rows.forEach((_, ri) => {
        const mine = user[ci][ri];
        s += box(x, 40 + ri * 38, 100, 32, mine ? '利用者' : '事業者', {
          fill: mine ? C.accSoft : C.s2, stroke: mine ? C.acc : 'none', col: mine ? C.acc : C.ink3, fs: 11,
        });
      });
    });
    s += txt(280, 208, '右に行くほど事業者に任せる範囲が広がり、利用者の管理は楽になる(自由度は下がる)', { fs: 11, w: 700, col: C.ink2 });
    AP.art['cloud-stack'] = {
      frames: [{ svg: svg(222, s), cap: 'IaaSはOSから上、PaaSはアプリだけを利用者が管理。SaaSはできあがったアプリを使うだけ。' }],
    };
  }

  // ---- E-R図: 多対多を連関エンティティで分解(アニメ) ----
  {
    const f1 = () => {
      let s = box(50, 60, 120, 46, '学生') + box(390, 60, 120, 46, '講義');
      s += line(170, 83, 390, 83, C.ink3);
      s += txt(186, 70, '*', { fs: 16, w: 700, col: C.acc }) + txt(374, 70, '*', { fs: 16, w: 700, col: C.acc });
      s += txt(280, 70, '多対多', { fs: 12, w: 700, col: C.ng });
      s += txt(280, 140, '1人の学生は複数の講義を、1つの講義は複数の学生が受ける', { fs: 11.5, col: C.ink2 });
      s += txt(280, 162, '→ このままでは表(外部キー)で表現できない', { fs: 12, w: 700, col: C.ng });
      return svg(185, s);
    };
    const f2 = () => {
      let s = box(16, 60, 110, 46, '学生') + box(225, 60, 110, 46, '受講', { fill: C.accSoft, stroke: C.acc, col: C.acc })
        + box(434, 60, 110, 46, '講義');
      s += line(126, 83, 225, 83, C.ink3) + line(335, 83, 434, 83, C.ink3);
      s += txt(138, 70, '1', { fs: 13, w: 700, col: C.acc }) + txt(213, 70, '*', { fs: 16, w: 700, col: C.acc });
      s += txt(347, 70, '*', { fs: 16, w: 700, col: C.acc }) + txt(422, 70, '1', { fs: 13, w: 700, col: C.acc });
      s += txt(280, 124, '主キー: 学生番号 + 講義コード', { fs: 11.5, w: 700, col: C.acc });
      s += txt(280, 158, '連関エンティティ「受講」を挟み、1対多 × 2 に分解できた', { fs: 12, w: 700, col: C.ok });
      return svg(185, s);
    };
    AP.art['er-many'] = {
      frames: [
        { svg: f1(), cap: 'ステップ1: 学生と講義は「多対多」の関係。' },
        { svg: f2(), cap: 'ステップ2: 間に「受講」を置くと、学生1:受講多、講義1:受講多 の2つの1対多になる。' },
      ],
    };
  }

  // ---- VLAN(アニメ) ----
  {
    const xs = [16, 80, 144, 208, 296, 360, 424, 488];
    function frame(step) {
      let s = '';
      xs.forEach((x, i) => {
        const v10 = i < 4;
        const lit = step === 0 && v10;
        s += line(x + 28, 58, x + 28, 110, lit ? C.acc : C.line, { sw: lit ? 3 : 2, dash: !v10 && step === 0 });
        s += box(x, 20, 56, 38, v10 ? `営業${i + 1}` : `開発${i - 3}`, {
          fill: v10 ? C.accSoft : C.goldSoft, stroke: v10 ? C.acc : C.gold, col: v10 ? C.acc : C.gold, fs: 11,
        });
      });
      s += box(16, 110, 528, 38, 'L2スイッチ(VLAN10: 営業 / VLAN20: 開発)', { fs: 12 });
      if (step === 0) {
        s += txt(44, 8, 'ブロードキャスト送信', { fs: 10.5, w: 700, col: C.acc, a: 'start' });
        s += txt(280, 172, '同じVLAN10の端末にだけ届き、VLAN20には届かない', { fs: 12, w: 700, col: C.acc });
      } else {
        s += box(200, 180, 160, 34, 'L3スイッチ / ルータ', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 12 });
        s += arrow(230, 150, 230, 178, { col: C.acc }) + arrow(330, 178, 330, 150, { col: C.gold });
        s += txt(280, 232, 'VLAN間の通信は、ネットワーク層の機器で中継する', { fs: 12, w: 700, col: C.ok });
      }
      return svg(step === 0 ? 197 : 257, `<g transform="translate(0,12)">${s}</g>`);
    }
    AP.art['vlan'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: 1台のスイッチを設定だけで2つのLANに分割。ブロードキャストは同じVLANの中だけに届く。' },
        { svg: frame(1), cap: 'ステップ2: 別のVLANと通信したいときは、L3スイッチやルータを経由する。' },
      ],
    };
  }

  // ---- リスクアセスメントと対応 ----
  {
    const steps = [['リスク特定', '資産・脅威・脆弱性\nを洗い出す'], ['リスク分析', '発生確率と影響度\nを見積もる'], ['リスク評価', '優先順位を\n決める'], ['リスク対応', '対策を選んで\n実行する']];
    let s = `<path d="M 12 22 L 12 14 L 408 14 L 408 22" fill="none" stroke="${C.acc}" stroke-width="1.5"/>`;
    s += txt(210, 6, 'リスクアセスメント', { fs: 11, w: 700, col: C.acc });
    steps.forEach(([t, d], i) => {
      const x = 10 + i * 140;
      s += box(x, 30, 120, 34, t, i === 3 ? { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 12.5 } : { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12.5 });
      d.split('\n').forEach((ln, k) => { s += txt(x + 60, 78 + k * 15, ln, { fs: 10.5, col: C.ink2 }); });
      if (i < 3) s += arrow(x + 122, 47, x + 138, 47, { col: C.ink3 });
    });
    const acts = [['回避', 'やめる'], ['低減', '確率・影響を下げる'], ['移転', '保険・外部委託'], ['保有', 'そのまま受け入れる']];
    s += line(490, 110, 490, 124, C.gold) + line(70, 124, 490, 124, C.gold);
    acts.forEach(([t, d], i) => {
      const x = 10 + i * 140;
      s += line(x + 60, 124, x + 60, 134, C.gold);
      s += box(x, 134, 120, 46, `${t}\n${d}`, { fs: 11 });
    });
    AP.art['risk-flow'] = {
      frames: [{ svg: svg(190, s), cap: '特定 → 分析 → 評価 までがリスクアセスメント。そのうえで4つの対応から選ぶ。' }],
    };
  }

  // ---- 結合度と凝集度 ----
  {
    let s = txt(10, 16, '結合度(モジュール間のつながり) … 弱いほど良い', { a: 'start', fs: 12, w: 700, col: C.ink });
    ['データ', 'スタンプ', '制御', '外部', '共通', '内容'].forEach((t, i) => {
      s += box(10 + i * 91, 28, 84, 32, `${t}結合`, i === 0 ? { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 11 } : (i === 5 ? { fill: C.ngSoft, stroke: C.ng, col: C.ng, fs: 11 } : { fs: 11 }));
    });
    s += txt(10, 74, '← 弱い(良い)', { a: 'start', fs: 10.5, w: 700, col: C.ok }) + txt(550, 74, '強い(悪い) →', { a: 'end', fs: 10.5, w: 700, col: C.ng });
    s += txt(10, 106, '凝集度=モジュール強度(モジュール内のまとまり) … 強いほど良い', { a: 'start', fs: 12, w: 700, col: C.ink });
    ['機能的', '情報的', '連絡的', '手順的', '時間的', '論理的', '暗合的'].forEach((t, i) => {
      s += box(10 + i * 78, 118, 72, 32, t, i === 0 ? { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 11 } : (i === 6 ? { fill: C.ngSoft, stroke: C.ng, col: C.ng, fs: 11 } : { fs: 11 }));
    });
    s += txt(10, 164, '← 強い(良い)', { a: 'start', fs: 10.5, w: 700, col: C.ok }) + txt(550, 164, '弱い(悪い) →', { a: 'end', fs: 10.5, w: 700, col: C.ng });
    AP.art['coupling'] = {
      frames: [{ svg: svg(178, s), cap: '目標は「結合度は弱く、凝集度は強く」。両端(データ結合・機能的強度)がいちばん良い。' }],
    };
  }

  // ---- 保守の4分類 ----
  {
    const cells = [
      ['是正保守', '起きたバグを直す', '例: 計算ミスの修正', C.ngSoft, C.ng],
      ['予防保守', '障害が起きる前に直す', '例: 潜在的な不具合の修正', C.goldSoft, C.gold],
      ['適応保守', '環境の変化に合わせる', '例: 税率変更・OS更新への対応', C.accSoft, C.acc],
      ['完全化保守', '性能や保守性を高める', '例: 処理の高速化・コード整理', C.okSoft, C.ok],
    ];
    let s = '';
    cells.forEach(([t, d, e, fill, col], i) => {
      const x = 10 + (i % 2) * 275, y = 10 + Math.floor(i / 2) * 88;
      s += box(x, y, 265, 80, '', { fill, stroke: 'none', r: 10 });
      s += txt(x + 132, y + 20, t, { fs: 14, w: 700, col });
      s += txt(x + 132, y + 44, d, { fs: 12, w: 700, col: C.ink });
      s += txt(x + 132, y + 63, e, { fs: 11, col: C.ink2 });
    });
    AP.art['maintenance'] = {
      frames: [{ svg: svg(188, s), cap: '上段は「不具合への対応(起きた後/起きる前)」、下段は「改良(環境への追従/品質向上)」。' }],
    };
  }

  // ---- BSCの4視点 ----
  {
    let s = '';
    s += line(280, 115, 280, 70, C.line) + line(280, 115, 280, 168, C.line) + line(280, 115, 160, 115, C.line) + line(280, 115, 400, 115, C.line);
    s += box(215, 90, 130, 50, 'ビジョン・戦略', { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 12.5 });
    s += box(195, 8, 170, 58, '財務の視点\n売上・利益率', { fs: 11.5 });
    s += box(400, 86, 150, 58, '顧客の視点\n満足度・リピート率', { fs: 11.5 });
    s += box(185, 168, 190, 58, '内部ビジネスプロセス\n納期・不良率', { fs: 11.5 });
    s += box(10, 86, 150, 58, '学習と成長の視点\n資格取得・改善提案', { fs: 11.5 });
    s += txt(280, 246, '学習と成長 → 業務プロセス → 顧客 → 財務 の因果関係でつなげて考える', { fs: 11.5, w: 700, col: C.ink2 });
    AP.art['bsc'] = {
      frames: [{ svg: svg(260, s), cap: 'BSCは財務だけでなく4つの視点それぞれにKPIを置き、バランスよく戦略の達成度を測る。' }],
    };
  }

  // ---- デシジョンツリー ----
  {
    let s = box(16, 96, 30, 30, '', { fill: C.acc, stroke: 'none', r: 4 });
    s += txt(31, 140, '意思決定', { fs: 10.5, w: 700, col: C.acc });
    s += line(46, 111, 170, 55, C.ink3) + line(46, 111, 170, 170, C.ink3);
    s += txt(100, 70, '案A', { fs: 12, w: 700, col: C.ink }) + txt(100, 158, '案B', { fs: 12, w: 700, col: C.ink });
    s += circle(182, 55, 12, C.goldSoft, C.gold);
    s += line(194, 55, 370, 25, C.ink3) + line(194, 55, 370, 88, C.ink3);
    s += txt(280, 28, '確率 0.6', { fs: 11, col: C.ink2 }) + txt(280, 84, '確率 0.4', { fs: 11, col: C.ink2 });
    s += box(372, 10, 110, 30, '100万円', { fs: 12 }) + box(372, 73, 110, 30, '0万円', { fs: 12 });
    s += line(170, 170, 370, 170, C.ink3) + box(372, 155, 110, 30, '50万円(確実)', { fs: 11.5 });
    s += box(150, 108, 250, 26, '案Aの期待値 = 100×0.6 + 0×0.4 = 60万円', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 11 });
    s += txt(280, 210, '期待値が大きい案A(60万円 > 50万円)を選ぶ', { fs: 12.5, w: 700, col: C.ok });
    AP.art['decision-tree'] = {
      frames: [{ svg: svg(225, s), cap: '■は意思決定、○は確率で結果が分かれる点。各案の期待値を計算して比べる。' }],
    };
  }

  // ---- パレート図 ----
  {
    const data = [['寸法不良', 40], ['キズ', 25], ['汚れ', 15], ['変形', 10], ['その他', 10]];
    const x0 = 70, base = 190, bw = 70, gap = 18;
    let s = line(x0, 30, x0, base, C.ink3, { sw: 1.5 }) + line(x0, base, 520, base, C.ink3, { sw: 1.5 }) + line(520, 30, 520, base, C.ink3, { sw: 1.5 });
    s += txt(x0 - 8, base, '0', { a: 'end', fs: 10 }) + txt(x0 - 8, base - 128, '40件', { a: 'end', fs: 10 });
    s += txt(528, 30, '100%', { a: 'start', fs: 10 }) + txt(528, base - 128, '80%', { a: 'start', fs: 10, w: 700, col: C.gold });
    s += line(x0, base - 128, 520, base - 128, C.gold, { dash: true, sw: 1 });
    let cum = 0;
    const pts = [];
    data.forEach(([name, v], i) => {
      const x = x0 + 12 + i * (bw + gap);
      const h = v * 3.2;
      const a = i < 3;
      s += box(x, base - h, bw, h, '', { fill: a ? C.accSoft : C.surf, stroke: a ? C.acc : C.line, r: 3 });
      s += txt(x + bw / 2, base - h + 13, `${v}件`, { fs: 10.5, w: 700, col: a ? C.acc : C.ink3 });
      s += txt(x + bw / 2, base + 13, name, { fs: 10.5, w: 700, col: C.ink2 });
      cum += v;
      pts.push([x + bw, base - cum * 1.6]);
    });
    s += `<polyline points="${[[x0 + 12, base], ...pts].map((p) => p.join(',')).join(' ')}" fill="none" stroke="${C.gold}" stroke-width="2.5"/>`;
    pts.forEach(([x, y]) => { s += circle(x, y, 4, C.gold); });
    s += txt(160, 222, '上位3項目で80% → ここを重点的に対策', { fs: 12, w: 700, col: C.acc });
    AP.art['pareto'] = {
      frames: [{ svg: svg(235, s), cap: '棒は件数(多い順)、折れ線は累積比率。少数の項目が全体の大部分を占めることが一目で分かる。' }],
    };
  }

  // ---- IoTの流れ ----
  {
    const bx = [[10, 'センサ付きの\nモノ'], [150, 'ネットワーク'], [280, 'クラウド\n(蓄積・AI分析)'], [430, 'フィードバック\n(制御・通知)']];
    let s = '';
    bx.forEach(([x, t], i) => {
      s += box(x, 30, i === 2 ? 130 : 120, 52, t, i === 2 ? { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 11.5 } : { fs: 11.5 });
      if (i < 3) s += arrow(x + (i === 2 ? 130 : 120) + 2, 56, bx[i + 1][0] - 2, 56, { col: C.ink3 });
    });
    s += `<polyline points="490,84 490,112 70,112 70,86" fill="none" stroke="${C.ok}" stroke-width="2"/>`;
    s += arrow(70, 100, 70, 86, { col: C.ok });
    s += txt(280, 126, '現実世界を改善', { fs: 11, w: 700, col: C.ok });
    s += txt(280, 156, '例: ハウスの温度センサ → 高温を検知 → 自動で窓を開ける', { fs: 11.5, col: C.ink2 });
    AP.art['iot'] = {
      frames: [{ svg: svg(170, s), cap: 'IoTは「集める(センサ)→ つなぐ → 分析する → 現実に返す」のループ。' }],
    };
  }
})();
