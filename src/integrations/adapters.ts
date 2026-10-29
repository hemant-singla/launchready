// Adapters from source-system payloads to LaunchReady's data model.
//
// In production each runs in a scheduled sync (or on a webhook) and writes the
// normalised records the engine reads. Here they're exercised on sample
// payloads in each system's own format (src/integrations/samples/), which the
// Data sources page converts live and the tests pin down.
import type { Delivery, IsoDate, ShipmentEvent, Severity, TestRun, Ticket, TicketComment, Workflow } from '../engine/types';

const day = (iso: string): IsoDate => iso.slice(0, 10);

// ---------- issue tracker (Jira REST API v3 issue) ----------

interface AdfNode { type: string; text?: string; content?: AdfNode[] }
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    priority: { name: string };
    status: { name: string };
    components: { name: string }[];
    labels: string[];
    created: string;
    resolutiondate: string | null;
    duedate: string | null;
    /** ETA confidence (custom field). */
    customfield_10301?: { value: 'Committed' | 'Estimate' } | null;
    /** Log signature that routed the issue (custom field). */
    customfield_10302?: string | null;
    comment: { comments: { author: { displayName: string }; created: string; body: AdfNode }[] };
  };
}

const PRIORITY: Record<string, Severity> = { Highest: 'critical', High: 'major', Medium: 'minor', Low: 'minor', Lowest: 'minor' };
const STATUS: Record<string, Workflow> = { 'To Do': 'new', Triaged: 'triaged', 'In Progress': 'in-progress', 'In Review': 'in-review', Verifying: 'verifying', Done: 'fixed' };

/** Plain text from Atlassian Document Format. */
export function adfText(node: AdfNode): string {
  if (node.text) return node.text;
  const parts = (node.content ?? []).map(adfText);
  return node.type === 'doc' ? parts.join('\n') : parts.join('');
}

export function fromJiraIssue(issue: JiraIssue): Partial<Ticket> {
  const f = issue.fields;
  const label = (prefix: string) => f.labels.find((l) => l.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
  const workflow = STATUS[f.status.name] ?? 'triaged';
  const comments: TicketComment[] = f.comment.comments.map((c) => ({ at: day(c.created), by: c.author.displayName, text: adfText(c.body) }));
  return {
    id: issue.key,
    title: f.summary,
    severity: PRIORITY[f.priority.name] ?? 'minor',
    team: f.components[0]?.name ?? 'Platform',
    chipset: label('platform') ?? '',
    source: label('source') === 'customer' ? 'customer' : 'test-lab',
    raisedBy: label('source') === 'customer' ? 'Client' : 'Testing',
    status: workflow === 'fixed' ? 'fixed' : 'open',
    workflow,
    openedOn: day(f.created),
    fixedOn: f.resolutiondate ? day(f.resolutiondate) : null,
    eta: f.duedate && workflow !== 'fixed' ? { fixBy: f.duedate, confidence: f.customfield_10301?.value === 'Committed' ? 'committed' : 'estimate' } : undefined,
    triage: f.customfield_10302 ? { signature: f.customfield_10302, rule: `${f.components[0]?.name ?? '?'} component`, routedOn: day(f.created), line: 0 } : undefined,
    comments,
  };
}

// ---------- test lab (TestRail-style run with results) ----------

export interface TestLabRun {
  run: { id: number; name: string; config: string; custom_rig: string; created_on: number; custom_duration_h: number };
  tests: { id: number; title: string; status_id: number; defects?: string; comment?: string }[];
}
/** TestRail status ids: 1 passed, 2 blocked, 3 untested, 4 retest, 5 failed. */
const FAILED = 5;
const UNTESTED = 3;

export function fromTestLabRun(r: TestLabRun, suiteIdByName: Record<string, string>): TestRun {
  const failed = r.tests.findIndex((t) => t.status_id === FAILED);
  const running = failed < 0 && r.tests.some((t) => t.status_id === UNTESTED);
  const defects = r.tests.flatMap((t) => (t.defects ? t.defects.split(',').map((d) => d.trim()) : []));
  return {
    id: `RUN-${r.run.id}`,
    suite: suiteIdByName[r.run.name] ?? r.run.name,
    chipset: r.run.config,
    rig: r.run.custom_rig,
    startedOn: new Date(r.run.created_on * 1000).toISOString().slice(0, 10),
    hours: r.run.custom_duration_h,
    result: failed >= 0 ? 'fail' : running ? 'running' : 'pass',
    failedStep: failed >= 0 ? failed : null,
    ticketIds: defects,
    newIssue: defects.length > 0,
  };
}

// ---------- field reports (crash/issue reporting service, aggregated) ----------

export interface FieldReport {
  title: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  release: string;
  tags: { key: string; value: string; count: number }[];
  linkedIssue: string | null;
  sampleMessage: string;
}

export function fromFieldReport(r: FieldReport): { ticketId: string | null; report: NonNullable<Ticket['report']>; signature: string } {
  const models = r.tags.filter((t) => t.key === 'model').map((t) => t.value);
  return {
    ticketId: r.linkedIssue,
    signature: r.title,
    report: { units: r.userCount, firstSeen: day(r.firstSeen), firmware: r.release, devices: models.join(', '), quote: r.sampleMessage },
  };
}

// ---------- ERP purchase order (SAP S/4HANA OData style) ----------

export interface ErpPurchaseOrder {
  d: {
    PurchaseOrder: string;
    PurchaseOrderDate: string;
    Supplier: string;
    DocumentCurrency: string;
    IncotermsClassification: string;
    to_PurchaseOrderItem: { results: {
      PurchaseOrderItem: string;
      Material: string;
      OrderQuantity: string;
      NetPriceAmount: string;
      NetPriceQuantity: string;
      YY1_ForPlatform_PDI?: string;
      to_ScheduleLine: { results: { ScheduleLineDeliveryDate: string; ScheduleLineOrderQuantity: string }[] };
    }[] };
  };
}

/** One delivery per schedule line (a PO item can arrive in several lots). */
export function fromErpPurchaseOrder(po: ErpPurchaseOrder): Partial<Delivery>[] {
  const h = po.d;
  return h.to_PurchaseOrderItem.results.flatMap((item) =>
    item.to_ScheduleLine.results.map((line, i) => ({
      part: item.Material,
      supplier: h.Supplier,
      qty: Number(line.ScheduleLineOrderQuantity),
      originalEta: line.ScheduleLineDeliveryDate,
      eta: line.ScheduleLineDeliveryDate,
      status: 'confirmed' as const,
      forChipset: item.YY1_ForPlatform_PDI || null,
      po: {
        number: `${h.PurchaseOrder}/${item.PurchaseOrderItem}${item.to_ScheduleLine.results.length > 1 ? `-${i + 1}` : ''}`,
        placedOn: h.PurchaseOrderDate,
        unitCost: Number(item.NetPriceAmount) / Number(item.NetPriceQuantity || 1),
        currency: h.DocumentCurrency,
        incoterm: h.IncotermsClassification,
      },
    })));
}

// ---------- carrier tracking (multi-carrier tracking API) ----------

export interface CarrierTracking {
  tracking_number: string;
  carrier: string;
  reference: string;
  estimated_delivery: string | null;
  events: { occurred_at: string; status: string; description: string }[];
}

const CARRIER_STAGE: Record<string, ShipmentEvent['stage']> = {
  info_received: 'confirmed', in_transit: 'shipped', customs: 'customs', delivered: 'arrived', exception: 'delayed',
};

/** Tracking events, plus the new arrival date when the carrier revises it. */
export function fromCarrierTracking(t: CarrierTracking): { events: ShipmentEvent[]; eta: IsoDate | null; delayed: boolean } {
  const events = t.events.map((e) => ({ at: day(e.occurred_at), stage: CARRIER_STAGE[e.status] ?? 'shipped', text: e.description, planned: false }));
  return { events, eta: t.estimated_delivery, delayed: t.events.some((e) => e.status === 'exception') };
}
