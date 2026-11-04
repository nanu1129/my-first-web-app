// カレンダーへの登録: 受験日・申込期間・毎日の学習時刻(通知つき)を、.ics ファイルや Googleカレンダーのリンクにする
const Cal = (() => {
  const SITE = 'https://nanu1129.github.io/my-first-web-app/ap-study/';
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (s) => s.replace(/-/g, ''); // '2027-02-06' → '20270206'
  const nextDay = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(y, m - 1, d + 1);
    return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
  };
  const utcStamp = (t) => {
    const d = new Date(t);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  // 毎日の学習の時刻(端末間で同期する)
  function studyTime() { return Store.pref('studyTime', '20:00'); }
  function setStudyTime(v) { if (/^\d{2}:\d{2}$/.test(v)) Store.setPref('studyTime', v); }

  // 登録する予定の一覧
  function events() {
    const a = Plan.examDate(), b = Plan.examBDate();
    const sc = Plan.scheduleOf(a);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const list = [];
    if (sc && sc.apply[1] >= todayStr) {
      list.push({ id: 'apply-start', date: sc.apply[0], title: `応用情報 申込開始(${sc.name})`, desc: 'CBTの会場と日時を予約します。早めに申し込むと、希望の日時を選びやすくなります。', alarms: ['-PT15H'] });
      list.push({ id: 'apply-end', date: sc.apply[1], title: `応用情報 申込締切(${sc.name})`, desc: '申込みと受験日時の予約の締切です。', alarms: ['-P6DT15H', '-PT15H'] });
    }
    list.push({ id: 'exam-a', date: a, title: '応用情報技術者試験 科目A(CBT)', desc: '予約した会場と時刻を確認しよう。本人確認書類を忘れずに。', alarms: ['-P6DT15H', '-PT15H'] });
    list.push({ id: 'exam-b', date: b, title: '応用情報技術者試験 科目B(CBT)', desc: '問1(情報セキュリティ)は必須。選んだ分野の問題から解こう。', alarms: ['-P6DT15H', '-PT15H'] });
    return list.filter((e) => e.date >= todayStr);
  }
  // 毎日の学習: 次の学習時刻から、科目Bの日まで毎日
  function daily() {
    const [hh, mm] = studyTime().split(':').map(Number);
    const start = new Date();
    start.setHours(hh, mm, 0, 0);
    if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 1);
    const [y, m, d] = Plan.examBDate().split('-').map(Number);
    const until = new Date(y, m - 1, d, 23, 59, 59);
    const local = (t) => `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
    const end = new Date(start.getTime() + 30 * 60000);
    return { start: local(start), end: local(end), until, untilDate: `${y}${pad(m)}${pad(d)}` };
  }

  // ---- .ics(RFC 5545)----
  const escText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  // 1行75バイトで折り返す(日本語の文字の途中では切らない)
  function fold(line) {
    const enc = new TextEncoder();
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      const limit = out.length ? 74 : 75; // 続きの行は先頭の空白1バイトを含めて75バイト
      if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch;
      bytes += n;
    }
    out.push(cur);
    return out.map((l, i) => (i ? ` ${l}` : l)).join('\r\n');
  }
  function ics() {
    const stamp = utcStamp(Date.now());
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//manabit//ap-study//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:JST', 'END:STANDARD', 'END:VTIMEZONE'];
    const alarm = (trigger, text) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
    events().forEach((e) => {
      L.push('BEGIN:VEVENT', `UID:manabit-${e.id}-${ymd(e.date)}@nanu1129.github.io`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`,
        `SUMMARY:${escText(e.title)}`, `DESCRIPTION:${escText(`${e.desc}\n${SITE}`)}`, 'TRANSP:TRANSPARENT');
      e.alarms.forEach((t) => L.push(...alarm(t, e.title)));
      L.push('END:VEVENT');
    });
    const dl = daily();
    L.push('BEGIN:VEVENT', 'UID:manabit-daily-study@nanu1129.github.io', `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tokyo:${dl.start}`, `DTEND;TZID=Asia/Tokyo:${dl.end}`, `RRULE:FREQ=DAILY;UNTIL=${utcStamp(dl.until)}`,
      `SUMMARY:${escText('マナビットで学習(今日のメニュー)')}`, `DESCRIPTION:${escText(`今日のメニューを上から順に。\n${SITE}`)}`, `URL:${SITE}`,
      ...alarm('PT0M', 'マナビットで学習する時間です'), 'END:VEVENT');
    L.push('END:VCALENDAR');
    return `${L.map(fold).join('\r\n')}\r\n`;
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics()], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'manabit-schedule.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- Googleカレンダーの「予定を作成」リンク ----
  function google(e) {
    const u = new URL('https://calendar.google.com/calendar/render');
    u.searchParams.set('action', 'TEMPLATE');
    u.searchParams.set('text', e.title);
    u.searchParams.set('details', `${e.desc}\n${SITE}`);
    if (e.recur) {
      u.searchParams.set('dates', `${e.start}/${e.end}`);
      u.searchParams.set('ctz', 'Asia/Tokyo');
      u.searchParams.set('recur', e.recur);
    } else {
      u.searchParams.set('dates', `${ymd(e.date)}/${nextDay(e.date)}`);
    }
    return u.toString();
  }
  function googleLinks() {
    const links = events().map((e) => ({ label: { 'apply-start': '申込開始', 'apply-end': '申込締切', 'exam-a': '科目A', 'exam-b': '科目B' }[e.id], href: google(e) }));
    const dl = daily();
    links.push({ label: '毎日の学習', href: google({ title: 'マナビットで学習(今日のメニュー)', desc: '今日のメニューを上から順に。', start: dl.start, end: dl.end, recur: `RRULE:FREQ=DAILY;UNTIL=${dl.untilDate}` }) });
    return links;
  }

  return { ics, download, googleLinks, events, studyTime, setStudyTime };
})();
