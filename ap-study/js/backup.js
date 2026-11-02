// 学習記録のファイル(書き出し・共有・読み込み)。成績タブのバックアップと、同期パネルの「記録を送る」で共用する
const Backup = (() => {
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const json = () => JSON.stringify(Store.snapshot(), null, 1);

  // ファイルとして保存する(PCではダウンロード)
  function download() {
    const name = `manabit-backup-${stamp()}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return name;
  }

  // スマホでは共有シート(AirDrop・LINE・メール・ファイルに保存など)で送る。使えない環境ではダウンロードする。
  // Androidの共有は .json を受け付けないため、中身は同じまま .txt として渡す
  async function share() {
    const file = new File([json()], `manabit-backup-${stamp()}.txt`, { type: 'text/plain' });
    if (navigator.canShare && navigator.share) {
      let ok = false;
      try { ok = navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
      if (ok) {
        try {
          await navigator.share({ files: [file], title: 'マナビットの学習記録' });
          return { how: 'shared', name: file.name };
        } catch (e) {
          if (e && e.name === 'AbortError') return { how: 'cancelled' };
        }
      }
    }
    return { how: 'downloaded', name: download() };
  }

  // 読み込んで、今の記録に統合する(上書きしない)
  function read(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          Store.importState(JSON.parse(r.result));
          resolve();
        } catch (e) {
          reject(e instanceof SyntaxError ? new Error('マナビットの記録ファイルではありません') : e);
        }
      };
      r.onerror = () => reject(new Error('ファイルを読めませんでした'));
      r.readAsText(file);
    });
  }

  return { download, share, read };
})();
