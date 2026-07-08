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
                  <span class="wl-val">${v ? '💡 1' : '0'}</span>
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
            <div class="w-out">🔒 ${enc(text, shift) || '(文字を入力してね)'}</div>
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
  };

  function html(id) {
    if (!REG[id]) return '';
    return `<div class="widget" data-widget="${id}">
      <span class="widget-tag">🖐 さわって学ぶ</span>
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
