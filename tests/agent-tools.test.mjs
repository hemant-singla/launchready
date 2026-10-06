// The agent's tools return numbers from the same logic as the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.js';
import { SCENARIOS } from '../src/scenarios.js';
import { TOOL_DEFS, runTool } from '../agent/tools.js';

const base = await loadData();
const usb = SCENARIOS.usbDelay.apply(base);

test('every tool has a strict-ready schema', () => {
  for (const t of TOOL_DEFS) {
    assert.equal(t.input_schema.additionalProperties, false, t.name);
    assert.ok(t.description.length > 20, t.name);
  }
});

test('overview reflects the scenario', () => {
  const o = runTool(usb, 'get_launch_overview', {});
  assert.equal(o.models.find((m) => m.model === 'HAL-77').status, 'at-risk');
});

test('chipset and part lookups', () => {
  const c = runTool(usb, 'get_chipset_software', { chipset: 'Volga-X' });
  assert.equal(c.computed_test_start, '2026-12-08');
  const p = runTool(usb, 'get_part_supply', { part: 'UC-300' });
  assert.equal(p.deliveries.find((d) => d.id === 'DL-UC3-01').current, '2026-12-10');
  assert.ok(runTool(usb, 'get_chipset_software', { chipset: 'Nope' }).error);
});

test('simulations report verdict changes without touching the data', () => {
  const snap = JSON.stringify(usb);
  const s = runTool(usb, 'simulate_move_stock', { delivery_id: 'DL-UC3-02', qty: 20, to_chipset: 'Volga-X' });
  assert.deepEqual(s.changed.map((x) => [x.model, x.before, x.after]), [['HAL-77', 'at-risk', 'ready']]);
  const l = runTool(usb, 'simulate_move_launch', { model: 'HAL-77', new_launch_date: '2027-01-25' });
  assert.equal(l.changed[0].model, 'HAL-77');
  assert.ok(runTool(usb, 'simulate_move_stock', { delivery_id: 'DL-UC3-02', qty: 999999, to_chipset: 'Volga-X' }).error);
  assert.equal(JSON.stringify(usb), snap);
});

test('substitute check through the tool', () => {
  const s = runTool(usb, 'check_substitute', { chipset: 'Volga-X' });
  assert.equal(s.possible, true);
});

test('any recorded run is labelled truthfully and ends in a plan', async () => {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const dir = new URL('../runs/', import.meta.url);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const run = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.equal(run.label, 'Real agent run, recorded during the build and replayed', f);
    assert.match(run.model, /^claude-/, f);
    assert.ok(run.usage.requests > 0 && run.plan?.options?.length, f);
  }
});
