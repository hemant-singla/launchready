// The in-app assistant's tools: valid strict schemas, answers that match the
// engine for the current workspace, and proposals that never change the plan.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/data';
import { computeAll } from '../src/engine/compute';
import { TOOLS, buildParams, ASSISTANT_MAX_TOKENS, ASSISTANT_MODEL, SYSTEM_PROMPT } from '../src/agent/assistant';
import { runAssistantTool, type AgentContext, type AgentState } from '../src/agent/runAssistantTool';

const base = loadData();
const baseline = computeAll(base);
const ctx = (state: Partial<AgentState> = {}): AgentContext => ({
  base, baseline, state: { scenarios: [], lab: null, actions: [], ...state },
});
// Tool output is JSON for the model; the tests read it loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (name: string, input: object, c = ctx()): any => runAssistantTool(name, input, c).result;

test('every tool has a strict schema: all properties required, no extras', () => {
  assert.equal(new Set(TOOLS.map((t) => t.name)).size, TOOLS.length);
  for (const t of TOOLS) {
    const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
    assert.equal(t.strict, true, t.name);
    assert.equal(schema.additionalProperties, false, t.name);
    assert.deepEqual([...(schema.required ?? [])].sort(), Object.keys(schema.properties ?? {}).sort(), t.name);
    assert.ok((t.description ?? '').length > 40, t.name);
  }
});

test('request builder fixes model, prompt, tools and limits; only messages vary', () => {
  const p = buildParams([{ role: 'user', content: 'hi' }]);
  assert.equal(p.max_tokens, ASSISTANT_MAX_TOKENS);
  assert.equal(p.stream, true);
  assert.deepEqual(p.tools, TOOLS);
  assert.deepEqual(p.messages, [{ role: 'user', content: 'hi' }]);
  assert.equal(p.model, ASSISTANT_MODEL);
  assert.equal(p.system, SYSTEM_PROMPT);
});

test('overview matches the engine, before and after the USB delay', () => {
  const o = run('get_plan_overview', {});
  assert.deepEqual(o.counts_now, { ready: 12, at_risk: 4, blocked: 0 });
  assert.deepEqual(o.launches_worse_than_plan, []);
  const u = run('get_plan_overview', {}, ctx({ scenarios: ['usbDelay'] }));
  const halo = u.launches.find((l: { launch_id: string }) => l.launch_id === 'HAL-77');
  assert.equal(halo.status, 'at-risk');
  assert.equal(halo.original_status, 'ready');
  assert.equal(halo.software_cutoff, '2027-01-11');
  assert.equal(halo.buffer_days_before_cutoff, -4);
  assert.match(halo.main_risk, /Test boards late/);
  assert.deepEqual(u.launches_worse_than_plan, ['HAL-77']);
});

test('launch details explain the chain, and accept the launch name too', () => {
  const d = run('get_launch_details', { launch_id: 'HAL-77' }, ctx({ scenarios: ['usbDelay'] }));
  assert.match(d.explanation, /testing starts 26 days late/);
  assert.equal(d.chain[0].step, 'Test boards');
  assert.equal(d.chain[0].status, 'at-risk');
  assert.ok(d.parts.some((p: { part_id: string; arriving_late: number }) => p.part_id === 'UC-300' && p.arriving_late === 20));
  assert.equal(run('get_launch_details', { launch_id: 'halo 77' }).launch_id, 'HAL-77');
  assert.equal(runAssistantTool('get_launch_details', { launch_id: 'NOPE' }, ctx()).isError, true);
});

test('platform, part and shipment lookups', () => {
  const p = run('get_platform_software', { platform: 'volga-x' }, ctx({ scenarios: ['usbDelay'] }));
  assert.equal(p.computed_test_start, '2026-12-08');
  assert.equal(p.testing_days_late, 26);
  const part = run('get_part_supply', { part_id: 'UC-300' }, ctx({ scenarios: ['usbDelay'] }));
  assert.equal(part.shipments.find((s: { shipment_id: string }) => s.shipment_id === 'DL-UC3-01').current, '2026-12-10');
  const found = run('find_shipments', { query: 'usb 3.2 volga' });
  assert.ok(found.shipments.some((s: { shipment_id: string }) => s.shipment_id === 'DL-UC3-01'));
  assert.equal(run('find_shipments', { query: '' }).matches, base.deliveries.length);
});

test('a simulated what-if matches the preset scenario and changes nothing', () => {
  const c = ctx();
  const snapshot = JSON.stringify(c);
  const s = run('simulate_what_if', { shipment_id: 'DL-UC3-01', change: 'delay', days: 34, launch_id: '', launch_shift_days: 0 }, c);
  assert.equal(s.applied, false);
  assert.deepEqual(s.launches_changed.map((x: { launch_id: string; status_after: string }) => [x.launch_id, x.status_after]), [['HAL-77', 'at-risk']]);
  assert.equal(JSON.stringify(c), snapshot);
  const bad = runAssistantTool('simulate_what_if', { shipment_id: 'DL-UC3-01', change: 'delay', days: 400, launch_id: '', launch_shift_days: 0 }, c);
  assert.equal(bad.isError, true);
});

test('recovery options match the tested search; proposals only describe a change', () => {
  const c = ctx({ scenarios: ['usbDelay'] });
  const r = run('get_recovery_options', {}, c);
  assert.deepEqual(r.launches_needing_recovery, ['HAL-77']);
  assert.equal(r.recommended, 't:DL-UC3-04:Volga-X');
  assert.equal(r.options_ranked[0].results[0].status_after, 'ready');

  const prop = runAssistantTool('propose_recovery', { option_key: r.recommended }, c);
  assert.deepEqual(prop.proposal, { kind: 'recovery', optionKey: 't:DL-UC3-04:Volga-X', summary: 'Borrow 20 USB 3.2 controllers from the Rhine-L order' });
  assert.equal(runAssistantTool('propose_recovery', { option_key: 'made-up' }, c).isError, true);

  const w = runAssistantTool('propose_what_if', { shipment_id: 'DL-MLD-03', change: 'reject', days: 0, launch_id: '', launch_shift_days: 0 }, ctx());
  assert.equal(w.proposal?.kind, 'what-if');
  assert.deepEqual(w.proposal?.kind === 'what-if' && w.proposal.lab, { delivery: 'DL-MLD-03', mode: 'reject', delay: 0, model: 'AUR-43', shift: 0 });

  assert.match(run('get_recovery_options', {}).note, /nothing to recover/);
});

test('rules come from the config, and unknown tools fail cleanly', () => {
  assert.match(run('explain_rules', {}).cutoff, /7 days before launch/);
  assert.equal(runAssistantTool('rm_rf', {}, ctx()).isError, true);
});

test('issue, test lab and shipment tools return the detail behind the dates', () => {
  const s = run('search_issues', { query: 'earc', platform: 'Rhine-M', team: '', source: 'any', state: 'open' });
  assert.equal(s.matches, 1);
  assert.equal(s.issues[0].issue_id, 'NWV-4211');
  assert.deepEqual(s.issues[0].fix_date, { fixBy: '2026-10-09', confidence: 'committed' });
  assert.equal(s.issues[0].tvs_reporting, 1240);

  const i = run('get_issue', { issue_id: 'nwv-4211' });
  assert.equal(i.customer_report.units, 1240);
  assert.match(i.log_line_matched, /capability handshake timeout/);
  assert.ok(i.timeline.length >= 3);
  assert.equal(runAssistantTool('get_issue', { issue_id: 'NWV-1' }, ctx()).isError, true);

  const lab = run('get_test_lab_summary', { platform: '' });
  assert.deepEqual(lab.platforms_in_testing.sort(), ['Indus-M', 'Indus-S', 'Rhine-M']);
  assert.ok(lab.last_7_days.hours_tested > 0);
  assert.equal(runAssistantTool('get_test_lab_summary', { platform: 'Volga-X' }, ctx()).isError, true);

  const sh = run('get_shipment', { shipment_id: 'DL-UC3-01' }, ctx({ scenarios: ['usbDelay'] }));
  assert.equal(sh.current_arrival, '2026-12-10');
  assert.match(sh.latest_update.text, /Supplier notice/);
  assert.equal(sh.supplier.on_time_rate_pct, 82);

  const p = run('get_platform_software', { platform: 'Indus-L' });
  assert.match(p.teams.find((t: { team: string }) => t.team === 'Display').team_note.text, /120 Hz panel/);
});
