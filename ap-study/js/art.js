// 図解エンジン + イラスト集(前半: 基礎理論〜ネットワーク)
// AP.art[id] = { frames: [{ svg, cap }] }  frames が2つ以上なら再生コントロール付き
AP.art = {};

// ---- SVG部品ヘルパ ----
const ArtKit = (() => {
  const C = {
    ink: 'var(--ink)', ink2: 'var(--ink-2)', ink3: 'var(--ink-3)',
    acc: 'var(--accent)', accSoft: 'var(--accent-soft)', accInk: 'var(--accent-ink)',
    ok: 'var(--ok)', okSoft: 'var(--ok-soft)', ng: 'var(--ng)', ngSoft: 'var(--ng-soft)',
    gold: 'var(--gold)', goldSoft: 'var(--gold-soft)',
    line: 'var(--line)', s2: 'var(--surface-2)', surf: 'var(--surface)',
  };

  const svg = (h, inner) => `<svg class="art-svg" viewBox="0 0 560 ${h}" role="img">${inner}</svg>`;

  function txt(x, y, t, o = {}) {
    return `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" dominant-baseline="middle"
      font-size="${o.fs || 12}" font-weight="${o.w || 500}" fill="${o.col || C.ink2}">${t}</text>`;
  }

  function box(x, y, w, h, t, o = {}) {
    const fs = o.fs || 13;
    const lines = t ? String(t).split('\n') : [];
    const text = lines.map((ln, i) =>
      txt(x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * (fs + 4), ln,
        { fs, w: o.w || 700, col: o.col || C.ink })).join('');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r != null ? o.r : 8}"
      fill="${o.fill || C.surf}" stroke="${o.stroke || C.line}" stroke-width="1.5"
      ${o.dash ? 'stroke-dasharray="5 4"' : ''}/>${text}`;
  }

  function arrow(x1, y1, x2, y2, o = {}) {
    const col = o.col || C.ink3;
    const ang = Math.atan2(y2 - y1, x2 - x1), L = 9;
    const p1 = `${x2 - L * Math.cos(ang - 0.45)},${y2 - L * Math.sin(ang - 0.45)}`;
    const p2 = `${x2 - L * Math.cos(ang + 0.45)},${y2 - L * Math.sin(ang + 0.45)}`;
    let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"
      stroke-width="${o.sw || 2}" ${o.dash ? 'stroke-dasharray="5 4"' : ''}/>
      <polygon points="${x2},${y2} ${p1} ${p2}" fill="${col}"/>`;
    if (o.label) {
      s += txt((x1 + x2) / 2 + (o.dx || 0), (y1 + y2) / 2 + (o.dy || -10), o.label,
        { col: o.lcol || col, fs: o.lfs || 11.5, w: 700 });
    }
    return s;
  }

  return { C, svg, txt, box, arrow };
})();

// ---- 図解プレイヤー(course.js から利用) ----
const ArtPlayer = (() => {
  function figureHtml(id) {
    const art = AP.art[id];
    if (!art) return '';
    const multi = art.frames.length > 1;
    return `
      <figure class="art ${multi ? 'is-anime' : ''}" data-art="${id}">
        ${multi ? '<span class="art-tag">▶ アニメ図解</span>' : ''}
        <div class="art-stage"></div>
        <figcaption class="art-caption"></figcaption>
        ${multi ? `
          <div class="art-controls">
            <button class="art-btn" data-prev aria-label="前のステップ">◀</button>
            <button class="art-btn play" data-play>▶ 再生</button>
            <button class="art-btn" data-next aria-label="次のステップ">▶</button>
            <span class="art-dots"></span>
          </div>` : ''}
      </figure>`;
  }

  function init(root) {
    root.querySelectorAll('[data-art]').forEach((fig) => {
      const art = AP.art[fig.dataset.art];
      if (!art) return;
      const stage = fig.querySelector('.art-stage');
      const cap = fig.querySelector('.art-caption');
      const dots = fig.querySelector('.art-dots');
      const playBtn = fig.querySelector('[data-play]');
      let i = 0, timer = null;

      function draw() {
        const f = art.frames[i];
        stage.innerHTML = f.svg;
        cap.textContent = f.cap || '';
        if (dots) {
          dots.innerHTML = art.frames.map((_, k) =>
            `<button class="art-dot ${k === i ? 'on' : ''}" data-k="${k}" aria-label="ステップ${k + 1}"></button>`).join('');
          dots.querySelectorAll('.art-dot').forEach((d) => {
            d.addEventListener('click', () => { stop(); i = Number(d.dataset.k); draw(); });
          });
        }
      }
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (playBtn) playBtn.textContent = '▶ 再生';
      }
      function play() {
        if (timer) { stop(); return; }
        if (i >= art.frames.length - 1) i = -1;
        playBtn.textContent = '⏸ 停止';
        timer = setInterval(() => {
          if (i >= art.frames.length - 1) { stop(); return; }
          i += 1;
          draw();
        }, 2200);
        if (i === -1) { i = 0; draw(); }
      }

      if (playBtn) {
        playBtn.addEventListener('click', play);
        fig.querySelector('[data-prev]').addEventListener('click', () => { stop(); i = Math.max(0, i - 1); draw(); });
        fig.querySelector('[data-next]').addEventListener('click', () => { stop(); i = Math.min(art.frames.length - 1, i + 1); draw(); });
      }
      draw();
    });
  }

  return { figureHtml, init };
})();

// ============================================================
// 図解データ(基礎理論〜ネットワーク)
// ============================================================
(() => {
  const { C, svg, txt, box, arrow } = ArtKit;

  // ---- 基数変換(静止画) ----
  {
    const rows = [
      ['45 ÷ 2 = 22', '… 1'], ['22 ÷ 2 = 11', '… 0'], ['11 ÷ 2 = 5', '… 1'],
      ['5 ÷ 2 = 2', '… 1'], ['2 ÷ 2 = 1', '… 0'], ['1 ÷ 2 = 0', '… 1'],
    ];
    const left = rows.map((r, i) =>
      txt(95, 40 + i * 26, r[0], { a: 'end', fs: 13, col: C.ink }) +
      txt(112, 40 + i * 26, r[1], { fs: 13, w: 900, col: C.acc })).join('') +
      arrow(140, 190, 140, 30, { col: C.acc, label: '下から読む', dx: 42, dy: 0 });
    const vals = [32, 16, 8, 4, 2, 1], bits = [1, 0, 1, 1, 0, 1];
    const right = vals.map((v, i) =>
      box(255 + i * 46, 52, 40, 30, String(v), { fs: 12, col: C.ink3, fill: C.s2, stroke: 'none', w: 500 }) +
      box(255 + i * 46, 88, 40, 34, String(bits[i]),
        bits[i] ? { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 16 } : { fs: 16, col: C.ink3 })).join('') +
      txt(392, 36, '重み(2のべき乗)', { fs: 11.5, col: C.ink3 }) +
      txt(392, 145, '32 + 8 + 4 + 1 = 45', { fs: 13.5, w: 900, col: C.ink }) +
      txt(392, 172, '∴ 45(10進) = 101101(2進)', { fs: 13, w: 700, col: C.acc });
    AP.art['binary'] = {
      frames: [{ svg: svg(210, left + right), cap: '10進→2進は「2で割った余りを下から読む」。2進→10進は「重みの合計」。' }],
    };
  }

  // ---- スタックとキュー(アニメ) ----
  {
    function frame(n) {
      // スタック(左)
      let s = txt(140, 22, 'スタック(LIFO)', { fs: 13.5, w: 900, col: C.ink });
      s += `<path d="M95,60 V190 H185 V60" fill="none" stroke="${C.line}" stroke-width="2"/>`;
      const st = ['A', 'B', 'C'].slice(0, Math.min(n + 1, 3));
      if (n === 3) st.pop();
      st.forEach((v, i) => {
        s += box(103, 182 - (i + 1) * 38, 74, 32, v, { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 15 });
      });
      if (n < 3) s += arrow(140, 38, 140, 60 + (2 - Math.min(n, 2)) * 0, { col: C.ok, label: `push ${'ABC'[Math.min(n, 2)]}`, dx: 40, dy: 8 });
      if (n === 3) {
        s += box(103, 30, 74, 32, 'C', { fill: C.ngSoft, stroke: C.ng, col: C.ng, fs: 15 });
        s += arrow(190, 46, 235, 46, { col: C.ng, label: 'pop', dy: -12 });
        s += txt(140, 215, '最後に入れた C から出る', { fs: 11.5, col: C.ink2, w: 700 });
      }
      // キュー(右)
      let q = txt(420, 22, 'キュー(FIFO)', { fs: 13.5, w: 900, col: C.ink });
      q += `<path d="M320,95 H520 M320,140 H520" stroke="${C.line}" stroke-width="2"/>`;
      const qu = ['A', 'B', 'C'].slice(0, Math.min(n + 1, 3));
      if (n === 3) qu.shift();
      qu.forEach((v, i) => {
        q += box(340 + i * 62, 100, 54, 35, v, { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 15 });
      });
      if (n < 3) q += arrow(542, 117, 508, 117, { col: C.ok, label: `${'ABC'[Math.min(n, 2)]} が入る`, dy: 26, dx: -14, lfs: 11 });
      if (n === 3) {
        q += arrow(330, 117, 292, 117, { col: C.ng, label: 'A が出る', dy: -16, lfs: 11 });
        q += txt(420, 215, '最初に入れた A から出る', { fs: 11.5, col: C.ink2, w: 700 });
      }
      return svg(230, s + q);
    }
    AP.art['stack-queue'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: A を格納。スタックは上に積み、キューは末尾に並ぶ。' },
        { svg: frame(1), cap: 'ステップ2: B を格納。' },
        { svg: frame(2), cap: 'ステップ3: C を格納。A・B・C の3件が入った状態。' },
        { svg: frame(3), cap: 'ステップ4: 取り出すと…スタックは最後の C(後入れ先出し)、キューは最初の A(先入れ先出し)。' },
      ],
    };
  }

  // ---- 2分探索(アニメ) ----
  {
    const vals = [3, 7, 12, 18, 25, 31, 40, 52, 66, 71];
    function frame(lo, hi, mid, found, note) {
      let s = txt(280, 20, '整列済みの配列から「31」を探す', { fs: 13, w: 900, col: C.ink });
      vals.forEach((v, i) => {
        const inR = i >= lo && i <= hi;
        const isM = i === mid;
        s += box(30 + i * 50, 46, 44, 40, String(v), {
          fs: 14,
          fill: found && isM ? C.okSoft : isM ? C.acc : inR ? C.accSoft : C.s2,
          stroke: found && isM ? C.ok : isM ? C.acc : inR ? C.acc : C.line,
          col: found && isM ? C.ok : isM ? C.accInk : inR ? C.acc : C.ink3,
        });
      });
      s += txt(30 + mid * 50 + 22, 106, found ? '✓ 発見!' : '中央', { fs: 12, w: 900, col: found ? C.ok : C.acc });
      s += txt(280, 138, note, { fs: 12.5, col: C.ink2, w: 700 });
      return svg(160, s);
    }
    AP.art['binary-search'] = {
      frames: [
        { svg: frame(0, 9, 4, false, '中央の 25 と比較 → 31 > 25 なので右半分に絞る'), cap: 'ステップ1: 10件の中央(25)と比較。31は大きいので左半分は捨てる。' },
        { svg: frame(5, 9, 7, false, '中央の 52 と比較 → 31 < 52 なので左半分に絞る'), cap: 'ステップ2: 残り5件の中央(52)と比較。31は小さいので右側を捨てる。' },
        { svg: frame(5, 6, 5, true, '3回目の比較で発見。線形探索なら最大10回 → 2分探索は log₂n 回'), cap: 'ステップ3: 残り2件の中央(31)と一致!毎回半分になるので O(log n)。' },
      ],
    };
  }

  // ---- メモリ階層ピラミッド(静止画) ----
  {
    const layers = [
      ['レジスタ', 150, C.acc, C.accInk],
      ['キャッシュメモリ(SRAM)', 230, C.accSoft, C.acc],
      ['主記憶(DRAM)', 310, C.s2, C.ink],
      ['補助記憶(SSD・磁気ディスク)', 390, C.surf, C.ink2],
    ];
    let s = '';
    layers.forEach(([name, w, fill, col], i) => {
      s += box(280 - w / 2, 30 + i * 46, w, 38, name, { fill, col, stroke: i === 3 ? C.line : 'none', fs: 12.5 });
    });
    s += arrow(66, 170, 66, 44, { col: C.ok }) +
      txt(66, 190, '高速・小容量', { fs: 11, col: C.ok, w: 700 }) + txt(66, 205, '(高価)', { fs: 11, col: C.ok, w: 700 });
    s += arrow(494, 44, 494, 170, { col: C.ink3 }) +
      txt(494, 190, '大容量・低速', { fs: 11, col: C.ink3, w: 700 }) + txt(494, 205, '(安価)', { fs: 11, col: C.ink3, w: 700 });
    AP.art['memory-pyramid'] = {
      frames: [{ svg: svg(220, s), cap: 'CPUに近いほど高速・小容量。速度差を埋めるのがキャッシュメモリ。' }],
    };
  }

  // ---- RAID5(静止画) ----
  {
    const disks = [
      ['ディスク1', ['A1', 'B1', 'P(C)']],
      ['ディスク2', ['A2', 'P(B)', 'C1']],
      ['ディスク3', ['P(A)', 'B2', 'C2']],
    ];
    let s = '';
    disks.forEach(([name, blocks], d) => {
      const x = 70 + d * 150;
      s += box(x, 30, 120, 24, name, { fill: C.s2, stroke: 'none', fs: 12, col: C.ink2, r: 6 });
      blocks.forEach((b, i) => {
        const isP = b.startsWith('P');
        s += box(x, 62 + i * 38, 120, 32, b, isP
          ? { fill: C.goldSoft, stroke: C.gold, col: C.gold, fs: 13 }
          : { fill: C.accSoft, stroke: C.acc, col: C.acc, fs: 13 });
      });
    });
    s += box(70, 190, 12, 12, '', { fill: C.goldSoft, stroke: C.gold, r: 3 }) +
      txt(90, 196, '= パリティ(誤り訂正情報)を全ディスクに分散', { a: 'start', fs: 12, col: C.ink2, w: 700 });
    AP.art['raid5'] = {
      frames: [{ svg: svg(215, s), cap: 'RAID5: データとパリティを分散記録。1台壊れても残りから復元できる。' }],
    };
  }

  // ---- タスクの状態遷移(アニメ) ----
  {
    function circle(x, y, name, hot) {
      return `<circle cx="${x}" cy="${y}" r="44" fill="${hot ? C.accSoft : C.surf}"
          stroke="${hot ? C.acc : C.line}" stroke-width="2"/>` +
        txt(x, y, name, { fs: 13, w: 900, col: hot ? C.acc : C.ink });
    }
    function frame(hl) {
      // hl: 'dispatch' | 'wait' | 'ready'
      const RUN = [420, 70], READY = [140, 70], WAIT = [280, 185];
      let s = circle(...READY, '実行可能', hl === 'ready' || hl === 'dispatch') +
        circle(...RUN, '実行', hl === 'dispatch' || hl === 'wait') +
        circle(...WAIT, '待ち', hl === 'wait' || hl === 'ready');
      const on = (k) => (hl === k ? C.acc : C.ink3);
      s += arrow(188, 55, 372, 55, { col: on('dispatch'), label: 'ディスパッチ(CPU割当て)', dy: -12, lfs: 11 });
      s += arrow(372, 85, 188, 85, { col: C.ink3, label: 'タイムアウト', dy: 14, lfs: 11 });
      s += arrow(395, 108, 320, 165, { col: on('wait'), label: '入出力要求', dx: 38, dy: 0, lfs: 11 });
      s += arrow(240, 165, 165, 108, { col: on('ready'), label: '入出力完了', dx: -40, dy: 0, lfs: 11 });
      return svg(245, s);
    }
    AP.art['task-state'] = {
      frames: [
        { svg: frame('dispatch'), cap: 'ステップ1: 実行可能状態のタスクにCPUが割り当てられ(ディスパッチ)、実行状態になる。' },
        { svg: frame('wait'), cap: 'ステップ2: 実行中に入出力を要求すると、完了を待つ「待ち状態」へ。CPUは他のタスクに渡る。' },
        { svg: frame('ready'), cap: 'ステップ3: 入出力が完了すると「実行可能状態」に戻り、次のCPU割当てを待つ。※直接「実行」には戻らない!' },
      ],
    };
  }

  // ---- 正規化(アニメ) ----
  {
    function table(x, y, w, title, rows, hot) {
      let s = box(x, y, w, 26, title, {
        fill: hot ? C.acc : C.s2, col: hot ? C.accInk : C.ink2, stroke: 'none', fs: 12, r: 6,
      });
      rows.forEach((r, i) => {
        s += box(x, y + 30 + i * 24, w, 22, r, { fs: 10.5, w: 500, col: C.ink2, r: 4 });
      });
      return s;
    }
    const f0 = table(150, 30, 260, '注文表(非正規形)', [
      '1001 | 山田 | 東京 | ペン, ノート, 消しゴム',
      '1002 | 山田 | 東京 | ペン',
      '1003 | 佐藤 | 大阪 | ノート',
    ], true) + txt(280, 165, '1つのセルに複数の値(繰返し項目)・顧客情報が重複', { fs: 12, col: C.ng, w: 700 });
    const f1 = table(60, 40, 210, '注文表', ['1001 | 山田 | 東京 | ペン', '1001 | 山田 | 東京 | ノート', '1002 | 山田 | 東京 | ペン'], false) +
      arrow(280, 90, 330, 90, { col: C.acc }) +
      table(340, 40, 160, '第1正規形', ['行を分けて単一値に'], true) +
      txt(280, 175, 'まだ「山田・東京」の重複が残っている(部分/推移的関数従属)', { fs: 12, col: C.ink2, w: 700 });
    const f2 = table(40, 40, 150, '注文表', ['1001 | C01 | ペン', '1002 | C01 | ペン', '1003 | C02 | ノート'], true) +
      table(215, 40, 150, '顧客表', ['C01 | 山田 | 東京', 'C02 | 佐藤 | 大阪'], true) +
      table(390, 40, 140, '商品表', ['ペン | ¥100', 'ノート | ¥150'], true) +
      txt(280, 165, '重複が消えた!顧客の住所変更も1か所の修正で済む(更新時異状の防止)', { fs: 12, col: C.ok, w: 700 });
    AP.art['normalization'] = {
      frames: [
        { svg: svg(190, f0), cap: 'ステップ1: 非正規形。繰返し項目があり、同じ情報があちこちに重複している。' },
        { svg: svg(195, f1), cap: 'ステップ2: 第1正規形。繰返しを排除して1セル1値に。ただし重複は残る。' },
        { svg: svg(185, f2), cap: 'ステップ3: 関数従属を整理して表を分割(第2〜第3正規形)。重複がなくなり不整合を防げる。' },
      ],
    };
  }

  // ---- トランザクション(アニメ) ----
  {
    function frame(a, b, hlA, hlB, note, noteCol, committed) {
      let s = txt(280, 22, '口座Aから口座Bへ 1万円の振込', { fs: 13, w: 900, col: C.ink });
      s += box(90, 55, 150, 70, `口座A\n¥${a.toLocaleString()}`, {
        fill: hlA ? C.accSoft : C.surf, stroke: hlA ? C.acc : C.line, col: hlA ? C.acc : C.ink, fs: 14,
      });
      s += box(320, 55, 150, 70, `口座B\n¥${b.toLocaleString()}`, {
        fill: hlB ? C.accSoft : C.surf, stroke: hlB ? C.acc : C.line, col: hlB ? C.acc : C.ink, fs: 14,
      });
      s += arrow(248, 90, 312, 90, { col: C.ink3, label: '¥10,000', lfs: 11 });
      if (committed) {
        s += box(150, 150, 260, 34, '✓ COMMIT(確定)', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 13.5 });
      } else {
        s += txt(280, 165, note, { fs: 12.5, col: noteCol || C.ink2, w: 700 });
      }
      return svg(205, s);
    }
    AP.art['transaction'] = {
      frames: [
        { svg: frame(50000, 10000, false, false, 'トランザクション開始(BEGIN)'), cap: 'ステップ1: 振込前。A=5万円、B=1万円。ここから2つの更新を「1つの単位」として実行する。' },
        { svg: frame(40000, 10000, true, false, 'Aから1万円を引き落とし…この瞬間に障害が起きたら?', C.ng), cap: 'ステップ2: Aの残高を減らした。もしここで障害が起きたら、引き落としだけが実行された不整合な状態に!' },
        { svg: frame(40000, 20000, false, true, 'Bへ1万円を入金'), cap: 'ステップ3: Bへ入金。2つの更新がそろった。' },
        { svg: frame(40000, 20000, false, false, '', null, true), cap: 'ステップ4: COMMITで確定(原子性)。途中で失敗した場合はROLLBACKで「すべてなかったこと」にする。' },
      ],
    };
  }

  // ---- OSI参照モデルとTCP/IP(静止画) ----
  {
    const osi = ['アプリケーション層', 'プレゼンテーション層', 'セッション層', 'トランスポート層', 'ネットワーク層', 'データリンク層', '物理層'];
    let s = txt(155, 22, 'OSI参照モデル(7階層)', { fs: 12.5, w: 900, col: C.ink });
    osi.forEach((n, i) => {
      s += box(60, 36 + i * 32, 190, 28, `${7 - i}. ${n}`, { fs: 11, fill: i >= 3 ? C.accSoft : C.s2, stroke: 'none', col: i >= 3 ? C.acc : C.ink2 });
    });
    const tcp = [
      ['アプリケーション層', 'HTTP・SMTP・DNS', 96],
      ['トランスポート層', 'TCP・UDP', 32],
      ['インターネット層', 'IP・ICMP・ARP', 32],
      ['ネットワーク\nインタフェース層', 'イーサネット', 64],
    ];
    let y = 36;
    s += txt(400, 22, 'TCP/IP(4階層)', { fs: 12.5, w: 900, col: C.ink });
    tcp.forEach(([n, proto]) => {
      const h = n.includes('\n') ? 60 : (n === 'アプリケーション層' ? 92 : 28);
      s += box(300, y, 160, h, n, { fs: 11, fill: C.surf, col: C.ink });
      s += txt(475, y + h / 2, proto, { a: 'start', fs: 10.5, col: C.ink3, w: 700 });
      y += h + 4;
    });
    AP.art['osi'] = {
      frames: [{ svg: svg(268, s), cap: 'OSIの7階層と、実際のインターネットで使われるTCP/IPの4階層の対応。' }],
    };
  }

  // ---- 3ウェイハンドシェイク(アニメ) ----
  {
    function frame(step) {
      let s = box(60, 30, 120, 40, 'クライアント', { fs: 13 }) + box(380, 30, 120, 40, 'サーバ', { fs: 13 });
      s += `<line x1="120" y1="70" x2="120" y2="210" stroke="${C.line}" stroke-width="2"/>
            <line x1="440" y1="70" x2="440" y2="210" stroke="${C.line}" stroke-width="2"/>`;
      if (step >= 0) s += arrow(126, 95, 434, 110, { col: step === 0 ? C.acc : C.ink3, label: 'SYN(接続要求)', dy: -12, lfs: 11.5 });
      if (step >= 1) s += arrow(434, 135, 126, 150, { col: step === 1 ? C.acc : C.ink3, label: 'SYN + ACK(要求 + 確認応答)', dy: -12, lfs: 11.5 });
      if (step >= 2) {
        s += arrow(126, 175, 434, 190, { col: C.acc, label: 'ACK(確認応答)', dy: -12, lfs: 11.5 });
        s += box(190, 205, 180, 30, '✓ コネクション確立', { fill: C.okSoft, stroke: C.ok, col: C.ok, fs: 12.5 });
      }
      return svg(250, s);
    }
    AP.art['handshake'] = {
      frames: [
        { svg: frame(0), cap: 'ステップ1: クライアントが SYN で接続を要求。' },
        { svg: frame(1), cap: 'ステップ2: サーバが SYN+ACK で応答。「要求を受け取ったよ、こちらからも接続したい」' },
        { svg: frame(2), cap: 'ステップ3: クライアントが ACK を返して確立。3回のやり取り=3ウェイハンドシェイク。' },
      ],
    };
  }

  // ---- サブネットマスク(静止画) ----
  {
    let s = txt(280, 22, '192.168.1.0 / 24 の意味', { fs: 13.5, w: 900, col: C.ink });
    const octets = ['192', '168', '1', '0'];
    octets.forEach((o, i) => {
      const net = i < 3;
      s += box(60 + i * 112, 46, 104, 44, o, {
        fs: 16, fill: net ? C.acc : C.surf, col: net ? C.accInk : C.ink, stroke: net ? 'none' : C.line,
      });
      s += txt(60 + i * 112 + 52, 104, `${i * 8 + 1}〜${(i + 1) * 8}ビット`, { fs: 10, col: C.ink3 });
    });
    s += `<path d="M60,122 H395" stroke="${C.acc}" stroke-width="3"/>` +
      txt(228, 140, 'ネットワーク部(24ビット)= どのネットワークか', { fs: 11.5, col: C.acc, w: 700 });
    s += `<path d="M400,122 H500" stroke="${C.ink3}" stroke-width="3"/>` +
      txt(450, 158, 'ホスト部(8ビット)', { fs: 11.5, col: C.ink3, w: 700 });
    s += txt(280, 185, '割当て可能ホスト数 = 2⁸ − 2 = 254台(全0=ネットワーク、全1=ブロードキャストを除く)', { fs: 12, col: C.ink2, w: 700 });
    AP.art['subnet'] = {
      frames: [{ svg: svg(205, s), cap: '「/24」は先頭24ビットがネットワーク部という意味(CIDR表記)。' }],
    };
  }
})();
