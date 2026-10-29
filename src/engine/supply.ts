// Supply side: who gets which parts, and when.
//
// Idea in one paragraph: every build needs parts by a date. Test boards for a
// chipset are needed by its planned test start; a model's first production
// build needs its parts `productionLeadDays` before launch. We list every
// demand line, sort them by need date (earliest first), and hand out supply in
// that order. Each unit of stock or each delivered unit can only be handed out
// once, so two launches can never both count the same part. Deliveries with no
// date are never counted; they are only reported as "might help".
import { addDays, daysBetween } from './dates';
import type { Config, Dataset, DemandLine, StockRow, SupplyLine, SupplySource, Verdict } from './types';

/** All demand lines (one per build x part), sorted by need date. */
export function buildDemand(data: Dataset): DemandLine[] {
  const lines: DemandLine[] = [];
  const bomFor = (chipset: string) => data.bom.filter((b) => b.chipset === chipset);

  for (const c of data.chipsets) {
    if (c.testStartedOn) continue; // boards already built, testing under way
    for (const b of bomFor(c.id)) {
      lines.push({
        id: `TB:${c.id}:${b.part}`, kind: 'test-boards', chipset: c.id, model: null,
        part: b.part, qty: c.testBoards * b.qtyPerUnit, needDate: c.plannedTestStart,
      });
    }
  }
  for (const m of data.models) {
    const needDate = addDays(m.launchDate, -data.config.productionLeadDays);
    for (const b of bomFor(m.chipset)) {
      lines.push({
        id: `PR:${m.id}:${b.part}`, kind: 'production', chipset: m.chipset, model: m.id,
        part: b.part, qty: m.firstBuildUnits * b.qtyPerUnit, needDate,
      });
    }
  }
  // Earliest need first; on a tie test boards go first (they gate software).
  return lines.sort((a, b) =>
    a.needDate.localeCompare(b.needDate) ||
    (a.kind === b.kind ? 0 : a.kind === 'test-boards' ? -1 : 1) ||
    a.id.localeCompare(b.id));
}

/** Supply sources per part: free stock (available now) + dated, non-rejected deliveries. */
export function buildSources(data: Dataset): SupplySource[] {
  const sources: SupplySource[] = [];
  const free: Record<string, number> = {};
  for (const s of data.stock) free[s.part] = (free[s.part] ?? 0) + Math.max(0, s.onHand - s.allocated);
  for (const [part, qty] of Object.entries(free)) {
    if (qty > 0) sources.push({ id: `STOCK:${part}`, part, qty, date: data.config.asOf, forChipset: null, kind: 'stock', remaining: qty });
  }
  for (const d of data.deliveries) {
    if (d.status === 'rejected' || !d.eta) continue; // rejected or undated: never counted
    sources.push({ id: d.id, part: d.part, qty: d.qty, date: d.eta, forChipset: d.forChipset ?? null, kind: 'delivery', remaining: d.qty });
  }
  return sources;
}

const eligible = (src: SupplySource, line: { part: string; chipset: string }) =>
  src.part === line.part && (src.forChipset === null || src.forChipset === line.chipset);

/**
 * Allocate supply to demand. Every line gets: allocations, shortfall,
 * readyDate, lateDays, tight, substitute (an option, not applied), undatedQty,
 * status, reasons.
 */
export function allocate(data: Dataset): { lines: SupplyLine[]; sources: SupplySource[] } {
  const cfg = data.config;
  const sources = buildSources(data);
  const lines = buildDemand(data) as SupplyLine[];

  // Pass 1: primary parts, earliest need first.
  for (const line of lines) {
    let need = line.qty;
    line.allocations = [];
    const pool = sources.filter((s) => eligible(s, line) && s.remaining > 0);
    const onTime = pool.filter((s) => s.date <= line.needDate)
      // Supply bought for this chipset first (a pegged PO), then earliest first.
      .sort((a, b) => (b.forChipset ? 1 : 0) - (a.forChipset ? 1 : 0) || a.date.localeCompare(b.date));
    const late = pool.filter((s) => s.date > line.needDate).sort((a, b) => a.date.localeCompare(b.date));
    for (const s of [...onTime, ...late]) {
      if (need === 0) break;
      const take = Math.min(need, s.remaining);
      s.remaining -= take;
      need -= take;
      line.allocations.push({ source: s.id, qty: take, date: s.date, kind: s.kind });
    }
    line.shortfall = need;
    line.lateQty = line.allocations.filter((a) => a.date > line.needDate).reduce((n, a) => n + a.qty, 0);
    line.readyDate = need > 0 ? null : (line.allocations.map((a) => a.date).sort().at(-1) ?? line.needDate);
    line.lateDays = line.readyDate && line.readyDate > line.needDate ? daysBetween(line.readyDate, line.needDate) : 0;
    line.tight = line.allocations.some((a) => a.kind === 'delivery' && a.date <= line.needDate &&
      daysBetween(line.needDate, a.date) < cfg.tightDeliveryDays);
  }

  // Pass 2: approved substitutes, from what is left after everyone's primary needs.
  // Reported as an option (it needs a driver change), never silently applied.
  for (const line of lines) {
    line.substitute = null;
    const gap = line.shortfall + line.lateQty;
    if (gap === 0) continue;
    const sub = data.substitutes.find((x) => x.part === line.part && x.approvedFor.includes(line.chipset));
    if (!sub) continue;
    const subLine = { part: sub.substitute, chipset: line.chipset };
    const avail = sources.filter((s) => eligible(s, subLine) && s.remaining > 0 && s.date <= line.needDate);
    const total = avail.reduce((n, s) => n + s.remaining, 0);
    if (total < gap) continue; // a partial substitute does not save the build
    let need = gap;
    for (const s of avail) { const t = Math.min(need, s.remaining); s.remaining -= t; need -= t; }
    line.substitute = { part: sub.substitute, qty: gap, driverTeam: sub.driverTeam, driverChangeDays: sub.driverChangeDays, validationDays: sub.validationDays ?? [0, 0] };
  }

  // Undated deliveries that could cover a shortfall (flagged, never counted).
  for (const line of lines) {
    const undated = data.deliveries.filter((d) => d.status !== 'rejected' && !d.eta &&
      d.part === line.part && (!d.forChipset || d.forChipset === line.chipset));
    line.undatedQty = undated.reduce((n, d) => n + d.qty, 0);
    line.undatedIds = undated.map((d) => d.id);
    Object.assign(line, lineStatus(line, cfg));
  }
  return { lines, sources };
}

/** Ready / at-risk / blocked for one demand line, with plain-language reasons. */
export function lineStatus(line: SupplyLine, cfg: Config): Verdict {
  const what = line.kind === 'test-boards' ? `${line.part} for ${line.chipset} test boards` : `${line.part} for the ${line.model} build`;
  if (line.shortfall > 0) {
    if (line.substitute) {
      const s = line.substitute;
      return { status: 'at-risk', reasons: [`${what}: ${line.shortfall} short; approved substitute ${s.part} can cover it but needs a ${s.driverTeam} driver change (${s.driverChangeDays[0]}–${s.driverChangeDays[1]} days) and extra validation (${s.validationDays[0]}–${s.validationDays[1]} days)`] };
    }
    if (line.undatedQty > 0) {
      return { status: 'at-risk', reasons: [`${what}: ${line.shortfall} short unless delivery ${line.undatedIds.join(', ')} arrives; it has no confirmed date, so it is not counted`] };
    }
    return { status: 'blocked', reasons: [`${what}: ${line.shortfall} of ${line.qty} not covered by stock or dated deliveries`] };
  }
  if (line.lateDays > 0 && line.kind === 'production' && line.undatedQty >= line.lateQty) {
    return { status: 'at-risk', reasons: [`${what}: ${line.lateQty} of ${line.qty} arrive ${line.lateDays} days late unless delivery ${line.undatedIds.join(', ')} arrives; it has no confirmed date, so it is not counted`] };
  }
  if (line.lateDays > 0) {
    const sub = line.substitute ? `; approved substitute ${line.substitute.part} could cover the late ${line.lateQty} now` : '';
    const status = line.kind === 'test-boards' || line.lateDays <= cfg.productionSlackDays ? 'at-risk' : 'blocked';
    return { status, reasons: [`${what}: ${line.lateQty} of ${line.qty} arrive ${line.lateDays} days after they are needed${sub}`] };
  }
  if (line.tight) {
    return { status: 'at-risk', reasons: [`${what}: covered, but by a delivery landing less than ${cfg.tightDeliveryDays} days before it is needed`] };
  }
  return { status: 'ready', reasons: [] };
}

/** Free stock per part and warehouse, for the Supply view. */
export function stockSummary(data: Dataset): (StockRow & { free: number })[] {
  return data.stock.map((s) => ({ ...s, free: Math.max(0, s.onHand - s.allocated) }));
}
