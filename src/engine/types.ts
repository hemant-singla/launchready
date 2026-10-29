// Domain types for the dataset in data/*.json and for everything the engine
// derives from it. Dates are ISO strings ("YYYY-MM-DD"), always handled in UTC.

export type IsoDate = string;
/** An optimistic..pessimistic pair, e.g. fix days for a ticket. */
export type Range = [number, number];

export type Status = 'ready' | 'at-risk' | 'blocked';
export type Severity = 'critical' | 'major' | 'minor';

export interface Config {
  company: string;
  asOf: IsoDate;
  bufferDays: number;
  productionLeadDays: number;
  productionSlackDays: number;
  tightDeliveryDays: number;
  boardBringUpDays: number;
  testWindowDays: { new: number; reused: number };
  stabilisationDays: { new: Range; reused: Range };
  fixDays: Record<Severity, Range>;
  /** Days for the test lab to verify a fix after it lands. */
  verifyDays: Range;
  transferDays: number;
  maxLaunchMoveDays: number;
}

export interface Team { id: string; name: string; fixCapacity: number }

export interface Chipset {
  id: string;
  isNew: boolean;
  testBoards: number;
  codeDeadline: IsoDate;
  plannedTestStart: IsoDate;
  testStartedOn: IsoDate | null;
}

export interface Model {
  id: string;
  name: string;
  line: string;
  segment: string;
  size: number;
  chipset: string;
  launchDate: IsoDate;
  firstBuildUnits: number;
}

export interface Submission {
  chipset: string;
  team: string;
  dueDate: IsoDate;
  submittedOn: IsoDate | null;
  expectedOn: IsoDate | null;
  newCodePct: number;
  /** The team's latest note on its submission (why it is late, what is left). */
  note?: string;
  updatedOn?: IsoDate;
}

export type TicketSource = 'test-lab' | 'customer';
export type Workflow = 'new' | 'triaged' | 'in-progress' | 'in-review' | 'verifying' | 'fixed';

export interface TicketComment { at: IsoDate; by: string; text: string }

export interface Ticket {
  id: string;
  chipset: string;
  team: string;
  severity: Severity;
  status: 'open' | 'fixed';
  raisedBy: string;
  openedOn: IsoDate;
  fixedOn: IsoDate | null;
  title: string;
  // Detail (optional so hand-built test data stays small).
  source?: TicketSource;
  workflow?: Workflow;
  component?: string;
  /** Found by the test lab: the suite, the step that failed and the run. */
  testCase?: { suite: string; step: number; runId?: string };
  /** Reported by customers with "Report this issue". */
  report?: { units: number; firstSeen: IsoDate; firmware: string; devices: string; quote: string };
  /** Excerpt of the TV log attached to the issue. */
  log?: string[];
  /** How it reached the team: the log signature and routing rule. */
  triage?: { signature: string; rule: string; routedOn: IsoDate };
  comments?: TicketComment[];
  /** The team's fix date: committed dates feed the software-ready date. */
  eta?: { fixBy: IsoDate; confidence: 'committed' | 'estimate' };
}

export interface TestSuite { id: string; name: string; hours: number; teams: string[]; steps: string[] }
export interface TestRun {
  id: string;
  suite: string;
  chipset: string;
  rig: string;
  startedOn: IsoDate;
  hours: number;
  result: 'pass' | 'fail' | 'running';
  failedStep: number | null;
  ticketIds: string[];
  /** True when this run found a new issue (false for a repeat of a known one). */
  newIssue: boolean;
}

export interface Part { id: string; name: string; category: string }
export interface BomLine { chipset: string; part: string; qtyPerUnit: number }
export interface Warehouse { id: string; name: string }
export interface StockRow { part: string; warehouse: string; onHand: number; allocated: number }
export interface Supplier {
  id: string;
  name: string;
  region?: string;
  leadTimeDays?: number;
  /** Share of deliveries on time over the last 12 months (0–1). */
  onTimeRate?: number;
  avgDelayDays?: number;
  /** Defective parts per million at incoming inspection. */
  defectPpm?: number;
  contact?: string;
  latestNote?: string;
}

export interface ShipmentEvent {
  at: IsoDate;
  stage: 'ordered' | 'confirmed' | 'production' | 'shipped' | 'customs' | 'arrived' | 'inspection' | 'delayed' | 'what-if';
  text: string;
  /** A future step from the plan, not something that has happened. */
  planned: boolean;
}

export type DeliveryStatus = 'confirmed' | 'delayed' | 'rejected' | 'unconfirmed';
export interface Delivery {
  id: string;
  part: string;
  supplier: string;
  qty: number;
  originalEta: IsoDate | null;
  eta: IsoDate | null;
  status: DeliveryStatus;
  forChipset: string | null;
  note: string;
  po?: { number: string; placedOn: IsoDate; unitCost: number; currency: string; incoterm: string };
  transport?: { mode: 'air' | 'sea'; carrier: string; tracking: string };
  events?: ShipmentEvent[];
  inspection?: { sampled: number; failed: number; result: 'passed' | 'rejected'; reason?: string };
  lastUpdate?: { at: IsoDate; text: string } | null;
}

export interface Substitute {
  part: string;
  substitute: string;
  approvedFor: string[];
  driverTeam: string;
  driverChangeDays: Range;
  validationDays?: Range;
  note: string;
}

export interface Dataset {
  config: Config;
  teams: Team[];
  chipsets: Chipset[];
  models: Model[];
  submissions: Submission[];
  tickets: Ticket[];
  parts: Part[];
  bom: BomLine[];
  warehouses: Warehouse[];
  stock: StockRow[];
  suppliers: Supplier[];
  deliveries: Delivery[];
  substitutes: Substitute[];
  testSuites: TestSuite[];
  testRuns: TestRun[];
}

// ---------- derived: supply ----------

export type SourceKind = 'stock' | 'delivery';
export interface SupplySource {
  id: string;
  part: string;
  qty: number;
  date: IsoDate;
  forChipset: string | null;
  kind: SourceKind;
  remaining: number;
}

export interface Allocation { source: string; qty: number; date: IsoDate; kind: SourceKind }

export interface SubstituteOption {
  part: string;
  qty: number;
  driverTeam: string;
  driverChangeDays: Range;
  validationDays: Range;
}

export type DemandKind = 'test-boards' | 'production';
export interface DemandLine {
  id: string;
  kind: DemandKind;
  chipset: string;
  model: string | null;
  part: string;
  qty: number;
  needDate: IsoDate;
}

/** A demand line after allocation. */
export interface SupplyLine extends DemandLine {
  allocations: Allocation[];
  shortfall: number;
  lateQty: number;
  readyDate: IsoDate | null;
  lateDays: number;
  tight: boolean;
  substitute: SubstituteOption | null;
  undatedQty: number;
  undatedIds: string[];
  status: Status;
  reasons: string[];
}

// ---------- derived: software ----------

export interface TeamBacklog { tickets: number; days: Range }

interface EtaBase {
  chipset: string;
  notes: string[];
  pending: Submission[];
  codeComplete: IsoDate | null;
  backlog: Record<string, TeamBacklog>;
}
export interface KnownEta extends EtaBase {
  known: true;
  testStart: IsoDate;
  testStartLatest: IsoDate;
  testEnd: IsoDate;
  slipDays: number;
  early: IsoDate;
  late: IsoDate;
  /** Open tickets with a team-committed fix date, and the latest such date. */
  committedFixes: number;
  lastCommittedFix: IsoDate | null;
}
export interface UnknownEta extends EtaBase {
  known: false;
  testStart: null;
  testStartLatest?: undefined;
  testEnd?: undefined;
  slipDays?: undefined;
  early: null;
  late: null;
}
export type SoftwareEta = KnownEta | UnknownEta;

export interface Verdict { status: Status; reasons: string[] }

export interface ChipsetResult extends Chipset {
  boardsReadyDate: IsoDate | null | undefined;
  usingSubstitute: boolean;
  eta: SoftwareEta;
}

export interface ModelResult extends Model {
  software: Verdict;
  supply: Verdict;
  status: Status;
  eta: SoftwareEta;
}

export interface Result {
  models: ModelResult[];
  chipsets: Record<string, ChipsetResult>;
  lines: SupplyLine[];
  sources: SupplySource[];
}
