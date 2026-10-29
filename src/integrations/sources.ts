// Where each part of LaunchReady's data would come from in a real company,
// how it's fetched and how fresh it needs to be. The demo runs on generated
// data (data/*.json); the adapters show the mapping from each source format.
import jiraSample from './samples/jira-issue.json';
import testLabSample from './samples/testlab-run.json';
import fieldSample from './samples/field-report.json';
import erpSample from './samples/erp-purchase-order.json';
import carrierSample from './samples/carrier-tracking.json';
import { fromCarrierTracking, fromErpPurchaseOrder, fromFieldReport, fromJiraIssue, fromTestLabRun, type CarrierTracking, type ErpPurchaseOrder, type FieldReport, type JiraIssue, type TestLabRun } from './adapters';

export interface DataSource {
  id: string;
  name: string;
  /** Typical systems of record for this data. */
  systems: string;
  feeds: string;
  fields: string[];
  how: string;
  cadence: string;
  owner: string;
  sample?: { label: string; raw: unknown; convert: () => unknown };
}

const SUITE_ID: Record<string, string> = { 'USB media playback soak': 'TS-USB-MEDIA' };

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'issues', name: 'Issue tracker', systems: 'Jira (or Azure DevOps, Polarion)',
    feeds: 'Issues: severity, team, stage, comments, fix date', fields: ['key → id', 'priority → severity', 'component → team', 'status → stage', 'labels → platform, source', 'duedate + ETA field → fix date', 'comments → timeline'],
    how: 'REST API, with webhooks on update', cadence: 'Live (webhook), full sync nightly', owner: 'Software program management',
    sample: { label: 'Jira REST API v3 issue', raw: jiraSample, convert: () => fromJiraIssue(jiraSample as unknown as JiraIssue) },
  },
  {
    id: 'testlab', name: 'Test lab management', systems: 'TestRail (or Xray, in-house rig controller)',
    feeds: 'Test runs, failed steps, issues raised per run', fields: ['run config → platform', 'test results → passed / failed step', 'defects → linked issues', 'rig → bench'],
    how: 'REST API; rigs post results when a run ends', cadence: 'Every 15 min', owner: 'Test lab',
    sample: { label: 'TestRail-style run with results', raw: testLabSample, convert: () => fromTestLabRun(testLabSample as TestLabRun, SUITE_ID) },
  },
  {
    id: 'field', name: 'Field reports from TVs', systems: 'Crash and issue reporting service (e.g. Sentry, or in-house telemetry)',
    feeds: 'Customer reports: TVs affected, devices, software version, the user\'s words', fields: ['userCount → TVs affected', 'tags.model → devices', 'release → software version', 'title → log signature', 'linkedIssue → issue'],
    how: 'Aggregated issue API; consent-based uploads from "Report this issue"', cadence: 'Hourly', owner: 'Customer quality',
    sample: { label: 'Aggregated field report', raw: fieldSample, convert: () => fromFieldReport(fieldSample as FieldReport) },
  },
  {
    id: 'code', name: 'Code submissions', systems: 'Git hosting and CI (e.g. Gerrit, GitHub, Jenkins)',
    feeds: 'Which team\'s code is in for each platform, and their latest note', fields: ['merge to release branch → submitted', 'team plan → expected date', 'team update → note'],
    how: 'CI API + a weekly team update form', cadence: 'Hourly; notes weekly', owner: 'Release management',
  },
  {
    id: 'erp', name: 'ERP: purchase orders and stock', systems: 'SAP S/4HANA (or Oracle ERP Cloud)',
    feeds: 'Shipments (orders), stock, allocations, bill of materials', fields: ['PO item → part, qty, supplier', 'schedule line → due date', 'net price → unit cost', 'custom field → platform the order is for', 'stock by plant → free / allocated'],
    how: 'OData API (read-only service user)', cadence: 'Every 30 min', owner: 'Supply planning',
    sample: { label: 'SAP S/4HANA purchase order (OData)', raw: erpSample, convert: () => fromErpPurchaseOrder(erpSample as ErpPurchaseOrder) },
  },
  {
    id: 'carrier', name: 'Shipment tracking', systems: 'Carrier tracking aggregator (e.g. project44) and supplier advance shipping notices (EDI 856)',
    feeds: 'Shipment events and revised arrival dates', fields: ['events → tracking timeline', 'estimated_delivery → arrival date', 'exception → delay flag'],
    how: 'Webhooks from the tracking service; EDI for ship notices', cadence: 'Live', owner: 'Logistics',
    sample: { label: 'Carrier tracking update', raw: carrierSample, convert: () => fromCarrierTracking(carrierSample as CarrierTracking) },
  },
  {
    id: 'suppliers', name: 'Supplier performance and quality', systems: 'Supplier portal and QMS (e.g. SAP Ariba, incoming-inspection records)',
    feeds: 'On-time rate, average delay, defects per million, inspection results, supplier notes', fields: ['delivery history → on-time rate, delay', 'inspection lots → defect ppm, result', 'portal messages → latest note'],
    how: 'Monthly scorecard export; inspection results per lot', cadence: 'Daily (inspections), monthly (scorecard)', owner: 'Supplier quality',
  },
  {
    id: 'plan', name: 'Launch plan', systems: 'Product lifecycle (PLM) and the launch calendar',
    feeds: 'Models, platforms, launch dates, first build quantities', fields: ['model → platform', 'launch date', 'first build units'],
    how: 'PLM API or a maintained sheet', cadence: 'On change', owner: 'Product management',
  },
];
