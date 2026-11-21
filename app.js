'use strict';
/* WCA Graphs – statistik ur World Cube Associations öppna API.
   Överst: ren logik (testas i test/kor.mjs). Nederst: DOM och grafer. */
const APP_VERSION = 3;
const API = 'https://www.worldcubeassociation.org/api/v0';
const DEFAULT_ID = '2019AIRA01';

const EVENTS = [['333', '3x3'], ['222', '2x2'], ['444', '4x4'], ['555', '5x5'], ['666', '6x6'], ['777', '7x7'],
  ['333bf', '3x3 blind'], ['333fm', 'Fewest moves'], ['333oh', '3x3 enhand'], ['clock', 'Clock'], ['minx', 'Megaminx'],
  ['pyram', 'Pyraminx'], ['skewb', 'Skewb'], ['sq1', 'Square-1'], ['444bf', '4x4 blind'], ['555bf', '5x5 blind'],
  ['333mbf', 'Multiblind'], ['333ft', '3x3 med fötter'], ['magic', 'Magic'], ['mmagic', 'Master Magic'], ['333mbo', 'Multiblind (gammal)']];
const EVENT_NAME = Object.fromEntries(EVENTS);
const ROUND_ORDER = '0h1d2e3gbcf';
const ROUND_NAME = { 0: 'Kval', h: 'Kval', 1: 'Runda 1', d: 'Runda 1', 2: 'Runda 2', e: 'Runda 2', 3: 'Semifinal', g: 'Runda 3', b: 'B-final', c: 'Final', f: 'Final' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAY = 86400000;

/* ---------- format ---------- */
function fmtCs(cs) {
  if (cs < 6000) return (cs / 100).toFixed(2);
  const m = Math.floor(cs / 6000), ss = ((cs - m * 6000) / 100).toFixed(2).padStart(5, '0');
  return m < 60 ? m + ':' + ss : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + ss;
}
function fmtMbf(v) {
  const s = String(v);
  let solved, attempted, t;
  if (s.length === 10 && s[0] === '1') { solved = 99 - +s.slice(1, 3); attempted = +s.slice(3, 5); t = +s.slice(5); }
  else { const p = s.padStart(9, '0'), missed = +p.slice(7); solved = 99 - +p.slice(0, 2) + missed; attempted = solved + missed; t = +p.slice(2, 7); }
  const tid = t === 99999 ? '' : ' ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  return solved + '/' + attempted + tid;
}
// v är WCA:s råvärde: hundradelar, -1 = DNF, -2 = DNS, 0 = inget resultat
function fmt(v, ev, kind) {
  if (v === -1) return 'DNF';
  if (v === -2) return 'DNS';
  if (!v || v < 0) return '–';
  if (ev === '333fm') return kind === 'average' ? (v / 100).toFixed(2) : String(v);
  if (ev === '333mbf' || ev === '333mbo') return fmtMbf(v);
  return fmtCs(v);
}
// Värdet som ritas på y-axeln: sekunder, eller drag för fewest moves
const num = (v, ev, kind) => ev === '333fm' && kind !== 'average' ? v : v / 100;
const isTime = ev => ev !== '333fm';
const chartable = ev => ev !== '333mbf' && ev !== '333mbo';
function fmtAxis(v, ev, minutes) {
  v = +v.toFixed(2);
  if (!isTime(ev) || !minutes) return String(v);
  const m = Math.floor(v / 60), s = +(v - m * 60).toFixed(2);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return +dd + ' ' + MONTHS[+m - 1] + ' ' + y;
}
const flag = iso => /^[A-Z]{2}$/.test(iso || '') ? String.fromCodePoint(...[...iso].map(c => 0x1F1A5 + c.charCodeAt(0))) : '';

/* ---------- data ---------- */
function eventsOf(results) {
  const n = {};
  for (const r of results) n[r.event_id] = (n[r.event_id] || 0) + 1;
  const order = EVENTS.map(e => e[0]);
  return Object.keys(n).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map(id => ({ id, name: EVENT_NAME[id] || id, rounds: n[id] }));
}

// Alla rundor i en gren, äldst först, med löpande personbästa
function rounds(results, comps, ev) {
  const cm = new Map(comps.map(c => [c.id, c]));
  const rs = results.filter(r => r.event_id === ev).map(r => {
    const c = cm.get(r.competition_id) || {};
    return { compId: r.competition_id, comp: c.name || r.competition_id, city: c.city || '', date: c.start_date || '', type: r.round_type_id,
      pos: r.pos, best: r.best, average: r.average, attempts: (r.attempts || []).filter(a => a !== 0) };
  });
  const ro = t => ROUND_ORDER.indexOf(t);
  rs.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.compId !== b.compId ? (a.compId < b.compId ? -1 : 1) : ro(a.type) - ro(b.type));
  let ps = Infinity, pa = Infinity, prev = null, k = 0;
  for (const r of rs) {
    k = r.compId === prev ? k + 1 : 0; prev = r.compId;
    r.t = Date.parse(r.date + 'T00:00:00Z') + k * DAY / 4;   // rundor samma tävling hamnar intill varandra
    r.pbSingle = r.best > 0 && r.best < ps; if (r.pbSingle) ps = r.best;
    r.pbAvg = r.average > 0 && r.average < pa; if (r.pbAvg) pa = r.average;
    r.curSingle = ps === Infinity ? 0 : ps; r.curAvg = pa === Infinity ? 0 : pa;
  }
  return rs;
}

function cutoff(months, today) {
  if (!months) return '';
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
const inPeriod = (rs, months, today) => { const c = cutoff(months, today); return rs.filter(r => r.date >= c); };

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const solves = rs => rs.flatMap(r => r.attempts.filter(a => a > 0));
const dnfs = rs => rs.reduce((n, r) => n + r.attempts.filter(a => a === -1).length, 0);

function yearly(rs) {
  const by = new Map();
  for (const r of rs) { const y = r.date.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(r); }
  return [...by].map(([year, l]) => {
    const ok = solves(l), dnf = dnfs(l), avgs = l.map(r => r.average).filter(a => a > 0);
    return { year, rounds: l.length, solves: ok.length, dnf, median: median(ok), best: ok.length ? Math.min(...ok) : 0, bestAvg: avgs.length ? Math.min(...avgs) : 0 };
  });
}

function niceStep(raw, time) {
  if (!(raw > 0)) return 1;
  if (time && raw > 7.5) return [10, 15, 30, 60, 120, 300, 600, 1200, 3600].find(s => s >= raw) || 3600;
  const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function axis(lo, hi, n, time) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep((hi - lo) / n, time), r = v => +v.toFixed(6);
  const a = r(Math.floor(lo / step + 1e-9) * step), b = r(Math.ceil(hi / step - 1e-9) * step), ticks = [];
  for (let v = a; v <= b + step / 1e3; v = r(v + step)) ticks.push(v);
  return { lo: a, hi: b, step, ticks };
}
const LOG_TICKS = [.5, .7, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 3600];
// Logaritmisk axel: lika stor förbättring i procent ger lika stort steg. null om spannet är för litet för att det ska löna sig.
function logAxis(lo, hi) {
  if (!(lo > 0) || hi / lo < 1.8) return null;
  const a = lo * 0.94, b = hi * 1.06, ticks = LOG_TICKS.filter(t => t >= a && t <= b);
  return ticks.length < 3 ? null : { lo: a, hi: b, ticks };
}
// Enstaka mycket långsamma försök samlas i en sista stapel (over), annars hamnar allt annat i en enda
function histogram(vals, time) {
  if (!vals.length) return { step: 1, bins: [] };
  const s = [...vals].sort((x, y) => x - y), lo = s[0], max = s[s.length - 1];
  const cap = s[Math.floor((s.length - 1) * 0.95)] * 1.3, hi = max > cap ? s.filter(v => v <= cap).pop() : max;
  const step = niceStep((hi - lo) / 14 || 1, time), start = Math.floor(lo / step + 1e-9) * step;
  const n = Math.floor((hi - start) / step + 1e-9) + 1, bins = Array.from({ length: n }, (_, i) => ({ from: +(start + i * step).toFixed(6), n: 0 }));
  if (max > hi) bins.push({ from: +(start + n * step).toFixed(6), n: 0, over: true });
  for (const v of vals) bins[v > hi ? n : Math.min(n - 1, Math.floor((v - start) / step + 1e-9))].n++;
  return { step, bins };
}

// Grenarna sorterade efter placering, bäst först. kind: single/average, region: country/continent/world.
// Grenar utan resultat av den sorten hamnar sist med rank 0.
function rankList(pr, events, kind, region) {
  return events.map(e => { const x = (pr[e.id] || {})[kind]; return { id: e.id, name: e.name, rank: x ? x[region + '_rank'] || 0 : 0, best: x ? x.best : 0 }; })
    .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
}

var WCA = { rankList, fmt, fmtCs, fmtMbf, fmtAxis, fmtDate, num, rounds, eventsOf, inPeriod, cutoff, median, yearly, niceStep, axis, logAxis, histogram, flag };

/* ================= DOM ================= */
if (typeof document !== 'undefined') (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tal = n => Number(n).toLocaleString('sv-SE');
  const today = new Date().toISOString().slice(0, 10);
  const LS = 'wca-graphs';
  const store = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* privat läge: appen fungerar ändå */ } };
  const st = { id: (new URLSearchParams(location.search).get('id') || store.id || DEFAULT_ID).toUpperCase(), ev: store.ev || '333',
    months: store.months || 0, xmode: store.xmode || 'runda', scale: store.scale || 'log', rkind: store.rkind || 'average', rregion: store.rregion || 'country', dots: store.dots !== false };
  let data = null, rsAll = [], rs = [];

  /* ---------- hämtning ---------- */
  const get = async path => { const r = await fetch(API + path); if (!r.ok) throw new Error(r.status); return r.json(); };
  async function load(id) {
    $('#status').hidden = false; $('#status').innerHTML = 'Hämtar ' + esc(id) + ' från WCA …'; $('#content').hidden = true;
    try {
      const [p, results, comps] = await Promise.all([get('/persons/' + id), get('/persons/' + id + '/results'), get('/persons/' + id + '/competitions')]);
      data = { p, results, comps, events: eventsOf(results) };
      st.id = id; store.id = id;
      store.recent = [{ id, name: p.person.name }, ...(store.recent || []).filter(x => x.id !== id)].slice(0, 6);
      save();
      history.replaceState(null, '', id === DEFAULT_ID ? location.pathname : '?id=' + id);
      if (!data.events.some(e => e.id === st.ev)) st.ev = (data.events.slice().sort((a, b) => b.rounds - a.rounds)[0] || {}).id || '333';
      $('#status').hidden = true; $('#content').hidden = false;
      render();
    } catch (e) {
      $('#status').innerHTML = (e.message === '404' ? 'Hittar ingen profil med id ' + esc(id) + '.' : 'Kunde inte hämta data från WCA.') +
        ' <button class="btn" id="retry">Försök igen</button> <button class="btn" id="other">Byt profil</button>';
      $('#retry').onclick = () => load(id); $('#other').onclick = openPicker;
    }
  }

  /* ---------- rendering ---------- */
  function render() {
    const { p } = data, per = p.person, m = p.medals || {};
    document.title = per.name + ' – WCA Graphs';
    $('#profile').innerHTML = (per.avatar && !per.avatar.is_default ? `<img class="avatar" src="${esc(per.avatar.thumb_url)}" alt="">` : '<div class="avatar"></div>') +
      `<div class="who"><h1>${esc(per.name)}</h1><p>${flag(per.country_iso2)} <a href="${esc(per.url)}" target="_blank" rel="noopener">${esc(per.wca_id)}</a> · ${tal(p.competition_count)} tävlingar · ${tal(p.total_solves || 0)} lösningar` +
      (m.total ? ` · ${m.gold} guld, ${m.silver} silver, ${m.bronze} brons` : '') + '</p></div>';
    $('#events').innerHTML = data.events.map(e => `<button class="chip" data-ev="${e.id}" aria-pressed="${e.id === st.ev}">${esc(e.name)} <span>${e.rounds}</span></button>`).join('');
    for (const [id, key] of [['#period', 'months'], ['#xmode', 'xmode'], ['#scale', 'scale'], ['#rkind', 'rkind'], ['#rregion', 'rregion']])
      for (const b of $(id).children) b.setAttribute('aria-pressed', String(st[key]) === b.dataset.v);
    $('#dots').checked = st.dots;
    rsAll = rounds(data.results, data.comps, st.ev);
    rs = inPeriod(rsAll, st.months, today);
    rs.forEach((r, i) => { r.k = i; });
    tiles(); charts(); tables();
  }

  function tiles() {
    const ev = st.ev, pr = (data.p.personal_records || {})[ev] || {}, iso = data.p.person.country_iso2;
    const rank = x => x ? `${esc(iso)} ${tal(x.country_rank)} · världen ${tal(x.world_rank)}` : 'inget resultat än';
    const all = rsAll.flatMap(r => r.attempts), dnf = dnfs(rsAll);
    const last = [...rsAll].reverse().find(r => r.average > 0) || rsAll[rsAll.length - 1];
    const lastKind = last && last.average > 0 ? 'average' : 'single', lastV = last ? (lastKind === 'average' ? last.average : last.best) : 0;
    const pb = lastKind === 'average' ? pr.average : pr.single;
    const diff = last && pb && lastV > 0 && chartable(ev) ? (lastV === pb.best ? 'personbästa' : '+' + fmt(lastV - pb.best, ev, lastKind) + ' mot PB') : '';
    const t = (label, value, sub) => `<div class="tile"><div class="tl">${label}</div><div class="tv">${value}</div><div class="ts">${sub}</div></div>`;
    $('#tiles').innerHTML =
      t('Personbästa, enskilt', pr.single ? fmt(pr.single.best, ev, 'single') : '–', rank(pr.single)) +
      t('Personbästa, snitt', pr.average ? fmt(pr.average.best, ev, 'average') : '–', rank(pr.average)) +
      t('Försök i tävling', tal(all.length), `${tal(rsAll.length)} rundor · ${dnf} DNF (${all.length ? (dnf / all.length * 100).toFixed(1).replace('.', ',') : 0} %)`) +
      t(lastKind === 'average' ? 'Senaste snitt' : 'Senaste resultat', last ? fmt(lastV, ev, lastKind) : '–', last ? `${esc(last.comp)}, ${fmtDate(last.date)}${diff ? ' · ' + diff : ''}` : '');
  }

  /* ---------- grafer ---------- */
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14 + w > innerWidth ? x - w - 14 : x + 14)) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  function hideTip() { tip.hidden = true; document.querySelectorAll('.xh').forEach(e => { e.style.display = 'none'; }); }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.plot svg')) hideTip(); });
  addEventListener('scroll', hideTip, { passive: true });

  function hover(el, pts, html) {
    const svg = $('svg', el), xh = $('.xh', svg);
    if (!svg || !pts.length) return;
    const move = e => {
      const b = svg.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
      const dmin = Math.min(...pts.map(p => Math.abs(p.x - px)));
      // flera rundor samma dag ligger nästan på samma x: välj då den som är närmast i höjdled
      const p = pts.filter(q => Math.abs(q.x - px) <= dmin + 5).sort((a, c) => Math.abs((a.y ?? py) - py) - Math.abs((c.y ?? py) - py))[0];
      if (xh) { xh.setAttribute('x1', p.x); xh.setAttribute('x2', p.x); xh.style.display = 'block'; }
      showTip(html(p), e.clientX, e.clientY);
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
  }

  const geom = (el, m) => ({ W: el.clientWidth, H: el.clientHeight, l: m.l, r: el.clientWidth - m.r, t: m.t, b: el.clientHeight - m.b });
  const open = (g, label) => `<svg width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="${esc(label)}">`;
  const f1 = v => +v.toFixed(1);
  function yScale(g, vals, ev, zero, log) {
    const la = log && st.scale === 'log' ? logAxis(Math.min(...vals), Math.max(...vals)) : null, tr = la ? Math.log : v => v;
    const a = la || axis(zero ? 0 : Math.min(...vals), Math.max(...vals), g.b - g.t < 180 ? 3 : 5, isTime(ev)), minutes = a.hi >= 60;
    const y = v => f1(g.b - (tr(v) - tr(a.lo)) / (tr(a.hi) - tr(a.lo)) * (g.b - g.t));
    const svg = a.ticks.map(v => `<line class="grid" x1="${g.l}" x2="${g.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${g.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmtAxis(v, ev, minutes)}</text>`).join('');
    return { y, svg };
  }
  function xScale(g, list, mode) {
    const n = list.length, ticks = [];
    let x;
    if (mode === 'runda' || n < 2 || list[0].t === list[n - 1].t) {
      x = r => f1(n < 2 ? (g.l + g.r) / 2 : g.l + (g.r - g.l) * r.k / (n - 1));
      let y = '';
      for (const r of list) if (r.date.slice(0, 4) !== y) { y = r.date.slice(0, 4); ticks.push({ x: x(r), label: y }); }
    } else {
      const t0 = list[0].t, t1 = list[n - 1].t, pad = (t1 - t0) * 0.02;
      const sx = t => f1(g.l + (g.r - g.l) * (t - t0 + pad) / (t1 - t0 + 2 * pad));
      x = r => sx(r.t);
      const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear(), byMonth = t1 - t0 < 540 * DAY;
      for (let y = y0; y <= y1 + 1; y++) for (let m = 0; m < 12; m += byMonth ? 1 : 12) {
        const t = Date.UTC(y, m, 1);
        if (t >= t0 - pad && t <= t1 + pad) ticks.push({ x: sx(t), label: m ? MONTHS[m] : String(y) });
      }
    }
    let last = -99;
    const svg = ticks.filter(t => t.x - last >= 36 && (last = t.x, true)).map(t => `<line class="tick" x1="${t.x}" x2="${t.x}" y1="${g.b}" y2="${g.b + 5}"/><text class="ax" x="${t.x}" y="${g.b + 18}" text-anchor="middle">${t.label}</text>`).join('');
    return { x, svg: svg + `<line class="base" x1="${g.l}" x2="${g.r}" y1="${g.b}" y2="${g.b}"/>` };
  }
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join('');
  const empty = (el, text) => { el.innerHTML = `<p class="empty">${text}</p>`; };
  // Värdeetiketter i högermarginalen; krockar de visas bara den första
  function endLabels(g, items) {
    let prev = null;
    return items.filter(i => i).map(i => { if (prev !== null && Math.abs(i.y - prev) < 14) return ''; prev = i.y; return `<text class="end" x="${g.r + 12}" y="${i.y + 4}">${i.text}</text>`; }).join('');
  }

  function chartRounds() {
    const el = $('#c-rounds'), ev = st.ev;
    if (!chartable(ev)) return empty(el, 'Multiblind visas bara i tabellerna – resultatet är poäng och tid i ett.');
    if (!rs.length) return empty(el, 'Inga rundor i vald period.');
    const g = geom(el, { l: 46, r: 58, t: 12, b: 28 }), xs = xScale(g, rs, st.xmode);
    const vals = rs.flatMap(r => [r.best > 0 ? num(r.best, ev, 'single') : null, r.average > 0 ? num(r.average, ev, 'average') : null,
      ...(st.dots ? r.attempts.filter(a => a > 0).map(a => num(a, ev, 'single')) : [])]).filter(v => v !== null);
    if (!vals.length) return empty(el, 'Inga giltiga resultat i vald period.');
    const ys = yScale(g, vals, ev, false, true), small = rs.length > 30 && g.W < 600 ? 3 : 4;
    const A = rs.filter(r => r.average > 0).map(r => ({ x: xs.x(r), y: ys.y(num(r.average, ev, 'average')), pb: r.pbAvg, r }));
    const B = rs.filter(r => r.best > 0).map(r => ({ x: xs.x(r), y: ys.y(num(r.best, ev, 'single')), pb: r.pbSingle, r }));
    const dots = st.dots ? rs.map(r => r.attempts.filter(a => a > 0).map(a => `<circle class="att" cx="${xs.x(r)}" cy="${ys.y(num(a, ev, 'single'))}" r="2.2"/>`).join('')).join('') : '';
    // Hundratals rundor: då ritas bara linjen och personbästa, annars blir punkterna en matta
    const dense = (g.r - g.l) / rs.length < 8;
    const line = (pts, c) => `<path class="ln ${c}${dense ? ' thin' : ''}" d="${path(pts)}"/>` + pts.map(p => (p.pb ? `<circle class="pb ${c}" cx="${p.x}" cy="${p.y}" r="${small + 4}"/>` : '') + (dense && !p.pb ? '' : `<circle class="mk ${c}" cx="${p.x}" cy="${p.y}" r="${small}"/>`)).join('');
    const la = A[A.length - 1], lb = B[B.length - 1];
    el.innerHTML = open(g, 'Snitt och bästa försök per runda') + ys.svg + xs.svg + dots + line(B, 's2') + line(A, 's1') +
      endLabels(g, [la && { y: la.y, text: fmt(la.r.average, ev, 'average') }, lb && { y: lb.y, text: fmt(lb.r.best, ev, 'single') }]) +
      `<line class="xh" y1="${g.t}" y2="${g.b}"/></svg>`;
    hover(el, rs.map(r => ({ x: xs.x(r), y: r.average > 0 ? ys.y(num(r.average, ev, 'average')) : r.best > 0 ? ys.y(num(r.best, ev, 'single')) : g.b, r })), p => tipRound(p.r));
  }
  function attemptsText(r, ev) {
    const ok = r.attempts.filter(a => a > 0), trim = r.attempts.length === 5;
    const bi = r.attempts.indexOf(Math.min(...ok)), wi = r.attempts.findIndex(a => a < 0) >= 0 ? r.attempts.findIndex(a => a < 0) : r.attempts.indexOf(Math.max(...ok));
    return r.attempts.map((a, i) => trim && (i === bi || i === wi) ? '(' + fmt(a, ev, 'single') + ')' : fmt(a, ev, 'single')).join('  ');
  }
  const tipRound = r => `<b>${esc(r.comp)}</b><div class="tm">${fmtDate(r.date)} · ${ROUND_NAME[r.type] || 'Runda'} · plats ${r.pos}</div>` +
    `<div class="tr"><i class="k s1"></i>Snitt <b>${fmt(r.average, st.ev, 'average')}</b>${r.pbAvg ? ' <em>PB</em>' : ''}</div>` +
    `<div class="tr"><i class="k s2"></i>Bästa <b>${fmt(r.best, st.ev, 'single')}</b>${r.pbSingle ? ' <em>PB</em>' : ''}</div><div class="tm">${attemptsText(r, st.ev)}</div>`;

  function chartPb() {
    const el = $('#c-pb'), ev = st.ev;
    if (!chartable(ev)) return empty(el, 'Visas inte för multiblind.');
    const list = rs.filter(r => r.curSingle > 0);
    if (!list.length) return empty(el, 'Inga giltiga resultat i vald period.');
    const g = geom(el, { l: 46, r: 58, t: 12, b: 28 }), xs = xScale(g, rs, st.xmode);
    const ys = yScale(g, list.flatMap(r => [num(r.curSingle, ev, 'single'), ...(r.curAvg ? [num(r.curAvg, ev, 'average')] : [])]), ev, false, true);
    const step = (key, kind, flagKey, c) => {
      const pts = list.filter(r => r[key] > 0).map(r => ({ x: xs.x(r), y: ys.y(num(r[key], ev, kind)), pb: r[flagKey] }));
      if (!pts.length) return { svg: '', end: null };
      const d = pts.map((p, i) => i ? `H${p.x}V${p.y}` : `M${p.x} ${p.y}`).join('') + `H${g.r}`;
      return { svg: `<path class="ln ${c}" d="${d}"/>` + pts.filter(p => p.pb).map(p => `<circle class="mk ${c}" cx="${p.x}" cy="${p.y}" r="4"/>`).join(''), end: pts[pts.length - 1].y };
    };
    const a = step('curAvg', 'average', 'pbAvg', 's1'), b = step('curSingle', 'single', 'pbSingle', 's2'), lastR = list[list.length - 1];
    el.innerHTML = open(g, 'Personbästa över tid') + ys.svg + xs.svg + b.svg + a.svg +
      endLabels(g, [a.end !== null && { y: a.end, text: fmt(lastR.curAvg, ev, 'average') }, { y: b.end, text: fmt(lastR.curSingle, ev, 'single') }]) + `<line class="xh" y1="${g.t}" y2="${g.b}"/></svg>`;
    hover(el, list.map(r => ({ x: xs.x(r), r })), p => `<b>${fmtDate(p.r.date)}</b><div class="tm">${esc(p.r.comp)}</div>` +
      `<div class="tr"><i class="k s1"></i>PB snitt <b>${fmt(p.r.curAvg, ev, 'average')}</b>${p.r.pbAvg ? ' <em>nytt</em>' : ''}</div>` +
      `<div class="tr"><i class="k s2"></i>PB enskilt <b>${fmt(p.r.curSingle, ev, 'single')}</b>${p.r.pbSingle ? ' <em>nytt</em>' : ''}</div>`);
  }

  // Stående staplar: högst 24 px breda, rundad topp, 2 px luft mellan
  function columns(el, g, items, ys, label) {
    const band = (g.r - g.l) / items.length, w = Math.max(2, Math.min(24, band - 2)), y0 = ys.y(0);
    const pts = items.map((it, i) => ({ x: f1(g.l + band * (i + .5)), it }));
    const bars = pts.map(p => {
      const y = ys.y(p.it.v), h = y0 - y, r = Math.min(4, w / 2, h);
      return h <= 0 ? '' : `<path class="bar" d="M${f1(p.x - w / 2)} ${y0}V${f1(y + r)}q0 ${-r} ${r} ${-r}H${f1(p.x + w / 2 - r)}q${r} 0 ${r} ${r}V${y0}Z"/>` +
        (p.it.cap && band >= 34 ? `<text class="cap" x="${p.x}" y="${y - 5}" text-anchor="middle">${p.it.cap}</text>` : '');
    }).join('');
    el.innerHTML = open(g, label) + ys.svg + bars + `<line class="base" x1="${g.l}" x2="${g.r}" y1="${y0}" y2="${y0}"/>` + items.xsvg(pts, band) + '</svg>';
    return pts;
  }

  function chartYear() {
    const el = $('#c-year'), ev = st.ev;
    if (!chartable(ev)) return empty(el, 'Visas inte för multiblind.');
    const ys0 = yearly(rs).filter(y => y.solves);
    if (!ys0.length) return empty(el, 'Inga giltiga försök i vald period.');
    const g = geom(el, { l: 46, r: 12, t: 22, b: 28 });
    const items = ys0.map(y => ({ v: num(y.median, ev, 'average'), cap: fmt(Math.round(y.median), ev, ev === '333fm' ? 'single' : 'average'), y }));
    items.xsvg = pts => pts.map(p => `<text class="ax" x="${p.x}" y="${g.b + 18}" text-anchor="middle">${g.W < 420 && pts.length > 6 ? "'" + p.it.y.year.slice(2) : p.it.y.year}</text>`).join('');
    const pts = columns(el, g, items, yScale(g, items.map(i => i.v), ev, true), 'Mediantid per år');
    hover(el, pts, p => { const y = p.it.y; return `<b>${y.year}</b><div class="tr">Median <b>${p.it.cap}</b></div><div class="tr">Bästa försök <b>${fmt(y.best, ev, 'single')}</b></div>` +
      `<div class="tr">Bästa snitt <b>${fmt(y.bestAvg, ev, 'average')}</b></div><div class="tm">${y.solves} giltiga försök · ${y.dnf} DNF · ${y.rounds} rundor</div>`; });
  }

  function chartHist() {
    const el = $('#c-hist'), ev = st.ev;
    if (!chartable(ev)) return empty(el, 'Visas inte för multiblind.');
    const vals = solves(rs).map(a => num(a, ev, 'single'));
    if (!vals.length) return empty(el, 'Inga giltiga försök i vald period.');
    const h = histogram(vals, isTime(ev)), g = geom(el, { l: 46, r: 12, t: 22, b: 28 });
    const over = h.bins[h.bins.length - 1].over, hi = h.bins[h.bins.length - 1].from + h.step, minutes = hi >= 60, items = h.bins.map(b => ({ v: b.n, b }));
    items.xsvg = (pts, band) => { let last = -99; return h.bins.map((b, i) => ({ x: f1(g.l + band * i), v: b.from, over: b.over })).concat(over ? [] : { x: g.r, v: hi })
      .filter(t => t.x - last >= 38 && (last = t.x, true)).map(t => `<line class="tick" x1="${t.x}" x2="${t.x}" y1="${g.b}" y2="${g.b + 5}"/><text class="ax" x="${t.x}" y="${g.b + 18}" text-anchor="${t.over ? 'start' : 'middle'}">${fmtAxis(t.v, ev, minutes)}${t.over ? '+' : ''}</text>`).join(''); };
    const pts = columns(el, g, items, yScale(g, items.map(i => i.v).concat(4), '333fm', true), 'Fördelning av alla försök');
    const unit = isTime(ev) ? (minutes ? '' : ' s') : ' drag';
    hover(el, pts, p => `<b>${p.it.b.over ? fmtAxis(p.it.b.from, ev, minutes) + unit + ' eller mer' : fmtAxis(p.it.b.from, ev, minutes) + '–' + fmtAxis(p.it.b.from + h.step, ev, minutes) + unit}</b><div class="tr">${p.it.b.n} försök (${Math.round(p.it.b.n / vals.length * 100)} %)</div>`);
  }

  function charts() {
    $('#lg-dots').hidden = !st.dots;
    $('#ev-name').textContent = EVENT_NAME[st.ev] || st.ev;
    chartRounds(); chartPb(); chartYear(); chartHist();
  }

  /* ---------- tabeller ---------- */
  function tables() {
    const iso = data.p.person.country_iso2, pr = data.p.personal_records || {};
    const per = data.p.person, kind = st.rkind;
    let land = per.country_iso2;
    try { land = new Intl.DisplayNames('sv', { type: 'region' }).of(per.country_iso2); } catch (e) { /* äldre webbläsare: landskoden duger */ }
    const kont = { _Europe: 'Europa', _Asia: 'Asien', _Africa: 'Afrika', '_North America': 'Nordamerika', '_South America': 'Sydamerika', _Oceania: 'Oceanien' }[(per.country || {}).continent_id] || 'Kontinenten';
    const var_ = { country: 'i ' + land, continent: 'i ' + kont, world: 'i världen' }[st.rregion];
    $('#rregion').children[0].textContent = land; $('#rregion').children[1].textContent = kont;
    const list = rankList(pr, data.events, kind, st.rregion), max = Math.max(1, ...list.map(r => r.rank)), top = list[0];
    $('#rank-sum').textContent = top && top.rank ? `Starkast ${var_}: ${top.name}, plats ${tal(top.rank)} (${kind === 'average' ? 'snitt' : 'enskilt'}).` : 'Inga rankade resultat än.';
    $('#t-events').innerHTML = list.map((r, i) => `<button class="rk${r.id === st.ev ? ' on' : ''}" data-ev="${r.id}"><span class="rn">${r.rank ? i + 1 : ''}</span><span class="re">${esc(r.name)}</span>` +
      `<span class="rb">${r.rank ? `<i style="width:${Math.max(1.5, r.rank / max * 100).toFixed(1)}%"></i>` : ''}</span><b class="rr">${r.rank ? tal(r.rank) : '–'}</b><span class="rt">${r.rank ? fmt(r.best, r.id, kind) : ''}</span></button>`).join('');
    const ev = st.ev, pb = on => on ? ' <em>PB</em>' : '';
    $('#t-rounds').innerHTML = '<thead><tr><th>Datum</th><th>Tävling</th><th>Runda</th><th class="n">Plats</th><th class="n">Bästa</th><th class="n">Snitt</th><th>Försök</th></tr></thead><tbody>' +
      ([...rs].reverse().map(r => `<tr><td class="nw">${fmtDate(r.date)}</td><td>${esc(r.comp)}</td><td class="nw">${ROUND_NAME[r.type] || ''}</td><td class="n">${r.pos}</td>` +
        `<td class="n nw">${fmt(r.best, ev, 'single')}${pb(r.pbSingle)}</td><td class="n nw">${fmt(r.average, ev, 'average')}${pb(r.pbAvg)}</td><td class="nw att">${attemptsText(r, ev)}</td></tr>`).join('') ||
        '<tr><td colspan="7">Inga rundor i vald period.</td></tr>') + '</tbody>';
  }

  /* ---------- kontroller ---------- */
  const set = (k, v) => { st[k] = v; store[k] = v; save(); render(); };
  $('#events').onclick = e => { const b = e.target.closest('[data-ev]'); if (b) set('ev', b.dataset.ev); };
  $('#t-events').onclick = e => { const b = e.target.closest('[data-ev]'); if (b) { set('ev', b.dataset.ev); scrollTo({ top: 0, behavior: 'smooth' }); } };
  $('#period').onclick = e => { const b = e.target.closest('button'); if (b) set('months', +b.dataset.v); };
  $('#xmode').onclick = e => { const b = e.target.closest('button'); if (b) set('xmode', b.dataset.v); };
  $('#rkind').onclick = e => { const b = e.target.closest('button'); if (b) set('rkind', b.dataset.v); };
  $('#rregion').onclick = e => { const b = e.target.closest('button'); if (b) set('rregion', b.dataset.v); };
  $('#scale').onclick = e => { const b = e.target.closest('button'); if (b) set('scale', b.dataset.v); };
  $('#dots').onchange = e => set('dots', e.target.checked);
  let lastW = innerWidth, raf = 0;
  addEventListener('resize', () => { if (innerWidth === lastW || !data) return; lastW = innerWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { hideTip(); charts(); }); });

  /* ---------- byt profil ---------- */
  const dlg = $('#picker'), q = $('#q'), hits = $('#hits');
  const row = (id, name, iso) => `<button class="hit" data-id="${esc(id)}"><b>${esc(name)}</b><span>${flag(iso)} ${esc(id)}</span></button>`;
  function openPicker() { q.value = ''; listRecent(); dlg.showModal(); q.focus(); }
  function listRecent() {
    const rec = store.recent || [];
    hits.innerHTML = (rec.length ? '<p class="hint">Senast visade</p>' + rec.map(r => row(r.id, r.name, '')).join('') : '') +
      '<p class="hint">Sök på namn, eller skriv ett WCA-id (t.ex. 2019AIRA01).</p>';
  }
  let timer = 0, seq = 0;
  q.oninput = () => {
    clearTimeout(timer);
    const s = q.value.trim();
    if (s.length < 2) return listRecent();
    if (/^\d{4}[a-z]{4}\d{2}$/i.test(s)) { hits.innerHTML = row(s.toUpperCase(), 'Öppna profilen', ''); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      hits.innerHTML = '<p class="hint">Söker …</p>';
      try {
        const r = await get('/search/users?persons_table=true&q=' + encodeURIComponent(s));
        if (mine !== seq) return;
        const list = (r.result || []).filter(u => u.wca_id).slice(0, 20);
        hits.innerHTML = list.map(u => row(u.wca_id, u.name, u.country_iso2)).join('') || '<p class="hint">Ingen träff.</p>';
      } catch (e) { if (mine === seq) hits.innerHTML = '<p class="hint">Sökningen misslyckades.</p>'; }
    }, 300);
  };
  hits.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { dlg.close(); load(b.dataset.id); } };
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
  $('#change').onclick = openPicker;
  $('#close').onclick = () => dlg.close();
  $('#ver').textContent = 'v' + APP_VERSION;

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
  load(st.id);
})();
