// 計算ドリル: 毎回数値が変わるランダム生成問題に数値を入力して答える
const Drill = (() => {
  const $view = () => document.getElementById('view-practice');

  const ri = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---- 問題ジェネレータ ----
  const GENS = [
    {
      id: 'base', name: '基数変換', partId: 'basics',
      gen() {
        if (Math.random() < 0.5) {
          const n = 33 + Math.floor(Math.random() * 94); // 33..126
          const bin = n.toString(2);
          return {
            q: `10進数の ${n} を2進数で表せ。`,
            unit: '(2進数)', ans: bin,
            exp: `${n} = ${bin.split('').map((b, i) => b === '1' ? 2 ** (bin.length - 1 - i) : null).filter(Boolean).join(' + ')} なので ${bin} です。`,
          };
        }
        const n = 33 + Math.floor(Math.random() * 94);
        return {
          q: `2進数の ${n.toString(2)} を10進数で表せ。`,
          unit: '(10進数)', ans: String(n),
          exp: `${n.toString(2)} = ${n.toString(2).split('').map((b, i, a) => b === '1' ? 2 ** (a.length - 1 - i) : null).filter(Boolean).join(' + ')} = ${n} です。`,
        };
      },
    },
    {
      id: 'subnet', name: 'サブネット計算', partId: 'network',
      gen() {
        if (Math.random() < 0.5) {
          const n = ri([25, 26, 27, 28]);
          const hosts = 2 ** (32 - n) - 2;
          return {
            q: `サブネット 192.168.1.0/${n} で割当て可能なホスト数は何台か。`,
            unit: '台', ans: String(hosts),
            exp: `ホスト部は 32−${n} = ${32 - n}ビット。2^${32 - n} − 2 = ${hosts}台です(ネットワークアドレスとブロードキャストアドレスを除く)。`,
          };
        }
        const n = ri([25, 26, 27]);
        const block = 2 ** (32 - n);
        const x = 1 + Math.floor(Math.random() * 254);
        const net = x - (x % block);
        return {
          q: `IPアドレス 172.16.5.${x}、プレフィックス長 /${n} のホストが属するネットワークアドレスを答えよ。`,
          unit: '(x.x.x.x 形式)', ans: `172.16.5.${net}`,
          exp: `/${n} のブロックサイズは ${block}。${x} を ${block} で区切ると ${net} 〜 ${net + block - 1} の範囲に入るので、ネットワークアドレスは 172.16.5.${net} です。`,
        };
      },
    },
    {
      id: 'avail', name: '稼働率', partId: 'computer',
      gen() {
        if (Math.random() < 0.5) {
          const r = ri([90, 95, 96, 98, 80, 75]);
          const total = ri([100, 200, 500, 1000]);
          const mtbf = total * r / 100, mttr = total - mtbf;
          return {
            q: `MTBFが ${mtbf}時間、MTTRが ${mttr}時間 のシステムの稼働率は何%か。`,
            unit: '%', ans: String(r),
            exp: `稼働率 = MTBF ÷ (MTBF + MTTR) = ${mtbf} ÷ ${total} = ${r / 100}(${r}%)です。`,
          };
        }
        const a = ri([80, 90]), b = ri([80, 90, 95]);
        if (Math.random() < 0.5) {
          const ans = a * b / 100;
          return {
            q: `稼働率 ${a / 100} の装置と稼働率 ${b / 100} の装置を直列に接続したシステム全体の稼働率は何%か。`,
            unit: '%', ans: String(ans),
            exp: `直列は積で求めます。${a / 100} × ${b / 100} = ${ans / 100}(${ans}%)。どちらかが止まると全体が止まるので、単体より低くなります。`,
          };
        }
        const ans = 100 - (100 - a) * (100 - b) / 100;
        return {
          q: `稼働率 ${a / 100} の装置と稼働率 ${b / 100} の装置を並列に接続した(どちらか一方が動けばよい)システム全体の稼働率は何%か。`,
          unit: '%', ans: String(ans),
          exp: `並列は 1 − (両方止まる確率) = 1 − ${(100 - a) / 100} × ${(100 - b) / 100} = ${ans / 100}(${ans}%)。冗長化で単体より高くなります。`,
        };
      },
    },
    {
      id: 'cache', name: '実効アクセス時間', partId: 'computer',
      gen() {
        const combos = [];
        [[10, 0.9], [20, 0.9], [5, 0.8], [10, 0.8], [20, 0.8], [20, 0.95]].forEach(([c, h]) => {
          [50, 60, 100].forEach((m) => {
            const e = c * h + m * (1 - h);
            if (Math.abs(e - Math.round(e)) < 1e-9) combos.push([c, m, h, Math.round(e)]);
          });
        });
        const [c, m, h, e] = ri(combos);
        return {
          q: `キャッシュメモリのアクセス時間 ${c}ナノ秒、主記憶のアクセス時間 ${m}ナノ秒、キャッシュのヒット率 ${h} のとき、実効アクセス時間は何ナノ秒か。`,
          unit: 'ナノ秒', ans: String(e),
          exp: `実効アクセス時間 = ${c} × ${h} + ${m} × ${(1 - h).toFixed(2)} = ${(c * h).toFixed(1)} + ${(m * (1 - h)).toFixed(1)} = ${e}ナノ秒です。`,
        };
      },
    },
    {
      id: 'cpu', name: 'CPU性能', partId: 'computer',
      gen() {
        const g = ri([1, 2, 4]), cpi = ri([2, 4, 5, 8]);
        const mips = g * 1000 / cpi;
        if (Number.isInteger(mips) && Math.random() < 0.6) {
          return {
            q: `クロック周波数 ${g}GHz、平均CPI(1命令あたりのクロック数)が ${cpi} のCPUの性能は何MIPSか。`,
            unit: 'MIPS', ans: String(mips),
            exp: `1秒間の命令数 = ${g}×10⁹ ÷ ${cpi} = ${g * 1000 / cpi}×10⁶。MIPSは百万命令/秒なので ${mips} MIPSです。`,
          };
        }
        const ns = cpi / g;
        return {
          q: `クロック周波数 ${g}GHz、平均CPI が ${cpi} のCPUで、1命令の平均実行時間は何ナノ秒か。`,
          unit: 'ナノ秒', ans: String(ns),
          exp: `1クロック = 1/${g}ナノ秒。${cpi}クロック × ${1 / g}ナノ秒 = ${ns}ナノ秒です。`,
        };
      },
    },
    {
      id: 'evm', name: 'EVM(進捗・コスト)', partId: 'management',
      gen() {
        const pv = ri([100, 120, 150, 200]);
        const ev = pv + ri([-40, -30, -20, 20, 30]);
        const ac = ev + ri([-20, -10, 10, 20, 30]);
        if (Math.random() < 0.5) {
          const sv = ev - pv;
          return {
            q: `EVMで管理中のプロジェクトが PV=${pv}万円、EV=${ev}万円、AC=${ac}万円 である。スケジュール差異 SV は何万円か(遅れはマイナスで答える)。`,
            unit: '万円', ans: String(sv),
            exp: `SV = EV − PV = ${ev} − ${pv} = ${sv}万円。${sv < 0 ? 'マイナスなので進捗は遅れています。' : 'プラスなので予定より進んでいます。'}`,
          };
        }
        const cv = ev - ac;
        return {
          q: `EVMで管理中のプロジェクトが PV=${pv}万円、EV=${ev}万円、AC=${ac}万円 である。コスト差異 CV は何万円か(超過はマイナスで答える)。`,
          unit: '万円', ans: String(cv),
          exp: `CV = EV − AC = ${ev} − ${ac} = ${cv}万円。${cv < 0 ? 'マイナスなので予算超過です。' : 'プラスなので予算内に収まっています。'}`,
        };
      },
    },
    {
      id: 'cvp', name: '損益分岐点', partId: 'strategy',
      gen() {
        const pair = ri([[120, 0.4], [200, 0.5], [300, 0.4], [240, 0.6], [600, 0.6], [300, 0.75], [200, 0.6], [600, 0.8], [800, 0.75]]);
        const [f, r] = pair;
        const bep = f / (1 - r);
        if (Math.random() < 0.6) {
          return {
            q: `固定費が ${f}万円、変動費率が ${r} のとき、損益分岐点売上高は何万円か。`,
            unit: '万円', ans: String(bep),
            exp: `損益分岐点売上高 = 固定費 ÷ (1 − 変動費率) = ${f} ÷ ${1 - r} = ${bep}万円です。`,
          };
        }
        const sales = bep * ri([1.5, 2]);
        const profit = sales * (1 - r) - f;
        return {
          q: `固定費 ${f}万円、変動費率 ${r} の会社の売上高が ${sales}万円 のとき、利益は何万円か。`,
          unit: '万円', ans: String(profit),
          exp: `利益 = 売上 × (1 − 変動費率) − 固定費 = ${sales} × ${1 - r} − ${f} = ${profit}万円です。`,
        };
      },
    },
  ];

  let filterId = 'all';
  let current = null;
  let session = { asked: 0, correct: 0, streak: 0 };

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // 入力の正規化: 全角→半角、空白・カンマ除去、%や単位を許容
  function normalize(s) {
    return String(s).trim()
      .replace(/[０-９．－ー−]/g, (c) => ({ '．': '.', '－': '-', 'ー': '-', '−': '-' }[c] || String.fromCharCode(c.charCodeAt(0) - 0xFEE0)))
      .replace(/[,、\s%％台万円秒]/g, '')
      .replace(/ナノ/g, '')
      .toLowerCase();
  }

  function pickGen() {
    const pool = filterId === 'all' ? GENS : GENS.filter((g) => g.id === filterId);
    return ri(pool);
  }

  function render() {
    session = { asked: 0, correct: 0, streak: 0 };
    next();
  }

  function next() {
    const gen = pickGen();
    current = Object.assign({ genId: gen.id, name: gen.name, partId: gen.partId }, gen.gen());
    paint();
  }

  function paint(feedback) {
    const chips = [
      `<button class="chip ${filterId === 'all' ? 'is-active' : ''}" data-f="all">ミックス</button>`,
      ...GENS.map((g) => `<button class="chip ${filterId === g.id ? 'is-active' : ''}" data-f="${g.id}">${g.name}</button>`),
    ].join('');

    $view().innerHTML = `
      <div class="crumb"><button data-back>実践トレーニング</button> › 計算ドリル</div>
      <h2 class="view-title">計算ドリル</h2>
      <p class="view-lead">毎回数値が変わります。電卓を使わず手で計算してみましょう(本試験も電卓は使えません)。</p>
      <div class="chip-row">${chips}</div>
      <div class="q-card drill-card">
        <p class="q-source">${esc(current.name)}</p>
        <p class="q-text">${esc(current.q)}</p>
        <div class="drill-input-row">
          <input id="drill-input" class="drill-input" type="text" inputmode="decimal" autocomplete="off"
            placeholder="答えを入力" ${feedback ? 'disabled' : ''}>
          <span class="drill-unit">${esc(current.unit || '')}</span>
          ${feedback ? '' : '<button class="btn btn-primary" id="drill-check">答え合わせ</button>'}
        </div>
        <div id="drill-feedback">${feedback || ''}</div>
        ${feedback ? '<div class="quiz-next"><button class="btn btn-primary" id="drill-next">次の問題へ</button></div>' : ''}
      </div>
      <p class="card-counter">今回のセッション: ${session.correct} / ${session.asked} 問正解 ・ 連続正解 ${session.streak}</p>`;

    $view().querySelector('[data-back]').addEventListener('click', Practice.renderMenu);
    $view().querySelectorAll('[data-f]').forEach((c) => {
      c.addEventListener('click', () => { filterId = c.dataset.f; next(); });
    });

    const input = document.getElementById('drill-input');
    if (feedback) {
      const btn = document.getElementById('drill-next');
      btn.addEventListener('click', next);
      btn.focus();
    } else {
      document.getElementById('drill-check').addEventListener('click', check);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      input.focus();
    }
  }

  function check() {
    const input = document.getElementById('drill-input');
    const given = normalize(input.value);
    if (given === '') { input.focus(); return; }
    const canonical = normalize(current.ans);
    // 文字列一致に加え、"2.50" と "2.5" のような数値の揺れも許容
    const numOk = /^-?[\d.]+$/.test(given) && /^-?[\d.]+$/.test(canonical) &&
      Math.abs(parseFloat(given) - parseFloat(canonical)) < 1e-9;
    const ok = given === canonical || numOk;
    session.asked += 1;
    if (ok) { session.correct += 1; session.streak += 1; } else { session.streak = 0; }
    Store.recordAnswer(current.partId, ok);
    const fb = `
      <div class="feedback ${ok ? 'ok' : 'ng'}">
        <p class="feedback-head">${ok ? '正解!この調子!' : `残念、不正解… 正解は「${esc(current.ans)}${esc(current.unit || '')}」`}</p>
        <p class="feedback-exp">${esc(current.exp)}</p>
      </div>`;
    const typed = input.value;
    paint(fb);
    const input2 = document.getElementById('drill-input');
    input2.value = typed;
  }

  return { render };
})();
