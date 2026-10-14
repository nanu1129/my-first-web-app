// 学習の順序: Udemy講座(科目A講座)の順か、サイト標準(試験範囲の並び)か。
// 並びを変えるだけで、ユニットのIDや記録には影響しない
const Order = (() => {
  const MODES = { udemy: 'Udemy講座の順', site: 'サイト標準(試験範囲の順)' };
  const DAY = 86400000;

  function mode() { return AP.udemy ? Store.pref('courseOrder', 'udemy') : 'site'; }
  function setMode(m) { Store.setPref('courseOrder', m); }
  const active = () => mode() === 'udemy';

  // 全ユニットを学習順に並べる
  function units() {
    const base = AP.lessons.flatMap((l) => l.units);
    if (!active()) return base;
    const byId = new Map(base.map((u) => [u.id, u]));
    const ordered = AP.udemy.sections.flatMap((s) => (s.units || []).map((id) => byId.get(id)).filter(Boolean));
    return ordered.concat(base.filter((u) => !ordered.includes(u))); // 対応表にないユニットは最後に
  }
  function partIdOf(unitId) {
    const l = AP.lessons.find((x) => x.units.some((u) => u.id === unitId));
    return l ? l.partId : null;
  }
  function unitsOfPart(partId) { return units().filter((u) => partIdOf(u.id) === partId); }
  // パートの並び: 学習順で最初に出てくる順
  function parts() {
    if (!active()) return AP.parts;
    const first = (p) => units().findIndex((u) => partIdOf(u.id) === p.id);
    return AP.parts.slice().sort((a, b) => first(a) - first(b));
  }
  function sectionOf(unitId) {
    return (AP.udemy && AP.udemy.sections.find((s) => (s.units || []).includes(unitId))) || null;
  }

  // 講座の視聴チェック(セクション番号 → チェックした時刻)。端末間で同期する
  function watched() { return Store.pref('udemyWatched', {}) || {}; }
  function setWatched(no, on) {
    const w = Object.assign({}, watched());
    if (on) w[no] = Date.now(); else delete w[no];
    Store.setPref('udemyWatched', w);
  }
  const sameDay = (t) => !!t && new Date(t).toDateString() === new Date().toDateString();
  // 次に取り組む過去問(まだ解説を見ていない回)と、直近の過去問の状況
  function pastStatus() {
    const w = watched();
    const past = AP.udemy.sections.filter((s) => s.kind === 'past');
    const times = past.map((s) => w[s.no]).filter(Boolean);
    const last = times.length ? Math.max(...times) : 0;
    return {
      next: past.find((s) => !w[s.no]) || null,
      done: times.length, total: past.length,
      today: sameDay(last), recent: last && Date.now() - last < 3 * DAY,
    };
  }

  return { MODES, mode, setMode, active, units, unitsOfPart, parts, partIdOf, sectionOf, watched, setWatched, pastStatus, sameDay };
})();
