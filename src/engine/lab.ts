// What-if edits and plain-language explanations:
//   applyLab(data, lab)        -> a new dataset with the user's edits applied
//   knockOn(before, after, d)  -> the chain of effects, in plain sentences
//   explain(model, result, d)  -> one sentence a non-specialist can read
import { addDays, fmtDate } from './dates';
import type { Dataset, ModelResult, Result, SoftwareEta, Status, SupplyLine } from './types';

export type LabMode = 'delay' | 'reject' | 'nodate';
export interface Lab {
  delivery: string;
  mode: LabMode;
  /** Days to move the delivery (may be negative). */
  delay: number;
  model: string;
  /** Days to move that model's launch. */
  shift: number;
}

/** A partial edit is fine: missing fields mean "no change". */
export type LabEdit = Pick<Lab, 'delivery' | 'mode'> & Partial<Lab>;

export function applyLab(data: Dataset, lab: LabEdit): Dataset {
  const d = structuredClone(data);
  const del = d.deliveries.find((x) => x.id === lab.delivery);
  if (del) {
    if (lab.mode === 'reject') Object.assign(del, { status: 'rejected', note: 'Rejected at inspection (what-if)' });
    else if (lab.mode === 'nodate') Object.assign(del, { eta: null, status: 'unconfirmed', note: 'Supplier withdrew the date (what-if)' });
    else if (lab.delay && del.eta) Object.assign(del, { eta: addDays(del.eta, lab.delay), status: lab.delay > 0 ? 'delayed' : del.status, note: `${lab.delay > 0 ? '+' : ''}${lab.delay} days (what-if)` });
  }
  const m = d.models.find((x) => x.id === lab.model);
  if (m && lab.shift) m.launchDate = addDays(m.launchDate, lab.shift);
  return d;
}

/** Chipsets whose test boards could use an approved substitute part right now. */
export const substituteOptions = (result: Result): string[] =>
  [...new Set(result.lines.filter((l) => l.kind === 'test-boards' && l.substitute).map((l) => l.chipset))];

const LABEL: Record<Status, string> = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const span = (e: SoftwareEta) => (e.known ? `${fmtDate(e.early, true)} – ${fmtDate(e.late, true)}` : 'unknown');

export type Stage = 'parts' | 'testing' | 'software' | 'launch';
export interface KnockOn { stage: Stage; status: Status; text: string; model?: string; why?: string }

/**
 * Compare two computed results and list what changed, in the order a launch
 * manager would trace it: parts -> testing -> software -> launch.
 */
export function knockOn(before: Result, after: Result, data: Dataset): KnockOn[] {
  const out: KnockOn[] = [];
  const name = (l: SupplyLine) => (l.kind === 'test-boards' ? `${l.chipset} test boards` : `${data.models.find((m) => m.id === l.model)?.name} production`);
  for (const l of after.lines) {
    const b = before.lines.find((x) => x.id === l.id);
    if (!b || (b.shortfall === l.shortfall && b.lateQty === l.lateQty && b.lateDays === l.lateDays && b.status === l.status)) continue;
    let text: string;
    if (l.shortfall > 0) text = `${name(l)}: ${l.shortfall.toLocaleString('en-US')} of ${l.qty.toLocaleString('en-US')} ${l.part} not covered`;
    else if (l.lateQty > 0) text = `${name(l)}: ${l.lateQty.toLocaleString('en-US')} of ${l.qty.toLocaleString('en-US')} ${l.part} arrive ${l.lateDays} days after they're needed`;
    else text = `${name(l)}: ${l.part} now covered on time`;
    out.push({ stage: 'parts', status: l.status, text });
  }
  for (const [id, c] of Object.entries(after.chipsets)) {
    const b = before.chipsets[id];
    if (c.eta.testStart !== b.eta.testStart) {
      out.push({
        stage: 'testing',
        status: c.eta.testStart && b.eta.testStart && c.eta.testStart < b.eta.testStart ? 'ready' : 'at-risk',
        text: c.eta.testStart ? `${id} testing starts ${fmtDate(c.eta.testStart, true)} (was ${b.eta.testStart ? fmtDate(b.eta.testStart, true) : 'unknown'})` : `${id} testing can't be scheduled: boards have no date`,
      });
    }
    if (c.eta.early !== b.eta.early || c.eta.late !== b.eta.late) {
      out.push({ stage: 'software', status: c.eta.known && b.eta.known && c.eta.late < b.eta.late ? 'ready' : 'at-risk', text: `${id} software ready ${span(c.eta)} (was ${span(b.eta)})` });
    }
  }
  for (const m of after.models) {
    const b = before.models.find((x) => x.id === m.id)!;
    if (b.status === m.status && b.launchDate === m.launchDate) continue;
    out.push({ stage: 'launch', status: m.status, model: m.id, text: modelText(m, b), why: mainReason(m, after) });
  }
  return out;
}

const RANK: Record<Status, number> = { ready: 0, 'at-risk': 1, blocked: 2 };

/** Supply lines that feed a model: its own production build plus its chipset's test boards. */
export const linesFor = (m: ModelResult, result: Result): SupplyLine[] =>
  result.lines.filter((l) => l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset));

/** The one reason that decides a model's verdict: from the worse side, and on
 *  the supply side from the build line with the worst status. */
export function mainReason(m: ModelResult, result: Result): string {
  if (m.status === 'ready') return '';
  if (RANK[m.software.status] >= RANK[m.supply.status]) return m.software.reasons[0] ?? '';
  const line = linesFor(m, result).find((l) => l.status === m.supply.status && l.reasons.length);
  return line?.reasons[0] ?? m.supply.reasons[0] ?? '';
}

function modelText(m: ModelResult, b: ModelResult): string {
  const moved = b.launchDate !== m.launchDate ? ` · launch ${fmtDate(m.launchDate, true)} (was ${fmtDate(b.launchDate, true)})` : '';
  return `${m.name}: ${b.status === m.status ? LABEL[m.status] : `${LABEL[b.status]} → ${LABEL[m.status]}`}${moved}`;
}

/**
 * One plain-language sentence a non-specialist can read: what is at risk and
 * why, built from the calculated result (no numbers are typed in).
 */
export function explain(m: ModelResult, result: Result, data: Dataset): string {
  if (m.status === 'ready') return `${m.name} is on track for ${fmtDate(m.launchDate, true)}.`;
  const lead = m.status === 'blocked' ? `${m.name} will miss its ${fmtDate(m.launchDate, true)} launch unless something changes:` : `${m.name} may miss its ${fmtDate(m.launchDate, true)} launch:`;
  const partName = (id: string) => data.parts.find((p) => p.id === id)?.name ?? id;
  const n = (x: number) => x.toLocaleString('en-US');
  const cutoff = addDays(m.launchDate, -data.config.bufferDays);
  const mine = linesFor(m, result);
  const tb = mine.find((l) => l.kind === 'test-boards' && (l.lateQty || l.shortfall));
  const swFirst = RANK[m.software.status] >= RANK[m.supply.status];
  if (swFirst) {
    const e = m.eta;
    if (tb && e.known && e.slipDays > 0) {
      return `${lead} ${n(tb.lateQty || tb.shortfall)} of its ${n(tb.qty)} test boards depend on a delayed ${partName(tb.part)} delivery, so testing starts ${e.slipDays} days late and the software is expected ${fmtDate(e.early, true)}–${fmtDate(e.late, true)}, after the ${fmtDate(cutoff, true)} cutoff.`;
    }
    if (!e.known) return `${lead} its software date can't be calculated yet (${e.notes.join('; ')}).`;
    const pretty = (t: string) => t.replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
    const late = e.late > cutoff ? ` The software is expected ${fmtDate(e.early, true)}–${fmtDate(e.late, true)}, after the ${fmtDate(cutoff, true)} cutoff.` : '';
    const code = m.software.reasons.find((r) => /code/i.test(r));
    if (code) return `${lead} ${pretty(code)}.${late}`;
    const crit = m.software.reasons.find((r) => /critical/i.test(r));
    if (crit) return `${lead} ${pretty(crit).replace(/^(\d+) open critical ticket/, '$1 open critical bug')} must be fixed before launch.${late}`;
    return `${lead}${late || ` ${pretty(m.software.reasons[0] ?? '')}.`}`;
  }
  const l = [...mine].sort((a, b) => RANK[b.status] - RANK[a.status])[0];
  const what = l.kind === 'test-boards' ? 'its test boards' : 'its first production run';
  const pn = partName(l.part);
  if (l.shortfall && l.undatedQty) return `${lead} ${n(l.shortfall)} ${pn} parts for ${what} depend on a delivery that has no confirmed date.`;
  if (l.shortfall) return `${lead} ${n(l.shortfall)} of ${n(l.qty)} ${pn} parts for ${what} are not covered by stock or any dated delivery.`;
  if (l.lateQty) return `${lead} ${n(l.lateQty)} of ${n(l.qty)} ${pn} parts for ${what} arrive ${l.lateDays} days after they're needed${l.undatedQty ? ', unless a delivery with no confirmed date turns up in time' : ''}.`;
  if (l.tight) return `${lead} the ${pn} delivery for ${what} lands with less than ${data.config.tightDeliveryDays} days to spare.`;
  const r = (m.supply.reasons[0] ?? '').replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
  return `${lead} ${r.charAt(0).toLowerCase()}${r.slice(1)}.`;
}
