// さわって学ぶ: 教材内のインタラクティブ部品(ハンズオン)
const Widgets = (() => {
  const REG = {

    // ---- 2進数メーカー: ビットをタップして10進数を作る ----
    bits: {
      render(el) {
        let bits = [0, 0, 1, 0, 1, 1, 0, 1];
        function paint() {
          const val = bits.reduce((n, b, i) => n + b * 2 ** (7 - i), 0);
          const terms = bits.map((b, i) => (b ? 2 ** (7 - i) : null)).filter((x) => x !== null);
          el.innerHTML = `
            <p class="widget-title">2進数メーカー: ビット(0/1)をタップして、好きな数を作ってみよう</p>
            <div class="w-bits">
              ${bits.map((b, i) => `
                <button class="w-bit ${b ? 'on' : ''}" data-i="${i}">
                  <small>${2 ** (7 - i)}</small><b>${b}</b>
                </button>`).join('')}
            </div>
            <p class="w-result">2進数 ${bits.join('')} = <span style="color:var(--accent)">${val}</span>
              <small>${terms.length ? `(${terms.join(' + ')})` : '(すべて0)'}</small></p>
            <p class="widget-note">上の小さい数字が各ビットの「重み」。1にしたビットの重みを合計すると10進数になります。255(全部1)まで作れます。</p>`;
          el.querySelectorAll('.w-bit').forEach((btn) => {
            btn.addEventListener('click', () => {
              bits[Number(btn.dataset.i)] ^= 1;
              paint();
            });
          });
        }
        paint();
      },
    },

    // ---- 論理演算ラボ: スイッチを切り替えてランプの点灯を見る ----
    logic: {
      render(el) {
        let A = 1, B = 0;
        function paint() {
          const lamps = [
            ['A AND B', A & B], ['A OR B', A | B], ['A XOR B', A ^ B], ['NOT A', A ^ 1],
          ];
          el.innerHTML = `
            <p class="widget-title">論理演算ラボ: スイッチAとBを切り替えて、どのランプが点くか確かめよう</p>
            <div class="w-switch-row">
              <button class="w-switch ${A ? 'on' : ''}" data-sw="A">A = ${A}</button>
              <button class="w-switch ${B ? 'on' : ''}" data-sw="B">B = ${B}</button>
            </div>
            <div class="w-lamps">
              ${lamps.map(([name, v]) => `
                <div class="w-lamp ${v ? 'lit' : ''}">
                  <span class="wl-name">${name}</span>
                  <span class="wl-val">${v}</span>
                </div>`).join('')}
            </div>
            <p class="widget-note">AND=両方1のとき / OR=どちらかが1 / XOR=2つが「違う」とき。全部の組合せ(4通り)を試すと真理値表が頭に入ります。</p>`;
          el.querySelectorAll('.w-switch').forEach((btn) => {
            btn.addEventListener('click', () => {
              if (btn.dataset.sw === 'A') A ^= 1; else B ^= 1;
              paint();
            });
          });
        }
        paint();
      },
    },

    // ---- サブネット・スライダー: /nを動かしてホスト数の変化を見る ----
    subnet: {
      render(el) {
        let n = 24;
        function paint() {
          const hosts = 2 ** (32 - n) - 2;
          const mask = n >= 24 ? `255.255.255.${256 - 2 ** (32 - n)}` : `255.255.${256 - 2 ** (24 - n)}.0`;
          el.innerHTML = `
            <p class="widget-title">サブネット・スライダー: /(プレフィックス長)を動かしてみよう</p>
            <div class="w-slider-row">
              <span class="w-slider-val">/${n}</span>
              <input type="range" min="20" max="30" value="${n}" id="w-subnet-range">
              <span style="font-size:12.5px;color:var(--ink-2);font-weight:700">ホスト数 <b style="color:var(--accent);font-size:16px">${hosts.toLocaleString()}</b> 台</span>
            </div>
            <div class="w-bitbar">
              ${Array.from({ length: 32 }, (_, i) => `<span class="${i < n ? 'net' : ''}"></span>`).join('')}
            </div>
            <p class="widget-note">
              青 = ネットワーク部(${n}ビット) / 白 = ホスト部(${32 - n}ビット)。サブネットマスクは ${mask}。<br>
              ネットワーク部を1ビット増やすと、ホスト数は約半分になります(2^${32 - n} − 2 = ${hosts.toLocaleString()})。</p>`;
          el.querySelector('#w-subnet-range').addEventListener('input', (e) => {
            n = Number(e.target.value);
            paint();
          });
        }
        paint();
      },
    },

    // ---- 暗号ラボ: シーザー暗号で「鍵」を体感する ----
    caesar: {
      render(el) {
        let text = 'HELLO', shift = 3;
        const enc = (s, k) => s.toUpperCase().replace(/[A-Z]/g,
          (c) => String.fromCharCode((c.charCodeAt(0) - 65 + k) % 26 + 65));
        function paint(focusInput) {
          el.innerHTML = `
            <p class="widget-title">暗号ラボ: 文字を「鍵の数」だけずらす一番シンプルな暗号(シーザー暗号)</p>
            <div class="w-slider-row">
              <input class="w-text" id="w-caesar-text" value="${text.replace(/"/g, '')}" maxlength="16"
                placeholder="アルファベットを入力">
              <span class="w-slider-val">鍵=${shift}</span>
              <input type="range" min="1" max="25" value="${shift}" id="w-caesar-range">
            </div>
            <div class="w-out">暗号文: ${enc(text, shift) || '(文字を入力してね)'}</div>
            <p class="widget-note">
              同じ「鍵(ずらす数)」を知っている人だけが元に戻せる = これが<b>共通鍵暗号</b>の原型です。
              ただし26通り試せば破られてしまうので、実際のAESなどは桁違いに複雑な計算でこれを行っています。</p>`;
          const input = el.querySelector('#w-caesar-text');
          input.addEventListener('input', () => {
            text = input.value;
            const pos = input.selectionStart;
            paint(pos);
          });
          el.querySelector('#w-caesar-range').addEventListener('input', (e) => {
            shift = Number(e.target.value);
            paint();
          });
          if (focusInput != null) {
            const inp = el.querySelector('#w-caesar-text');
            inp.focus();
            inp.setSelectionRange(focusInput, focusInput);
          }
        }
        paint();
      },
    },
    // ---- 待ち行列シミュレータ: 利用率ρを動かすと待ち時間がどう伸びるか ----
    queue: {
      render(el) {
        let rho = 0.5;
        const W = 300, H = 120, X0 = 40, Y0 = 130, MAX = 19;
        const px = (r) => X0 + (r / 0.95) * W;
        const py = (m) => Y0 - (Math.min(m, MAX) / MAX) * H;
        function paint() {
          const m = rho / (1 - rho);
          const ts = 2; // 平均サービス時間(分)
          let pts = [];
          for (let r = 0; r <= 0.951; r += 0.01) pts.push(`${px(r).toFixed(1)},${py(r / (1 - r)).toFixed(1)}`);
          el.innerHTML = `
            <p class="widget-title">待ち行列シミュレータ: 窓口の利用率ρを動かして、待ち時間の変化を見てみよう</p>
            <div class="w-slider-row">
              <span class="w-slider-val">ρ = ${rho.toFixed(2)}</span>
              <input type="range" min="0.1" max="0.95" step="0.05" value="${rho}" id="w-queue-range" aria-label="利用率">
            </div>
            <svg class="w-chart" viewBox="0 0 360 150" role="img" aria-label="利用率と待ち時間のグラフ">
              <line x1="${X0}" y1="${Y0}" x2="${X0 + W}" y2="${Y0}" stroke="var(--ink-3)"/>
              <line x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y0 - H}" stroke="var(--ink-3)"/>
              <text x="${X0 + W}" y="${Y0 + 14}" text-anchor="end" font-size="10" fill="var(--ink-3)">利用率 ρ → 0.95</text>
              <text x="${X0 - 4}" y="${Y0 - H}" text-anchor="end" font-size="10" fill="var(--ink-3)">19倍</text>
              <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
              <circle cx="${px(rho)}" cy="${py(m)}" r="6" fill="var(--gold)"/>
            </svg>
            <p class="w-result">平均待ち時間 = ρ/(1−ρ) × 平均サービス時間 = <span style="color:var(--accent)">${m.toFixed(2)}倍</span>
              <small>(1人の処理が${ts}分なら、平均 ${(m * ts).toFixed(1)}分 待つ)</small></p>
            <p class="widget-note">ρ=0.5 で1倍、0.8 で4倍、0.9 で9倍。利用率が1に近づくと待ち時間が急に伸びるので、窓口やサーバの利用率は余裕をもたせて設計します。</p>`;
          el.querySelector('#w-queue-range').addEventListener('input', (e) => { rho = Number(e.target.value); paint(); });
        }
        paint();
      },
    },

    // ---- 半加算器: 入力A・Bを切り替えて、和と桁上がりを確かめる ----
    adder: {
      render(el) {
        let A = 1, B = 1;
        function paint() {
          const S = A ^ B, Cy = A & B;
          const on = (v) => (v ? 'var(--gold)' : 'var(--line)');
          el.innerHTML = `
            <p class="widget-title">半加算器ラボ: A と B を切り替えて、1桁の足し算がどう計算されるか見てみよう</p>
            <div class="w-switch-row">
              <button class="w-switch ${A ? 'on' : ''}" data-sw="A">A = ${A}</button>
              <button class="w-switch ${B ? 'on' : ''}" data-sw="B">B = ${B}</button>
            </div>
            <svg class="w-chart" viewBox="0 0 390 130" role="img" aria-label="半加算器の回路">
              <text x="16" y="36" font-size="13" font-weight="700" fill="var(--ink)">A</text>
              <text x="16" y="96" font-size="13" font-weight="700" fill="var(--ink)">B</text>
              <polyline points="30,32 110,32 110,40 140,40" fill="none" stroke="${on(A)}" stroke-width="3"/>
              <polyline points="30,92 90,92 90,52 140,52" fill="none" stroke="${on(B)}" stroke-width="3"/>
              <polyline points="110,32 110,80 140,80" fill="none" stroke="${on(A)}" stroke-width="3"/>
              <polyline points="90,92 140,92" fill="none" stroke="${on(B)}" stroke-width="3"/>
              <circle cx="110" cy="32" r="4" fill="${on(A)}"/><circle cx="90" cy="92" r="4" fill="${on(B)}"/>
              <rect x="140" y="28" width="80" height="36" rx="8" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>
              <text x="180" y="50" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">XOR</text>
              <rect x="140" y="70" width="80" height="36" rx="8" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>
              <text x="180" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">AND</text>
              <line x1="220" y1="46" x2="280" y2="46" stroke="${on(S)}" stroke-width="3"/>
              <line x1="220" y1="88" x2="280" y2="88" stroke="${on(Cy)}" stroke-width="3"/>
              <circle cx="296" cy="46" r="14" fill="${S ? 'var(--gold)' : 'var(--surface-2)'}"/>
              <text x="296" y="50" text-anchor="middle" font-size="12" font-weight="700" fill="${S ? '#fff' : 'var(--ink-3)'}">${S}</text>
              <circle cx="296" cy="88" r="14" fill="${Cy ? 'var(--gold)' : 'var(--surface-2)'}"/>
              <text x="296" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="${Cy ? '#fff' : 'var(--ink-3)'}">${Cy}</text>
              <text x="318" y="50" font-size="11" font-weight="700" fill="var(--ink-2)">和 S</text>
              <text x="318" y="92" font-size="11" font-weight="700" fill="var(--ink-2)">桁上がり C</text>
            </svg>
            <p class="w-result">${A} + ${B} = <span style="color:var(--accent)">${Cy}${S}</span><small>(2進数。桁上がり ${Cy}、和 ${S})</small></p>
            <p class="widget-note">和は「AとBが違うとき1」なので XOR、桁上がりは「両方1のとき1」なので AND。1 + 1 = 10(2進数)になるのを確かめよう。</p>`;
          el.querySelectorAll('.w-switch').forEach((btn) => {
            btn.addEventListener('click', () => { if (btn.dataset.sw === 'A') A ^= 1; else B ^= 1; paint(); });
          });
        }
        paint();
      },
    },

    // ---- 伝送時間計算機 ----
    transfer: {
      render(el) {
        let mb = 1000, mbps = 100, eff = 80;
        function paint() {
          const bits = mb * 8; // Mビット
          const sec = bits / (mbps * eff / 100);
          el.innerHTML = `
            <p class="widget-title">伝送時間計算機: データ量・回線速度・伝送効率を変えてみよう</p>
            <div class="w-slider-row">
              <span class="w-slider-val" style="min-width:6.5em">${mb.toLocaleString()} Mバイト</span>
              <input type="range" min="100" max="5000" step="100" value="${mb}" id="w-tr-size" aria-label="データ量">
            </div>
            <div class="w-slider-row">
              <span class="w-slider-val" style="min-width:6.5em">${mbps.toLocaleString()} Mbps</span>
              <input type="range" min="0" max="3" step="1" value="${[10, 100, 1000, 10000].indexOf(mbps)}" id="w-tr-speed" aria-label="回線速度">
            </div>
            <div class="w-slider-row">
              <span class="w-slider-val" style="min-width:6.5em">効率 ${eff}%</span>
              <input type="range" min="50" max="100" step="10" value="${eff}" id="w-tr-eff" aria-label="伝送効率">
            </div>
            <p class="w-result">伝送時間 = ${mb.toLocaleString()}Mバイト × 8 ÷ (${mbps.toLocaleString()}Mbps × ${eff / 100})
              = <span style="color:var(--accent)">${sec >= 100 ? Math.round(sec).toLocaleString() : sec.toFixed(1)} 秒</span></p>
            <p class="widget-note">ポイントは「バイトをビットに直す(×8)」こと。回線速度はビット/秒、データ量はバイトで出題されることが多いので、単位をそろえてから割り算します。</p>`;
          el.querySelector('#w-tr-size').addEventListener('input', (e) => { mb = Number(e.target.value); paint(); });
          el.querySelector('#w-tr-speed').addEventListener('input', (e) => { mbps = [10, 100, 1000, 10000][Number(e.target.value)]; paint(); });
          el.querySelector('#w-tr-eff').addEventListener('input', (e) => { eff = Number(e.target.value); paint(); });
        }
        paint();
      },
    },

    // ---- EVMシミュレータ ----
    evm: {
      render(el) {
        let pv = 100, ev = 80, ac = 90;
        function judge(v, good, bad) { return v >= 0 ? good : bad; }
        function paint() {
          const sv = ev - pv, cv = ev - ac;
          const spi = pv ? ev / pv : 0, cpi = ac ? ev / ac : 0;
          const bar = (label, v, col) => `
            <div class="w-bar-row"><span class="w-bar-label">${label}</span>
              <span class="w-bar"><span style="width:${Math.min(100, v / 2)}%;background:${col}"></span></span>
              <span class="w-bar-val">${v}万円</span></div>`;
          el.innerHTML = `
            <p class="widget-title">EVMシミュレータ: 計画・出来高・実コストを動かして、進捗とコストを判定しよう</p>
            ${['pv', 'ev', 'ac'].map((k) => `
              <div class="w-slider-row">
                <span class="w-slider-val" style="min-width:3em">${k.toUpperCase()}</span>
                <input type="range" min="0" max="200" step="10" value="${{ pv, ev, ac }[k]}" data-k="${k}" aria-label="${k.toUpperCase()}">
              </div>`).join('')}
            ${bar('PV 計画価値', pv, 'var(--ink-3)')}${bar('EV 出来高', ev, 'var(--accent)')}${bar('AC 実コスト', ac, 'var(--gold)')}
            <div class="w-lamps">
              <div class="w-lamp ${sv < 0 ? 'lit' : ''}"><span class="wl-name">SV = EV−PV</span><span class="wl-val">${sv}</span></div>
              <div class="w-lamp ${cv < 0 ? 'lit' : ''}"><span class="wl-name">CV = EV−AC</span><span class="wl-val">${cv}</span></div>
              <div class="w-lamp ${spi < 1 ? 'lit' : ''}"><span class="wl-name">SPI = EV÷PV</span><span class="wl-val">${spi.toFixed(2)}</span></div>
              <div class="w-lamp ${cpi < 1 ? 'lit' : ''}"><span class="wl-name">CPI = EV÷AC</span><span class="wl-val">${cpi.toFixed(2)}</span></div>
            </div>
            <p class="w-result">進捗: <span style="color:${sv >= 0 ? 'var(--ok)' : 'var(--ng)'}">${judge(sv, sv === 0 ? '計画どおり' : '前倒し', '遅れ')}</span>
              ・ コスト: <span style="color:${cv >= 0 ? 'var(--ok)' : 'var(--ng)'}">${judge(cv, cv === 0 ? '予算どおり' : '予算内', '予算超過')}</span></p>
            <p class="widget-note">どれも「EV(実際に終わった仕事の価値)」が主役。SV・CVはマイナス、SPI・CPIは1未満なら黄色に光ります。</p>`;
          el.querySelectorAll('input[data-k]').forEach((inp) => {
            inp.addEventListener('input', () => {
              const v = Number(inp.value);
              if (inp.dataset.k === 'pv') pv = v; else if (inp.dataset.k === 'ev') ev = v; else ac = v;
              paint();
            });
          });
        }
        paint();
      },
    },

    // ---- パリティチェック: 受信したビットを反転させて、誤りを見つけられるか試す ----
    parity: {
      render(el) {
        let data = [1, 0, 1, 1, 0, 0, 1];
        let recv = null;
        const code = () => data.concat(data.reduce((p, b) => p ^ b, 0)); // 偶数パリティ
        function paint() {
          const sent = code();
          if (!recv) recv = sent.slice();
          const flips = recv.filter((b, i) => b !== sent[i]).length;
          const ones = recv.reduce((n, b) => n + b, 0);
          const ok = ones % 2 === 0;
          const bit = (b, i, cls, label) => `<button class="w-bit ${b ? 'on' : ''} ${cls}" data-i="${i}"><small>${label}</small><b>${b}</b></button>`;
          let verdict;
          if (!ok) verdict = `<span style="color:var(--ok)">1が${ones}個(奇数) → 誤りを検出!</span>`;
          else if (flips === 0) verdict = `1が${ones}個(偶数) → 誤りなし`;
          else verdict = `<span style="color:var(--ng)">1が${ones}個(偶数) → 誤りなしと判定…でも実は${flips}ビット反転している(見逃し)</span>`;
          el.innerHTML = `
            <p class="widget-title">パリティチェック: 通信の途中でビットが反転したら、受け取った側は気づけるか試そう</p>
            <p class="w-row-label">送る側(データ7ビットをタップで変更。最後の1ビットは偶数パリティで自動的に決まる)</p>
            <div class="w-bits" data-row="send">
              ${sent.map((b, i) => bit(b, i, i === 7 ? 'is-parity' : '', i === 7 ? 'パリティ' : `D${i + 1}`)).join('')}
            </div>
            <p class="w-row-label">受け取った側(タップすると、そのビットがノイズで反転する)</p>
            <div class="w-bits" data-row="recv">
              ${recv.map((b, i) => bit(b, i, b !== sent[i] ? 'is-flip' : '', b !== sent[i] ? '反転!' : (i === 7 ? 'パリティ' : `D${i + 1}`))).join('')}
            </div>
            <p class="w-result">${verdict}</p>
            <button class="btn-mini" data-reset>ノイズを消す</button>
            <p class="widget-note">1ビットだけ反転させると必ず見つかります。2ビット反転させると偶数に戻ってしまい、見逃すことを確かめてみましょう。どのビットが反転したかも分からないので、パリティでは訂正はできません。</p>`;
          el.querySelectorAll('[data-row="send"] .w-bit').forEach((btn) => {
            btn.addEventListener('click', () => {
              const i = Number(btn.dataset.i);
              if (i === 7) return;
              data[i] ^= 1;
              recv = null;
              paint();
            });
          });
          el.querySelectorAll('[data-row="recv"] .w-bit').forEach((btn) => {
            btn.addEventListener('click', () => { recv[Number(btn.dataset.i)] ^= 1; paint(); });
          });
          el.querySelector('[data-reset]').addEventListener('click', () => { recv = null; paint(); });
        }
        paint();
      },
    },

    // ---- SQL実行ラボ: 用意したSQLを選んで、行の絞込みと結果を見る ----
    sql: {
      render(el) {
        const HEAD = ['商品番号', '商品名', '分類', '価格'];
        const DATA = [
          [101, 'メロンパン', 'パン', 180], [102, 'カレーパン', 'パン', 220], [103, '食パン', 'パン', 350],
          [201, '緑茶', '飲料', 150], [202, 'コーヒー', '飲料', 400],
          [301, 'ショートケーキ', '菓子', 480], [302, 'ロールケーキ', '菓子', 1200], [303, 'クッキー', '菓子', 600],
        ];
        const price = (r) => r[3];
        const avg = (rows) => rows.reduce((n, r) => n + price(r), 0) / rows.length;
        const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
        const groupsOf = (rows) => {
          const g = new Map();
          rows.forEach((r) => { if (!g.has(r[2])) g.set(r[2], []); g.get(r[2]).push(r); });
          return [...g.entries()];
        };
        const overall = avg(DATA);
        const Q = [
          {
            label: 'WHERE で行を絞る',
            sql: 'SELECT *\nFROM 商品\nWHERE 価格 >= 400',
            keep: (r) => price(r) >= 400,
            result: (rows) => ({ head: HEAD, rows }),
            note: 'WHERE は1行ずつ条件を調べ、合う行だけを残します(関係演算の「選択」)。',
          },
          {
            label: '列を選んで並べ替え',
            sql: "SELECT 商品名, 価格\nFROM 商品\nWHERE 分類 = 'パン'\nORDER BY 価格 DESC",
            keep: (r) => r[2] === 'パン',
            result: (rows) => ({ head: ['商品名', '価格'], rows: rows.slice().sort((a, b) => price(b) - price(a)).map((r) => [r[1], r[3]]) }),
            note: 'SELECT の後ろに書いた列だけが残り(射影)、ORDER BY … DESC で価格の高い順(降順)に並びます。',
          },
          {
            label: 'GROUP BY で集計',
            sql: 'SELECT 分類, COUNT(*), AVG(価格)\nFROM 商品\nGROUP BY 分類',
            group: true,
            result: (rows) => ({ head: ['分類', 'COUNT(*)', 'AVG(価格)'], rows: groupsOf(rows).map(([k, g]) => [k, g.length, fmt(avg(g))]) }),
            note: 'GROUP BY で分類ごとにまとめ、グループごとに件数と平均を1行で返します。色がグループを表しています。',
          },
          {
            label: 'HAVING でグループを絞る',
            sql: 'SELECT 分類, AVG(価格)\nFROM 商品\nGROUP BY 分類\nHAVING AVG(価格) >= 260',
            group: true,
            keepGroup: (g) => avg(g) >= 260,
            result: (rows) => ({ head: ['分類', 'AVG(価格)'], rows: groupsOf(rows).filter(([, g]) => avg(g) >= 260).map(([k, g]) => [k, fmt(avg(g))]) }),
            note: 'HAVING は、まとめたあとの「グループ」に条件をかけます。平均250円のパンのグループが外れました。1行ずつ調べる WHERE との違いに注目。',
          },
          {
            label: 'LIKE であいまい検索',
            sql: "SELECT 商品名\nFROM 商品\nWHERE 商品名 LIKE '%ケーキ'",
            keep: (r) => r[1].endsWith('ケーキ'),
            result: (rows) => ({ head: ['商品名'], rows: rows.map((r) => [r[1]]) }),
            note: "% は0文字以上の任意の文字列。'%ケーキ' は「ケーキで終わる」という意味です。",
          },
          {
            label: '副問合せ',
            sql: 'SELECT 商品名, 価格\nFROM 商品\nWHERE 価格 > (SELECT AVG(価格)\n              FROM 商品)',
            keep: (r) => price(r) > overall,
            result: (rows) => ({ head: ['商品名', '価格'], rows: rows.map((r) => [r[1], r[3]]) }),
            note: `かっこの中の SELECT(副問合せ)が先に実行され、全商品の平均 ${fmt(overall)}円 が求まります。それより高い商品だけが残ります。`,
          },
        ];
        let qi = 0;
        const table = (head, rows, rowCls) => `
          <div class="lesson-table-wrap"><table class="lesson-table w-sql-table">
            <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.length ? rows.map((r, i) => `<tr class="${rowCls ? rowCls(i) : ''}">${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
              : `<tr><td colspan="${head.length}">(該当なし)</td></tr>`}</tbody>
          </table></div>`;
        function paint() {
          const q = Q[qi];
          const kept = q.keep ? DATA.filter(q.keep) : DATA;
          const gIndex = new Map(groupsOf(DATA).map(([k], i) => [k, i]));
          const groupOk = new Map(groupsOf(DATA).map(([k, g]) => [k, !q.keepGroup || q.keepGroup(g)]));
          const cls = (i) => {
            const r = DATA[i];
            if (q.group) return `g${gIndex.get(r[2])}${groupOk.get(r[2]) ? '' : ' is-out'}`;
            return q.keep(r) ? 'is-hit' : 'is-out';
          };
          const res = q.result(kept);
          el.innerHTML = `
            <p class="widget-title">SQL実行ラボ: SQLを選んで、どの行が残り、どんな結果になるか見てみよう</p>
            <div class="w-sql-tabs">${Q.map((x, i) => `<button class="w-sql-tab ${i === qi ? 'on' : ''}" data-q="${i}">${x.label}</button>`).join('')}</div>
            <pre class="lesson-code w-sql-code">${q.sql}</pre>
            <p class="w-row-label">元の表「商品」${q.group ? '(色 = グループ)' : '(色付き = 条件に合う行)'}</p>
            ${table(HEAD, DATA, cls)}
            <p class="w-row-label">実行結果</p>
            ${table(res.head, res.rows)}
            <p class="widget-note">${q.note}</p>`;
          el.querySelectorAll('.w-sql-tab').forEach((btn) => {
            btn.addEventListener('click', () => { qi = Number(btn.dataset.q); paint(); });
          });
        }
        paint();
      },
    },

    // ---- 索引の威力: データ件数と探す回数 ----
    'index-power': {
      render(el) {
        let e = 6;
        const jp = (n) => (n >= 1e8 ? `${Math.round(n / 1e7) / 10}億`
          : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}万` : Math.round(n).toLocaleString());
        function paint() {
          const n = 10 ** e;
          const lin = n / 2;
          const idx = Math.ceil(Math.log2(n));
          el.innerHTML = `
            <p class="widget-title">索引の威力: データの件数を増やして、探す回数を比べてみよう</p>
            <div class="w-slider-row">
              <span class="w-slider-val" style="min-width:6em">${jp(n)}件</span>
              <input type="range" min="3" max="8" step="1" value="${e}" id="w-ix" aria-label="データの件数">
            </div>
            <div class="w-bar-row"><span class="w-bar-label">端から順に探す</span>
              <span class="w-bar"><span style="width:100%;background:var(--gold)"></span></span>
              <span class="w-bar-val" style="width:auto;min-width:7.5em">平均 ${jp(lin)}回</span></div>
            <div class="w-bar-row"><span class="w-bar-label">索引で絞り込む</span>
              <span class="w-bar"><span style="width:${Math.max(0.8, (idx / lin) * 100)}%;background:var(--accent)"></span></span>
              <span class="w-bar-val" style="width:auto;min-width:7.5em">約 ${idx}回</span></div>
            <p class="w-result">索引を使うと、比べる回数は <span style="color:var(--accent)">約${jp(lin / idx)}分の1</span></p>
            <p class="widget-note">件数が10倍になると、端から探す回数も10倍になりますが、索引で「半分ずつ絞り込む」回数は3〜4回増えるだけです。実際のB+木は1回の読込みで数百の枝から選べるので、1億件でも数回の読込みで目的の行にたどり着けます。</p>`;
          el.querySelector('#w-ix').addEventListener('input', (ev) => { e = Number(ev.target.value); paint(); });
        }
        paint();
      },
    },

    // ---- 網羅チェッカー: テストケースを選んで、どの網羅基準を満たすか確かめる ----
    coverage: {
      render(el) {
        const CASES = [[1, 1], [1, 0], [0, 1], [0, 0]]; // [A > 0, B > 0]
        const sel = new Set([0]);
        const tf = (v) => (v ? '真' : '偽');
        function paint() {
          const chosen = [...sel].map((i) => CASES[i]);
          const dec = chosen.map(([a, b]) => a && b);
          const stmt = dec.some((d) => d);
          const branch = stmt && dec.some((d) => !d);
          const cond = [0, 1].every((k) => chosen.some((c) => c[k]) && chosen.some((c) => !c[k]));
          const crit = [
            ['命令網羅', stmt], ['判定条件網羅', branch], ['条件網羅', cond],
            ['判定条件/条件網羅', branch && cond], ['複数条件網羅', sel.size === 4],
          ];
          el.innerHTML = `
            <p class="widget-title">網羅チェッカー: テストケースを選んで、どの網羅基準を満たすか確かめよう</p>
            <pre class="lesson-code w-sql-code">if (A > 0 and B > 0) then\n    X ← 1\nend if</pre>
            <p class="w-row-label">テストケース(タップで選ぶ・外す)</p>
            <div class="w-sql-tabs">${CASES.map(([a, b], i) => `
              <button class="w-sql-tab ${sel.has(i) ? 'on' : ''}" data-c="${i}">A>0: ${tf(a)} / B>0: ${tf(b)} → 判定 ${tf(a && b)}</button>`).join('')}
            </div>
            <div class="w-lamps">${crit.map(([name, ok]) => `
              <div class="w-lamp ${ok ? 'is-ok' : ''}"><span class="wl-name">${name}</span><span class="wl-val">${ok ? '満たす' : '—'}</span></div>`).join('')}
            </div>
            <p class="w-result">${sel.size}ケース選択中${cond && !branch ? ' <span style="color:var(--ng)">… 条件網羅は満たすのに、X ← 1 が一度も実行されない!</span>' : ''}</p>
            <p class="widget-note">「A>0: 真 / B>0: 偽」と「A>0: 偽 / B>0: 真」の2つだけを選ぶと、条件網羅は満たしても判定条件網羅は満たさないことが分かります。4つすべて選ぶと複数条件網羅です。</p>`;
          el.querySelectorAll('[data-c]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const i = Number(btn.dataset.c);
              if (sel.has(i)) sel.delete(i); else sel.add(i);
              paint();
            });
          });
        }
        paint();
      },
    },
  };

  function html(id) {
    if (!REG[id]) return '';
    return `<div class="widget" data-widget="${id}">
      <span class="widget-tag">さわって学ぶ</span>
      <div class="widget-body"></div>
    </div>`;
  }

  function init(root) {
    root.querySelectorAll('[data-widget]').forEach((w) => {
      const r = REG[w.dataset.widget];
      if (r) r.render(w.querySelector('.widget-body'));
    });
  }

  return { html, init };
})();
