// Presentation helpers: plain-language names and short labels for the UI.
// The engine speaks in ids (UC-300, DL-UC3-01, Volga-X); people should not
// have to. Every label here is derived from computed results, never typed in.
import { addDays, daysBetween, fmtDate } from '../../engine/dates';
import type { Dataset, ModelResult, Result, Status, SupplyLine } from '../../engine/types';
import { linesFor } from '../../engine/lab';

export const STATUS_LABEL: Record<Status, string> = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
export const STATUS_RANK: Record<Status, number> = { ready: 0, 'at-risk': 1, blocked: 2 };

export const num = (n: number) => n.toLocaleString('en-US');
export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
export const date = (iso: string | null | undefined) => fmtDate(iso, true);
export const dateLong = (iso: string | null | undefined) => fmtDate(iso);
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const partName = (data: Dataset, id: string) => data.parts.find((p) => p.id === id)?.name ?? id;
export const supplierName = (data: Dataset, id: string) =>
  (data.suppliers.find((s) => s.id === id)?.name ?? id).replace(/ \(fictional\)$/, '');
export const modelName = (data: Dataset, id: string | null) => data.models.find((m) => m.id === id)?.name ?? id ?? '';

/** Software must be ready this many days before launch. */
export const cutoffOf = (data: Dataset, launch: string) => addDays(launch, -data.config.bufferDays);

/** Days of software buffer left before the cutoff (negative = late). Null when unknown. */
export function softwareSlack(data: Dataset, m: ModelResult): number | null {
  if (!m.eta.known) return null;
  return daysBetween(cutoffOf(data, m.launchDate), m.eta.late);
}

/** The supply line that decides a model's supply verdict. */
export function worstLine(m: ModelResult, result: Result): SupplyLine | undefined {
  return [...linesFor(m, result)].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])[0];
}

export interface Risk {
  /** Short label for tables, e.g. "Test boards late · USB 3.2 controller". */
  label: string;
  /** Which side of the launch the risk sits on. */
  side: 'software' | 'supply';
  /** The team or function that owns the fix. */
  owner: string;
}

/** The single risk that decides a model's verdict, in a few words. */
export function mainRisk(m: ModelResult, result: Result, data: Dataset): Risk | null {
  if (m.status === 'ready') return null;
  const swFirst = STATUS_RANK[m.software.status] >= STATUS_RANK[m.supply.status];
  if (swFirst) {
    const tb = linesFor(m, result).find((l) => l.kind === 'test-boards' && (l.lateQty || l.shortfall));
    if (!m.eta.known) return { label: 'Software date unknown', side: 'software', owner: 'Software lead' };
    if (tb && m.eta.slipDays > 0) return { label: `Test boards late · ${partName(data, tb.part)}`, side: 'supply', owner: 'Procurement' };
    const late = m.eta.pending.find((s) => (s.expectedOn ?? '') > s.dueDate || data.config.asOf > s.dueDate);
    if (late) return { label: `${late.team} code late`, side: 'software', owner: `${late.team} team` };
    const crit = m.software.reasons.find((r) => /critical/.test(r));
    if (crit) {
      const n = Number(crit.match(/^(\d+)/)?.[1] ?? 1);
      return { label: `${plural(n, 'critical bug')} open`, side: 'software', owner: 'Software lead' };
    }
    return { label: 'Software after cutoff', side: 'software', owner: 'Software lead' };
  }
  const l = worstLine(m, result);
  if (!l) return null;
  const pn = partName(data, l.part);
  if (l.shortfall && l.undatedQty) return { label: `Delivery has no date · ${pn}`, side: 'supply', owner: 'Procurement' };
  if (l.shortfall) return { label: `${num(l.shortfall)} short · ${pn}`, side: 'supply', owner: 'Procurement' };
  if (l.lateQty) return { label: `Parts ${l.lateDays}d late · ${pn}`, side: 'supply', owner: 'Procurement' };
  if (l.tight) return { label: `Tight delivery · ${pn}`, side: 'supply', owner: 'Procurement' };
  return { label: 'Supply risk', side: 'supply', owner: 'Procurement' };
}

/** "Volga-X" -> "Volga-X · new platform" where it matters. */
export function platformLabel(data: Dataset, chipset: string) {
  const c = data.chipsets.find((x) => x.id === chipset);
  return c?.isNew ? `${chipset} · new` : chipset;
}

/** Replace ISO dates inside engine text with "12 Nov". */
export const prettyDates = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
