// Tests for what-if edits and explanations (src/engine/lab.ts).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/data';
import { computeAll } from '../src/engine/compute';
import { SCENARIOS } from '../src/engine/scenarios';
import { applyLab, knockOn, substituteOptions, mainReason, type LabEdit } from '../src/engine/lab';
import type { ScenarioKey } from '../src/engine/scenarios';
import { model, status } from './helpers';

const base = loadData();
const before = computeAll(base);

test('lab: delaying DL-UC3-01 by 34 days matches the USB delay scenario', () => {
  const lab = computeAll(applyLab(base, { delivery: 'DL-UC3-01', mode: 'delay', delay: 34 }));
  const sc = computeAll(SCENARIOS.usbDelay.apply(base));
  assert.deepEqual(lab.models.map((m) => m.status), sc.models.map((m) => m.status));
  assert.equal(lab.chipsets['Volga-X'].eta.testStart, sc.chipsets['Volga-X'].eta.testStart);
});

test('lab: knock-on trail runs parts -> testing -> software -> launch', () => {
  const data = applyLab(base, { delivery: 'DL-UC3-01', mode: 'delay', delay: 34 });
  const fx = knockOn(before, computeAll(data), data);
  assert.deepEqual([...new Set(fx.map((e) => e.stage))], ['parts', 'testing', 'software', 'launch']);
  const halo = fx.find((e) => e.model === 'HAL-77');
  assert.match(halo?.text ?? '', /Ready → At risk/);
});

test('lab: rejecting a shipment and losing a date match their scenarios', () => {
  const cases: [LabEdit, ScenarioKey][] = [[{ delivery: 'DL-MLD-03', mode: 'reject' }, 'competing'], [{ delivery: 'DL-TCO-02', mode: 'nodate' }, 'missingDate']];
  for (const [lab, key] of cases) {
    const a = computeAll(applyLab(base, lab));
    const b = computeAll(SCENARIOS[key].apply(base));
    assert.deepEqual(a.models.map((m) => m.status), b.models.map((m) => m.status), key);
  }
});

test('lab: no change means no knock-on effects, and the original data is untouched', () => {
  const copy = structuredClone(base);
  const data = applyLab(base, { delivery: 'DL-UC3-01', mode: 'delay', delay: 0, model: 'HAL-77', shift: 0 });
  assert.equal(knockOn(before, computeAll(data), data).length, 0);
  applyLab(base, { delivery: 'DL-UC3-01', mode: 'reject', model: 'HAL-77', shift: 30 });
  assert.deepEqual(base, copy);
});

test('lab: substitute is offered only when test boards need it; main reason comes from the worst line', () => {
  assert.deepEqual(substituteOptions(before), []);
  const data = applyLab(base, { delivery: 'DL-UC3-01', mode: 'delay', delay: 60 });
  const plain = computeAll(data);
  assert.deepEqual(substituteOptions(plain), ['Volga-X']);
  const withSub = computeAll(data, { useSubstituteFor: ['Volga-X'] });
  const halo = model(withSub, 'HAL-77');
  assert.equal(halo.status, 'blocked');
  assert.match(mainReason(halo, withSub), /HAL-77 build/);
  assert.equal(status(before, 'HAL-77'), 'ready');
});
