// Adapters turn each source system's payload into LaunchReady records.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import jira from '../src/integrations/samples/jira-issue.json';
import testlab from '../src/integrations/samples/testlab-run.json';
import field from '../src/integrations/samples/field-report.json';
import erp from '../src/integrations/samples/erp-purchase-order.json';
import carrier from '../src/integrations/samples/carrier-tracking.json';
import { adfText, fromCarrierTracking, fromErpPurchaseOrder, fromFieldReport, fromJiraIssue, fromTestLabRun, type CarrierTracking, type ErpPurchaseOrder, type FieldReport, type JiraIssue, type TestLabRun } from '../src/integrations/adapters';
import { DATA_SOURCES } from '../src/integrations/sources';
import { loadData } from '../src/engine/data';

const base = loadData();

test('Jira issue → ticket: severity, team, stage, platform, source, fix date, comments', () => {
  const t = fromJiraIssue(jira as unknown as JiraIssue);
  assert.equal(t.id, 'NWV-4211');
  assert.equal(t.severity, 'critical');
  assert.equal(t.team, 'Audio');
  assert.equal(t.workflow, 'in-review');
  assert.equal(t.status, 'open');
  assert.equal(t.chipset, 'Rhine-M');
  assert.equal(t.source, 'customer');
  assert.equal(t.openedOn, '2026-09-26');
  assert.deepEqual(t.eta, { fixBy: '2026-10-09', confidence: 'committed' });
  assert.equal(t.triage?.signature, 'earc: capability handshake timeout');
  assert.equal(t.comments?.length, 2);
  assert.match(t.comments![1].text, /by 2026-10-09\.$/); // rich text flattened, including marked text
  // The mapped record agrees with the demo dataset's version of the same issue.
  const demo = base.tickets.find((x) => x.id === 'NWV-4211')!;
  for (const k of ['severity', 'team', 'chipset', 'source', 'openedOn', 'workflow'] as const) assert.equal(t[k], demo[k], k);
  assert.deepEqual(t.eta, demo.eta);
});

test('ADF text extraction joins paragraphs', () => {
  assert.equal(adfText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] }), 'ab\nc');
});

test('test lab run → run: failed step, linked issue, still-untested steps don\'t make it "running"', () => {
  const r = fromTestLabRun(testlab as TestLabRun, { 'USB media playback soak': 'TS-USB-MEDIA' });
  assert.equal(r.result, 'fail');
  assert.equal(r.failedStep, 4);
  assert.deepEqual(r.ticketIds, ['NWV-4138']);
  assert.equal(r.suite, 'TS-USB-MEDIA');
  assert.equal(r.chipset, 'Indus-M');
  const suite = base.testSuites.find((s) => s.id === r.suite)!;
  assert.equal(suite.steps[r.failedStep!], 'Record live TV to a USB hard disk for 4 h');
  const pending = structuredClone(testlab) as TestLabRun;
  pending.tests = pending.tests.map((t) => ({ ...t, status_id: t.id <= 2 ? 1 : 3, defects: undefined }));
  assert.equal(fromTestLabRun(pending, {}).result, 'running');
});

test('field report → customer report on the linked issue', () => {
  const f = fromFieldReport(field as FieldReport);
  assert.equal(f.ticketId, 'NWV-4211');
  assert.equal(f.report.units, 1240);
  assert.equal(f.report.firmware, 'NWV-OS 7.4.2');
  assert.match(f.report.devices, /Zenith 2025 55"/);
});

test('ERP purchase order → shipment with order details', () => {
  const [d] = fromErpPurchaseOrder(erp as ErpPurchaseOrder);
  assert.equal(d.part, 'UC-300');
  assert.equal(d.qty, 100);
  assert.equal(d.eta, '2026-11-06');
  assert.equal(d.forChipset, 'Volga-X');
  assert.equal(d.po?.unitCost, 1.67);
  assert.equal(d.po?.incoterm, 'FCA');
  // Same order as the demo's DL-UC3-01, before the delay.
  const demo = base.deliveries.find((x) => x.id === 'DL-UC3-01')!;
  assert.equal(d.qty, demo.qty);
  assert.equal(d.originalEta, demo.originalEta);
});

test('carrier tracking → events, a revised date and a delay flag', () => {
  const t = fromCarrierTracking(carrier as CarrierTracking);
  assert.equal(t.delayed, true);
  assert.equal(t.eta, '2026-12-10');
  assert.equal(t.events.at(-1)?.stage, 'delayed');
});

test('every source with a sample converts without throwing', () => {
  for (const s of DATA_SOURCES) if (s.sample) assert.ok(s.sample.convert(), s.id);
});
