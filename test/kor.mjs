// node test/kor.mjs – testar logiken i app.js utan webbläsare
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), ctx);
const W = ctx.WCA;
let n = 0;
const test = (namn, fn) => { fn(); n++; console.log('ok  ' + namn); };
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

test('tider formateras som hos WCA', () => {
  assert.equal(W.fmt(918, '333', 'single'), '9.18');
  assert.equal(W.fmt(6000, '333', 'single'), '1:00.00');
  assert.equal(W.fmt(8345, '555', 'average'), '1:23.45');
  assert.equal(W.fmt(-1, '333', 'single'), 'DNF');
  assert.equal(W.fmt(-2, '333', 'single'), 'DNS');
  assert.equal(W.fmt(0, '333', 'average'), '–');
});

test('fewest moves: drag enskilt, hundradelar i snitt', () => {
  assert.equal(W.fmt(27, '333fm', 'single'), '27');
  assert.equal(W.fmt(2833, '333fm', 'average'), '28.33');
  assert.equal(W.num(27, '333fm', 'single'), 27);
  assert.equal(W.num(2833, '333fm', 'average'), 28.33);
});

test('multiblind avkodas', () => {
  assert.equal(W.fmt(900352002, '333mbf', 'single'), '11/13 58:40');
});

test('axeletiketter', () => {
  assert.equal(W.fmtAxis(12.5, '333', false), '12.5');
  assert.equal(W.fmtAxis(90, '555', true), '1:30');
  assert.equal(W.fmtAxis(65, '555', true), '1:05');
  assert.equal(W.fmtDate('2026-10-24'), '24 okt 2026');
});

const comps = [{ id: 'B', name: 'Beta', start_date: '2024-03-02' }, { id: 'A', name: 'Alfa', start_date: '2023-05-01' }];
const res = [
  { event_id: '333', competition_id: 'B', round_type_id: 'f', pos: 3, best: 900, average: 1300, attempts: [900, 1500, 1400, 1100, -1] },
  { event_id: '333', competition_id: 'B', round_type_id: '1', pos: 5, best: 1000, average: 1100, attempts: [1000, 1100, 1200, 1050, 1150] },
  { event_id: '333', competition_id: 'A', round_type_id: '1', pos: 9, best: 1200, average: 0, attempts: [1200, 1900, 0, 0, 0] },
  { event_id: '222', competition_id: 'A', round_type_id: '1', pos: 1, best: 300, average: 400, attempts: [300, 400, 500, 400, 400] },
];

test('rundor sorteras på datum och rundordning, PB följer med', () => {
  const rs = W.rounds(res, comps, '333');
  eq(rs.map(r => r.comp + r.type), ['Alfa1', 'Beta1', 'Betaf']);
  eq(rs.map(r => r.pbSingle), [true, true, true]);
  eq(rs.map(r => r.pbAvg), [false, true, false]);      // 0 = inget snitt är aldrig ett PB
  eq(rs.map(r => r.curAvg), [0, 1100, 1100]);
  eq(rs[0].attempts, [1200, 1900]);                    // nollor (ej gjorda försök) rensas
  assert.ok(rs[2].t > rs[1].t);                        // rundor samma dag får olika x
});

test('grenar i WCA:s ordning', () => {
  eq(W.eventsOf(res).map(e => e.id + ':' + e.rounds), ['333:3', '222:1']);
});

test('period', () => {
  assert.equal(W.cutoff(12, '2026-11-21'), '2025-11-21');
  const rs = W.rounds(res, comps, '333');
  assert.equal(W.inPeriod(rs, 0, '2024-06-01').length, 3);
  assert.equal(W.inPeriod(rs, 12, '2024-06-01').length, 2);
});

test('år: median, bästa och DNF', () => {
  const y = W.yearly(W.rounds(res, comps, '333'));
  eq(y.map(a => [a.year, a.rounds, a.solves, a.dnf, a.median, a.best, a.bestAvg]), [['2023', 1, 2, 0, 1550, 1200, 0], ['2024', 2, 9, 1, 1100, 900, 1100]]);
});

test('axel och histogram', () => {
  eq(W.axis(9.2, 18.7, 5, true).ticks, [8, 10, 12, 14, 16, 18, 20]);
  eq(W.axis(40, 130, 5, true).ticks, [30, 60, 90, 120, 150]);
  const h = W.histogram([9.1, 9.9, 10, 12.4, 15], true);
  assert.equal(h.step, 0.5);
  assert.equal(h.bins.length, 13);
  assert.equal(h.bins[0].n, 1); assert.equal(h.bins[2].n, 1); assert.equal(h.bins[12].n, 1);
  assert.equal(h.bins.reduce((s, b) => s + b.n, 0), 5);
});

test('histogram: ett extremt försök plattar inte till resten', () => {
  const vals = Array.from({ length: 40 }, (_, i) => 10 + i * 0.2).concat(95);
  const h = W.histogram(vals, true), sist = h.bins[h.bins.length - 1];
  assert.ok(h.step <= 1, 'steg ' + h.step);
  assert.equal(sist.over, true); assert.equal(sist.n, 1);
  assert.equal(h.bins.reduce((s, b) => s + b.n, 0), 41);
});

test('logaxel bara när spannet är stort', () => {
  assert.equal(W.logAxis(11, 15), null);
  eq(W.logAxis(9.2, 85).ticks, [10, 12, 15, 20, 25, 30, 40, 50, 60, 90]);
});

test('ranking: bäst placering först, grenar utan resultat sist', () => {
  const pr = { 333: { average: { best: 1162, country_rank: 183, world_rank: 18149 }, single: { best: 918, country_rank: 174, world_rank: 15606 } },
    sq1: { average: { best: 2358, country_rank: 95, world_rank: 5566 } }, 777: { single: { best: 30006, country_rank: 98, world_rank: 7410 } } };
  const ev = [{ id: '333', name: '3x3' }, { id: '777', name: '7x7' }, { id: 'sq1', name: 'Square-1' }];
  eq(W.rankList(pr, ev, 'average', 'country').map(r => r.id + ':' + r.rank), ['sq1:95', '333:183', '777:0']);
  eq(W.rankList(pr, ev, 'single', 'world').map(r => r.id + ':' + r.rank), ['777:7410', '333:15606', 'sq1:0']);
});

console.log(`\n${n} tester gick igenom`);
