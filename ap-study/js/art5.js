// 図解データ(教材の深掘りで追加した論点向け)
(() => {
  const { C, svg, txt, box, arrow } = ArtKit;
  const circle = (cx, cy, r, fill, stroke, sw = 1.5) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${sw}"/>`;
  const line = (x1, y1, x2, y2, col, o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || C.line}" stroke-width="${o.sw || 2}" ${o.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
  // 矢じり(先端の座標と向き)
  const head = (x, y, ang, col) => {
    const L = 9;
    const p1 = `${x - L * Math.cos(ang - 0.45)},${y - L * Math.sin(ang - 0.45)}`;
    const p2 = `${x - L * Math.cos(ang + 0.45)},${y - L * Math.sin(ang + 0.45)}`;
    return `<polygon points="${x},${y} ${p1} ${p2}" fill="${col}"/>`;
  };
  // 2次ベジェ曲線の矢印(終点での接線方向に矢じり)
  const curve = (x1, y1, cx, cy, x2, y2, col, sw = 2) =>
    `<path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${sw}"/>` +
    head(x2, y2, Math.atan2(y2 - cy, x2 - cx), col);
  // 3次ベジェ曲線の矢印(自己ループ用)
  const loop = (x1, y1, c1x, c1y, c2x, c2y, x2, y2, col, sw = 2) =>
    `<path d="M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${sw}"/>` +
    head(x2, y2, Math.atan2(y2 - c2y, x2 - c2x), col);

  // ---- 有限オートマトン(1の個数の偶奇を判定。アニメ) ----
  {
    const input = '1011';
    const states = ['偶', '奇', '奇', '偶', '奇']; // 読んだ文字数ごとの状態
    function frame(k) {
      const cur = states[k];
      const P = { 偶: [190, 100], 奇: [370, 100] };
      const used = k > 0 ? { from: states[k - 1], ch: input[k - 1] } : null;
      const hot = (from, ch) => used && used.from === from && used.ch === ch;
      let s = '';
      // 開始の矢印
      s += txt(190, 16, '開始', { fs: 11, w: 700, col: C.ink3 });
      s += arrow(190, 24, 190, 62, { col: C.ink3 });
      // 偶 → 奇(1)、奇 → 偶(1)
      const c1 = hot('偶', '1') ? C.acc : C.ink3, c2 = hot('奇', '1') ? C.acc : C.ink3;
      s += curve(222, 84, 280, 44, 338, 84, c1, hot('偶', '1') ? 3 : 2);
      s += txt(280, 54, '1', { fs: 14, w: 900, col: c1 });
      s += curve(338, 116, 280, 156, 222, 116, c2, hot('奇', '1') ? 3 : 2);
      s += txt(280, 148, '1', { fs: 14, w: 900, col: c2 });
      // 自己ループ(0)
      const l1 = hot('偶', '0') ? C.acc : C.ink3, l2 = hot('奇', '0') ? C.acc : C.ink3;
      s += loop(160, 86, 100, 60, 100, 140, 160, 114, l1, hot('偶', '0') ? 3 : 2);
      s += txt(96, 100, '0', { fs: 14, w: 900, col: l1 });
      s += loop(400, 86, 460, 60, 460, 140, 400, 114, l2, hot('奇', '0') ? 3 : 2);
      s += txt(464, 100, '0', { fs: 14, w: 900, col: l2 });
      // 状態(偶は受理状態なので二重丸)
      ['偶', '奇'].forEach((name) => {
        const [x, y] = P[name];
        const on = name === cur;
        s += circle(x, y, 32, on ? C.accSoft : C.surf, on ? C.acc : C.line, on ? 2.5 : 1.5);
        if (name === '偶') s += circle(x, y, 26, 'none', on ? C.acc : C.line, 1.5);
        s += txt(x, y, name, { fs: 16, w: 900, col: on ? C.acc : C.ink });
      });
      // 入力テープ
      s += txt(198, 200, '入力', { fs: 11.5, w: 700, col: C.ink3, a: 'end' });
      [...input].forEach((ch, i) => {
        const done = i < k - 1, now = i === k - 1;
        s += box(210 + i * 44, 184, 36, 32, ch, {
          fill: now ? C.acc : done ? C.s2 : C.surf, stroke: now ? C.acc : C.line,
          col: now ? C.accInk : done ? C.ink3 : C.ink, fs: 15,
        });
      });
      const msg = k === 0 ? 'まだ何も読んでいない(偶から開始)'
        : k < input.length ? `${k}文字目「${input[k - 1]}」を読んで ${states[k - 1]} → ${cur}`
          : '読み終えた: 受理状態(二重丸)にいない → 受理されない';
      s += txt(280, 238, msg, { fs: 12.5, w: 700, col: k === input.length ? C.ng : C.ink2 });
      return svg(254, s);
    }
    AP.art['automaton'] = {
      frames: [
        { svg: frame(0), cap: '「1の個数が偶数か」を判定するオートマトン。二重丸の「偶」が受理状態(ゴール)。入力 1011 を1文字ずつ読んでいく。' },
        { svg: frame(1), cap: '1文字目「1」: 偶 → 奇 へ移る。1が来るたびに、偶と奇が入れ替わる。' },
        { svg: frame(2), cap: '2文字目「0」: 0 では状態は変わらない(奇のまま)。' },
        { svg: frame(3), cap: '3文字目「1」: 奇 → 偶 へ。' },
        { svg: frame(4), cap: '4文字目「1」: 偶 → 奇。読み終えたとき受理状態にいないので、1011 は受理されない(1が3個で奇数)。' },
      ],
    };
  }

  // ---- アドレス指定方式(アニメ) ----
  {
    const MEM = [[100, 150], [105, 200], [150, 250]];
    const rowY = (i) => 46 + i * 52;
    function frame(mode) {
      let s = '';
      // CPU側
      s += box(12, 10, 236, 186, '', { fill: C.s2, stroke: 'none', r: 12 });
      s += txt(130, 28, 'CPU', { fs: 12, w: 900, col: C.ink3 });
      s += txt(30, 58, '命令', { fs: 11.5, w: 700, col: C.ink2, a: 'start' });
      s += box(70, 42, 76, 32, 'LOAD', { fs: 12.5, fill: C.surf });
      s += box(148, 42, 76, 32, '100', { fs: 14, fill: C.accSoft, stroke: C.acc, col: C.acc });
      s += txt(186, 88, 'アドレス部', { fs: 10.5, w: 700, col: C.acc });
      const useIdx = mode === 'index';
      s += txt(30, 136, 'インデックス', { fs: 11, w: 700, col: C.ink2, a: 'start' });
      s += txt(30, 152, 'レジスタ', { fs: 11, w: 700, col: C.ink2, a: 'start' });
      s += box(148, 128, 76, 32, '5', { fs: 14, fill: useIdx ? C.goldSoft : C.surf, stroke: useIdx ? C.gold : C.line, col: useIdx ? C.gold : C.ink });
      // 主記憶側
      s += txt(430, 22, '主記憶', { fs: 12, w: 900, col: C.ink3 });
      s += txt(362, 36, '番地', { fs: 10.5, w: 700, col: C.ink3 });
      s += txt(450, 36, '中身', { fs: 10.5, w: 700, col: C.ink3 });
      const hl = { direct: [0], indirect: [0, 2], index: [1] }[mode];
      const dataRow = { direct: 0, indirect: 2, index: 1 }[mode];
      MEM.forEach(([addr, val], i) => {
        const y = rowY(i);
        const isData = i === dataRow, isPath = hl.includes(i) && !isData;
        s += box(330, y, 64, 36, String(addr), { fs: 13, fill: C.surf, col: C.ink2 });
        s += box(400, y, 100, 36, String(val), {
          fs: 15, fill: isData ? C.okSoft : isPath ? C.accSoft : C.surf,
          stroke: isData ? C.ok : isPath ? C.acc : C.line, col: isData ? C.ok : isPath ? C.acc : C.ink,
        });
        if (i < MEM.length - 1) s += txt(362, y + 44, '⋮', { fs: 11, col: C.ink3 });
      });
      // 矢印
      if (mode === 'direct') {
        s += arrow(226, 58, 326, rowY(0) + 18, { col: C.acc, label: '100番地へ', lfs: 10.5, dy: -12 });
      } else if (mode === 'indirect') {
        s += arrow(226, 58, 326, rowY(0) + 18, { col: C.acc, label: '100番地へ', lfs: 10.5, dy: -12 });
        s += curve(502, rowY(0) + 18, 534, rowY(1) + 18, 502, rowY(2) + 18, C.acc);
        s += txt(524, rowY(1) + 10, '150', { fs: 10.5, w: 700, col: C.acc, a: 'start' });
        s += txt(524, rowY(1) + 26, '番地へ', { fs: 10.5, w: 700, col: C.acc, a: 'start' });
      } else {
        s += circle(270, 100, 13, C.surf, C.gold);
        s += txt(270, 100, '+', { fs: 16, w: 900, col: C.gold });
        s += arrow(226, 64, 260, 91, { col: C.acc });
        s += arrow(226, 138, 260, 109, { col: C.gold });
        s += arrow(283, 100, 326, rowY(1) + 18, { col: C.gold, label: '105番地へ', lfs: 10.5, dx: -14, dy: 16, lcol: C.gold });
      }
      const name = { direct: '直接アドレス指定', indirect: '間接アドレス指定', index: 'インデックスアドレス指定' }[mode];
      s += txt(130, 184, name, { fs: 12.5, w: 900, col: C.ink });
      s += txt(450, 214, `読み出されるデータ: ${MEM[dataRow][1]}`, { fs: 13, w: 900, col: C.ok });
      return svg(228, s);
    }
    AP.art['addressing'] = {
      frames: [
        { svg: frame('direct'), cap: '直接: アドレス部の値(100)がそのままデータの番地。100番地の中身 150 がデータ。' },
        { svg: frame('indirect'), cap: '間接: 100番地の中身(150)を、もう一度「番地」として使う。150番地の中身 250 がデータ。' },
        { svg: frame('index'), cap: 'インデックス: アドレス部(100)+ インデックスレジスタ(5)= 105番地。中身 200 がデータ。配列を順に読むときに便利。' },
      ],
    };
  }

  // ---- 関係演算(選択・射影・結合。アニメ) ----
  {
    const STU = { head: ['番号', '名前', '組', '部コード'], rows: [['1', '青木', 'A', 'C1'], ['2', '井上', 'B', 'C2'], ['3', '上田', 'A', 'C2'], ['4', '江藤', 'B', 'C1']] };
    const CLUB = { head: ['部コード', '部名'], rows: [['C1', 'サッカー'], ['C2', '美術']] };
    const RH = 24;
    function table(x, y, t, widths, o = {}) {
      let s = '';
      let cx = x;
      t.head.forEach((h, c) => {
        const hc = o.cols && o.cols.includes(c);
        s += box(cx, y, widths[c], RH, h, { r: 0, fs: 10.5, fill: hc ? C.acc : C.s2, stroke: C.line, col: hc ? C.accInk : C.ink2 });
        cx += widths[c];
      });
      t.rows.forEach((r, ri) => {
        cx = x;
        r.forEach((v, c) => {
          const hr = o.rows && o.rows.includes(ri), hc = o.cols && o.cols.includes(c);
          const dim = (o.rows && !hr) || (o.cols && !hc);
          const col = o.rowColor && o.rowColor[ri];
          s += box(cx, y + RH * (ri + 1), widths[c], RH, v, {
            r: 0, fs: 11.5, w: 500,
            fill: col || (hr || hc ? C.accSoft : C.surf), stroke: C.line, col: dim ? C.ink3 : C.ink,
          });
          cx += widths[c];
        });
      });
      if (o.title) s += txt(x, y - 12, o.title, { fs: 11.5, w: 900, col: C.ink, a: 'start' });
      return s;
    }
    const W = [40, 52, 34, 64];
    function frameSelect() {
      let s = table(14, 40, STU, W, { rows: [0, 2], title: '生徒' });
      s += arrow(206, 100, 262, 100, { col: C.acc, label: '選択', lfs: 11 });
      s += table(274, 40, { head: STU.head, rows: [STU.rows[0], STU.rows[2]] }, W, { title: '結果(組 = A の行)' });
      s += txt(14, 190, "SQL: SELECT * FROM 生徒 WHERE 組 = 'A'", { fs: 11.5, w: 700, col: C.ink2, a: 'start' });
      return svg(204, s);
    }
    function frameProject() {
      let s = table(14, 40, STU, W, { cols: [1, 2], title: '生徒' });
      s += arrow(206, 100, 262, 100, { col: C.acc, label: '射影', lfs: 11 });
      s += table(274, 40, { head: ['名前', '組'], rows: STU.rows.map((r) => [r[1], r[2]]) }, [52, 34], { title: '結果(名前と組の列)' });
      s += txt(14, 190, 'SQL: SELECT 名前, 組 FROM 生徒', { fs: 11.5, w: 700, col: C.ink2, a: 'start' });
      return svg(204, s);
    }
    function frameJoin() {
      const rc = STU.rows.map((r) => (r[3] === 'C1' ? C.goldSoft : C.accSoft));
      let s = table(14, 40, STU, W, { rowColor: rc, title: '生徒' });
      s += table(14, 40 + RH * 5 + 36, CLUB, [64, 72], { rowColor: [C.goldSoft, C.accSoft], title: '部活' });
      s += arrow(206, 130, 262, 130, { col: C.acc, label: '結合', lfs: 11 });
      s += table(274, 40, { head: ['名前', '部名'], rows: STU.rows.map((r) => [r[1], r[3] === 'C1' ? 'サッカー' : '美術']) }, [60, 80], { rowColor: rc, title: '結果(部コードが一致する行をつなぐ)' });
      s += txt(274, 200, 'SQL: SELECT 名前, 部名', { fs: 11, w: 700, col: C.ink2, a: 'start' });
      s += txt(274, 218, '  FROM 生徒 JOIN 部活', { fs: 11, w: 700, col: C.ink2, a: 'start' });
      s += txt(274, 236, '  ON 生徒.部コード = 部活.部コード', { fs: 11, w: 700, col: C.ink2, a: 'start' });
      return svg(276, s);
    }
    AP.art['rel-ops'] = {
      frames: [
        { svg: frameSelect(), cap: '選択: 条件に合う「行」を取り出す。SQLの WHERE 句に当たる。' },
        { svg: frameProject(), cap: '射影: 指定した「列」を取り出す。SQLの SELECT の後ろに書く列名に当たる。' },
        { svg: frameJoin(), cap: '結合: 共通の列(部コード)の値が同じ行どうしをつなぐ。同じ色の行がつながる。' },
      ],
    };
  }

  // ---- DFD(データフロー図) ----
  {
    let s = '';
    s += box(8, 58, 66, 44, '顧客', { fs: 13, r: 0 });
    s += arrow(74, 80, 110, 80, { col: C.ink3, label: '注文', lfs: 10.5 });
    s += circle(146, 80, 34, C.accSoft, C.acc);
    s += txt(146, 72, '1', { fs: 10, w: 700, col: C.acc });
    s += txt(146, 88, '注文受付', { fs: 11.5, w: 700, col: C.ink });
    s += arrow(180, 80, 212, 80, { col: C.ink3, label: '受注', lfs: 10.5 });
    s += line(214, 64, 318, 64, C.ink2, { sw: 2 }) + line(214, 96, 318, 96, C.ink2, { sw: 2 });
    s += txt(266, 80, '受注ファイル', { fs: 11.5, w: 700, col: C.ink });
    s += arrow(320, 80, 352, 80, { col: C.ink3, label: '受注', lfs: 10.5 });
    s += circle(388, 80, 34, C.accSoft, C.acc);
    s += txt(388, 72, '2', { fs: 10, w: 700, col: C.acc });
    s += txt(388, 88, '出荷指示', { fs: 11.5, w: 700, col: C.ink });
    s += arrow(422, 80, 480, 80, { col: C.ink3, label: '出荷指示書', lfs: 10.5 });
    s += box(482, 58, 70, 44, '倉庫', { fs: 13, r: 0 });
    // 凡例
    const ly = 150;
    s += box(20, ly - 12, 30, 24, '', { r: 0 }) + txt(58, ly, '外部実体', { fs: 11, w: 700, a: 'start' });
    s += circle(160, ly, 12, C.accSoft, C.acc) + txt(180, ly, 'プロセス(処理)', { fs: 11, w: 700, a: 'start' });
    s += line(300, ly - 9, 330, ly - 9, C.ink2) + line(300, ly + 9, 330, ly + 9, C.ink2) + txt(338, ly, 'データストア', { fs: 11, w: 700, a: 'start' });
    s += arrow(438, ly, 468, ly, { col: C.ink3 }) + txt(476, ly, 'データフロー', { fs: 11, w: 700, a: 'start' });
    s += txt(280, 186, '4つの記号だけで「データがどこから来て、どう処理され、どこへ行くか」を表す', { fs: 11, w: 700, col: C.ink2 });
    AP.art['dfd'] = {
      frames: [{ svg: svg(200, s), cap: 'DFDの例(注文から出荷まで)。データの流れだけを描き、「いつ・どの順で・どんな条件で」は描かないのがDFDの特徴。' }],
    };
  }

  // ---- ブロックチェーン(改ざんが伝わる様子。アニメ) ----
  {
    function frame(tampered) {
      let s = '';
      const blocks = [
        { n: 1, prev: '0000', data: 'A → B 5枚', hash: '3a7f' },
        { n: 2, prev: '3a7f', data: tampered ? 'C → D 900枚' : 'C → D 2枚', hash: tampered ? 'e91c' : '8b2d' },
        { n: 3, prev: '8b2d', data: 'B → E 1枚', hash: '51c0' },
      ];
      blocks.forEach((b, i) => {
        const x = 12 + i * 186, y = 20;
        const bad = tampered && i === 1;
        s += box(x, y, 164, 132, '', { fill: bad ? C.ngSoft : C.surf, stroke: bad ? C.ng : C.line, r: 10 });
        s += txt(x + 82, y + 18, `ブロック${b.n}`, { fs: 12.5, w: 900, col: C.ink });
        s += txt(x + 12, y + 46, `前のハッシュ: ${b.prev}`, { fs: 11, w: 700, col: C.ink2, a: 'start' });
        s += txt(x + 12, y + 74, `取引: ${b.data}`, { fs: 11, w: 700, col: bad ? C.ng : C.ink2, a: 'start' });
        s += box(x + 8, y + 94, 148, 28, `このハッシュ: ${b.hash}`, { fs: 11, fill: bad ? C.ngSoft : C.accSoft, stroke: 'none', col: bad ? C.ng : C.acc });
        if (i < 2) {
          const broken = tampered && i === 1;
          s += arrow(x + 156, y + 108, x + 186, y + 46, { col: broken ? C.ng : C.acc, dash: broken });
          if (broken) s += txt(x + 174, y + 148, '一致しない!', { fs: 11.5, w: 900, col: C.ng });
        }
      });
      s += txt(280, 196, tampered
        ? 'ブロック2を書き換えるとハッシュ値が変わり、ブロック3の「前のハッシュ」と合わなくなる'
        : '各ブロックは、1つ前のブロックのハッシュ値を持ってつながっている', { fs: 11.5, w: 700, col: tampered ? C.ng : C.ink2 });
      return svg(212, s);
    }
    AP.art['blockchain'] = {
      frames: [
        { svg: frame(false), cap: 'ブロックチェーン: 各ブロックに「1つ前のブロックのハッシュ値」を記録して、鎖のようにつなぐ。' },
        { svg: frame(true), cap: '途中のブロックを改ざんするとハッシュ値が変わり、つながりが壊れる。ばれないようにするには後ろのブロックを全部作り直す必要があり、多数の参加者が同じ記録を持つので事実上できない。' },
      ],
    };
  }

  // ---- 定量発注方式の在庫の動き ----
  {
    const X0 = 60, X1 = 530, Y0 = 176, YTOP = 30;
    const yRP = 104, ySS = 146;
    let s = '';
    s += line(X0, YTOP - 6, X0, Y0, C.ink2) + line(X0, Y0, X1, Y0, C.ink2);
    s += txt(X0 - 8, YTOP - 12, '在庫量', { fs: 11, w: 700, col: C.ink2, a: 'start' });
    s += txt(X1, Y0 + 16, '時間 →', { fs: 11, w: 700, col: C.ink2, a: 'end' });
    // 発注点・安全在庫
    s += line(X0, yRP, X1, yRP, C.gold, { dash: true, sw: 1.5 });
    s += txt(X0 + 4, yRP - 9, '発注点', { fs: 11, w: 700, col: C.gold, a: 'start' });
    s += line(X0, ySS, X1, ySS, C.ok, { dash: true, sw: 1.5 });
    s += txt(X0 + 4, ySS + 12, '安全在庫', { fs: 11, w: 700, col: C.ok, a: 'start' });
    // のこぎり型の在庫推移: 上端 40 から一定の速さで減り、安全在庫の線で入荷
    const top = 40, slope = 0.6; // 1pxあたりの減り方
    const pts = [];
    let x = X0, y = top;
    const events = [];
    while (x < X1) {
      const xr = x + (yRP - y) / slope; // 発注点に届くx
      const xa = x + (ySS - y) / slope; // 安全在庫の線に届くx(入荷)
      if (xa > X1) { pts.push([X1, y + (X1 - x) * slope]); break; }
      pts.push([x, y], [xa, ySS], [xa, top]);
      events.push([xr, xa]);
      x = xa; y = top;
    }
    s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${C.acc}" stroke-width="2.5"/>`;
    events.forEach(([xr, xa], i) => {
      s += circle(xr, yRP, 5, C.gold);
      if (i === 0) {
        s += txt(xr, yRP - 22, '発注', { fs: 11, w: 900, col: C.gold });
        s += txt(xa + 6, top + 6, '入荷', { fs: 11, w: 900, col: C.acc, a: 'start' });
        s += line(xr, Y0 - 10, xa, Y0 - 10, C.ink3, { sw: 1.5 });
        s += line(xr, Y0 - 15, xr, Y0 - 5, C.ink3, { sw: 1.5 }) + line(xa, Y0 - 15, xa, Y0 - 5, C.ink3, { sw: 1.5 });
        s += txt((xr + xa) / 2, Y0 - 22, '調達期間', { fs: 10.5, w: 700, col: C.ink3 });
      }
    });
    AP.art['reorder-point'] = {
      frames: [{ svg: svg(196, s), cap: '定量発注方式: 在庫が発注点まで減ったら発注し、調達期間のあとに入荷する。調達期間中に使う量 + 安全在庫 = 発注点。' }],
    };
  }
})();
