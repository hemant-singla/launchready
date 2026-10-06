// Tests for recovery options, decisions and reset (src/recovery.js, src/demo.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.js';
import { computeAll, STATUS_ORDER } from '../src/engine.js';
import { allocate } from '../src/supply.js';
import { SCENARIOS } from '../src/scenarios.js';
import { applyLab } from '../src/lab.js';
import { applyActions, computeWith, recoveryOptions } from '../src/recovery.js';
import { initialDemo, decide } from '../src/demo.js';

const base = await loadData();
const original = computeAll(base);
const usb = SCENARIOS.usbDelay.apply(base);
const status = (r, id) => r.models.find((m) => m.id === id).status;
const statuses = (r) => r.models.map((m) => `${m.id}:${m.status}`);

test('recovery: inventory is never allocated twice, including after recovery actions', () => {
  const rec = recoveryOptions(original, usb);
  for (const opt of rec.options) {
    const { data } = applyActions(usb, [opt]);
    const { lines, sources } = allocate(data);
    for (const s of sources) {
      const used = lines.flatMap((l) => l.allocations).filter((a) => a.source === s.id).reduce((n, a) => n + a.qty, 0);
      assert.ok(used <= s.qty, `${opt.title}: ${s.id} gave ${used} of ${s.qty}`);
      assert.ok(s.remaining >= 0);
    }
    // the re-pegged units come out of the source order, not out of thin air
    if (opt.type === 'transfer') {
      const total = (d) => d.deliveries.filter((x) => x.part === opt.part).reduce((n, x) => n + x.qty, 0);
      assert.equal(total(data), total(usb));
    }
  }
});

test('recovery: missing or rejected deliveries are never used as supply', () => {
  for (const d of [SCENARIOS.missingDate.apply(base), SCENARIOS.competing.apply(base)]) {
    const rec = recoveryOptions(original, d);
    for (const o of [...rec.options, ...rec.considered].filter((x) => x.type === 'transfer')) {
      const src = d.deliveries.find((x) => x.id === o.from);
      assert.ok(src.eta && src.status !== 'rejected', o.from);
    }
    const { sources } = allocate(d);
    assert.ok(!sources.some((s) => s.id === 'DL-TCO-02' && d.deliveries.find((x) => x.id === 'DL-TCO-02').eta === null));
  }
  // with the date missing, nothing restores the Halo launches: escalate instead
  const rec = recoveryOptions(original, SCENARIOS.missingDate.apply(base));
  assert.equal(rec.options.length, 0);
  assert.match(rec.escalation, /Escalate/);
});

test('recovery: a substitute adds the driver change before testing and validation inside testing', () => {
  const d = applyLab(base, { delivery: 'DL-UC3-01', mode: 'delay', delay: 34 });
  const sub = computeAll(d, { useSubstituteFor: ['Volga-X'] }).chipsets['Volga-X'].eta;
  const noValidation = structuredClone(d);
  noValidation.substitutes[0].validationDays = [0, 0];
  const plain = computeAll(noValidation, { useSubstituteFor: ['Volga-X'] }).chipsets['Volga-X'].eta;
  assert.equal(sub.testStart, '2026-11-13');       // planned 12 Nov + 1 day driver change (best case)
  assert.equal(sub.testStartLatest, '2026-11-26'); // + 14 days (worst case)
  assert.equal(sub.testStart, plain.testStart);
  // validation of 2-4 days moves both ends of the ready range
  assert.ok(sub.early > plain.early && sub.late > plain.late);
});

test('recovery: partial recovery does not mark a launch ready', () => {
  // move only 10 of the 20 late UC-300 units: Halo 77 must stay at risk
  const { result } = computeWith(usb, [{ type: 'transfer', from: 'DL-UC3-04', part: 'UC-300', qty: 10, toChipset: 'Volga-X', arrive: '2026-10-31' }]);
  assert.equal(status(result, 'HAL-77'), 'at-risk');
  // and an option that leaves a gap reports it
  const rec = recoveryOptions(original, usb);
  for (const o of rec.options) if (o.remaining.length) assert.ok(o.models.some((m) => m.after !== 'ready'), o.title);
});

test('recovery: options are tested, ranked, and never hurt another launch', () => {
  const rec = recoveryOptions(original, usb);
  assert.deepEqual(rec.affected.models, ['HAL-77']);
  assert.equal(rec.recommended.title, 'Move 20 UC-300 from DL-UC3-04 to Volga-X');
  assert.equal(rec.recommended.models[0].after, 'ready');
  for (const o of rec.options) {
    const { result } = computeWith(usb, o.type === 'substitute' ? [{ type: 'substitute', chipset: o.chipset }] : [o]);
    const now = computeAll(usb);
    for (const m of result.models) {
      if (m.id === 'HAL-77') continue;
      assert.ok(STATUS_ORDER[m.status] <= STATUS_ORDER[status(now, m.id)], `${o.title} hurts ${m.id}`);
    }
  }
  // two launches, one part: a later launch helps only one Zenith at a time, so escalate the rest
  const comp = recoveryOptions(original, SCENARIOS.competing.apply(base));
  assert.ok(comp.options.every((o) => o.type === 'moveLaunch' && o.days <= base.config.maxLaunchMoveDays));
  assert.ok(comp.escalation);
});

test('scenario combinations give the same result in any order', () => {
  const keys = Object.keys(SCENARIOS);
  const a = computeAll(keys.reduce((d, k) => SCENARIOS[k].apply(d), base));
  const b = computeAll([...keys].reverse().reduce((d, k) => SCENARIOS[k].apply(d), base));
  assert.deepEqual(statuses(a), statuses(b));
  // and each combined effect is at least as bad as each scenario alone
  for (const k of keys) {
    const one = computeAll(SCENARIOS[k].apply(base));
    for (const m of one.models) assert.ok(STATUS_ORDER[status(a, m.id)] >= STATUS_ORDER[m.status], `${k} ${m.id}`);
  }
});

test('approving changes the demo state, rejecting does not, reset restores the baseline', () => {
  const rec = recoveryOptions(original, usb);
  const opt = rec.recommended;
  let demo = initialDemo();
  demo = decide(demo, opt, false, 'Nothing changed');
  assert.equal(demo.actions.length, 0);
  assert.equal(demo.log.at(-1).decision, 'rejected');
  assert.deepEqual(statuses(computeWith(usb, demo.actions).result), statuses(computeAll(usb)));
  demo = decide(demo, opt, true);
  assert.equal(demo.actions.length, 1);
  assert.equal(demo.log.length, 2);
  assert.equal(status(computeWith(usb, demo.actions).result, 'HAL-77'), 'ready');
  // after approval, the agent has nothing left to fix for this disruption
  assert.equal(recoveryOptions(original, usb, demo.actions).affected.models.length, 0);
  // reset: empty demo on the original data = the original plan
  const reset = initialDemo();
  assert.deepEqual(statuses(computeWith(base, reset.actions).result), statuses(original));
  assert.deepEqual(reset, { actions: [], log: [] });
});
