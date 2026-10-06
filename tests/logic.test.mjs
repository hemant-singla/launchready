// Tests for the core logic, including the three demo scenarios.
// Run: npm test  (uses Node's built-in test runner, no installs needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.js';
import { computeAll } from '../src/engine.js';
import { allocate } from '../src/supply.js';
import { softwareEta, teamBacklog } from '../src/software.js';
import { substituteCheck } from '../src/substitute.js';
import { SCENARIOS, reassignDelivery, moveLaunch } from '../src/scenarios.js';
import { addDays, daysBetween } from '../src/dates.js';

const base = await loadData();
const model = (r, id) => r.models.find((m) => m.id === id);
const count = (r, s) => r.models.filter((m) => m.status === s).length;

test('dataset is internally consistent', () => {
  assert.equal(base.models.length, 16);
  assert.equal(base.chipsets.length, 8);
  const chips = new Set(base.chipsets.map((c) => c.id));
  const parts = new Set(base.parts.map((p) => p.id));
  for (const m of base.models) assert.ok(chips.has(m.chipset), m.id);
  for (const b of base.bom) assert.ok(parts.has(b.part), b.part);
  for (const d of base.deliveries) assert.ok(parts.has(d.part), d.id);
  for (const s of base.stock) assert.ok(s.allocated <= s.onHand, `${s.part} ${s.warehouse}`);
  for (const t of base.tickets) assert.ok(chips.has(t.chipset) && base.teams.some((x) => x.id === t.team), t.id);
  // Indus-M is shared by Aurora and Lumen.
  assert.deepEqual([...new Set(base.models.filter((m) => m.chipset === 'Indus-M').map((m) => m.line))].sort(), ['Aurora', 'Lumen']);
});

test('baseline: 12 ready, 4 at risk, none blocked', () => {
  const r = computeAll(base);
  assert.equal(count(r, 'ready'), 12);
  assert.equal(count(r, 'at-risk'), 4);
  assert.equal(count(r, 'blocked'), 0);
});

test('allocation never hands out more than a source holds (no double allocation)', () => {
  for (const data of [base, ...Object.values(SCENARIOS).map((s) => s.apply(base))]) {
    const { lines, sources } = allocate(data);
    const used = {};
    for (const l of lines) for (const a of l.allocations) used[a.source] = (used[a.source] ?? 0) + a.qty;
    for (const s of sources) assert.ok((used[s.id] ?? 0) <= s.qty, `${s.id} over-allocated`);
    for (const l of lines) assert.equal(l.allocations.reduce((n, a) => n + a.qty, 0) + l.shortfall, l.qty, l.id);
  }
});

test('rejected and undated deliveries are never counted', () => {
  const d = SCENARIOS.missingDate.apply(base);
  const { sources } = allocate(d);
  assert.ok(!sources.some((s) => s.id === 'DL-TCO-02'));
  assert.ok(!sources.some((s) => s.id === 'DL-WM6-00')); // rejected in the base data
});

test('software ETA range uses the ticket backlog and team capacity', () => {
  // Rhine-M Audio: 1 critical (3-14) + 2 major (2-7) + 1 minor (1-3) = 8..31 days / capacity 2 = 4..16
  const b = teamBacklog(base, 'Rhine-M');
  assert.deepEqual(b.Audio, { tickets: 4, days: [4, 16] });
  const eta = softwareEta(base, 'Rhine-M');
  assert.equal(eta.late, addDays(base.config.asOf, 16));
  assert.ok(eta.early <= eta.late);
});

test('a late code submission pushes the test start (Indus-L display code)', () => {
  const eta = softwareEta(base, 'Indus-L', { boardsReadyDate: '2026-10-15' });
  assert.equal(eta.testStart, '2026-11-05'); // expected 2 Nov + 3 days bring-up
  assert.equal(model(computeAll(base), 'LUM-65').status, 'at-risk');
});

test('a chipset with code of unknown date is blocked, not guessed', () => {
  const d = structuredClone(base);
  d.submissions.find((s) => s.chipset === 'Volga-X' && s.team === 'Audio').expectedOn = null;
  const r = computeAll(d);
  assert.equal(model(r, 'HAL-77').software.status, 'blocked');
});

test('scenario 1: USB controller delay puts Halo 77 at risk through late testing', () => {
  const d = SCENARIOS.usbDelay.apply(base);
  const r = computeAll(d);
  const halo = model(r, 'HAL-77');
  assert.equal(halo.status, 'at-risk');
  assert.equal(r.chipsets['Volga-X'].eta.testStart, '2026-12-08'); // 26 days late
  assert.ok(halo.eta.late > addDays(halo.launchDate, -base.config.bufferDays));
  assert.ok(halo.eta.early <= halo.launchDate);
  // Nothing else changes status.
  const before = computeAll(base);
  for (const m of r.models) if (m.id !== 'HAL-77') assert.equal(m.status, model(before, m.id).status, m.id);
});

test('scenario 1 options: move stock, substitute, or move the date', () => {
  const d = SCENARIOS.usbDelay.apply(base);
  // Option A: move 20 UC-300 from the Indus-L delivery (arrives 9 Nov) to Volga-X.
  const moved = computeAll(reassignDelivery(d, 'DL-UC3-02', 20, 'Volga-X'));
  assert.equal(model(moved, 'HAL-77').status, 'ready');
  assert.equal(model(moved, 'LUM-65').supply.status, 'ready'); // Indus-L still covered
  // Option B: approved substitute: boards on time, but a 1-14 day driver change first.
  const sub = substituteCheck(d, 'Volga-X');
  assert.equal(sub.possible, true);
  assert.equal(sub.substitutes[0].part, 'UC-310');
  assert.deepEqual(sub.testStart, ['2026-11-13', '2026-11-26']);
  const halo = sub.models.find((m) => m.model === 'HAL-77');
  assert.ok(halo.after.eta[1] < halo.before.eta[1]); // latest date improves
  // Option C: move the launch a week.
  const later = computeAll(moveLaunch(d, 'HAL-77', '2027-01-25'));
  assert.equal(model(later, 'HAL-77').software.status, 'ready');
});

test('scenario 2: two launches competing for MLD-2; earlier launch served first, no double count', () => {
  const r = computeAll(SCENARIOS.competing.apply(base));
  assert.equal(model(r, 'ZEN-55').supply.status, 'ready');
  assert.equal(model(r, 'ZEN-65').supply.status, 'ready');
  assert.equal(model(r, 'ZEN-75').status, 'blocked');
  assert.equal(model(r, 'ZEN-85').status, 'blocked');
  const mld = r.lines.filter((l) => l.part === 'MLD-2');
  const fromStock = mld.flatMap((l) => l.allocations).filter((a) => a.source === 'STOCK:MLD-2').reduce((n, a) => n + a.qty, 0);
  assert.equal(fromStock, 5500); // all free stock used exactly once
});

test('scenario 3: a delivery with no date is flagged, not assumed', () => {
  const r = computeAll(SCENARIOS.missingDate.apply(base));
  for (const id of ['HAL-55', 'HAL-65', 'HAL-77']) {
    const m = model(r, id);
    assert.equal(m.supply.status, 'at-risk', id);
    assert.match(m.supply.reasons.join(' '), /DL-TCO-02.*no confirmed date/);
  }
});

test('substitute check refuses when no substitute is approved', () => {
  const r = substituteCheck(SCENARIOS.competing.apply(base), 'Rhine-L');
  assert.equal(r.possible, false);
});

test('scenarios never modify the original data', () => {
  const snapshot = JSON.stringify(base);
  for (const s of Object.values(SCENARIOS)) s.apply(base);
  reassignDelivery(base, 'DL-UC3-02', 20, 'Volga-X');
  assert.equal(JSON.stringify(base), snapshot);
});

test('date helpers', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2027-01-18', '2027-01-11'), 7);
});
