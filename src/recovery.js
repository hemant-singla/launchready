// Recovery: after a disruption, which actions would actually help?
//
// 1. applyActions()     applies approved actions to the data (pure, returns a copy).
// 2. affectedBy()       compares a result with the original plan: which launches,
//                       builds and chipsets got worse.
// 3. recoveryOptions()  generates every eligible action, tests each one by
//                       re-running the engine, drops the ones that don't help or
//                       that hurt another launch, and ranks the rest.
//
// Eligible actions (only where the data supports them):
// - transfer:   re-peg units of a purchase order bought for another program
//               (same part only). They arrive `transferDays` after the PO.
// - substitute: build test boards with the approved substitute part. Adds the
//               driver change before testing and extra validation in testing.
// - moveLaunch: the earliest later launch date that restores the model,
//               within `maxLaunchMoveDays`.
// Undated and rejected deliveries are never used as recovery supply.
import { computeAll, STATUS_ORDER } from './engine.js';
import { addDays, daysBetween, latest, fmtDate } from './dates.js';

const rank = (s) => STATUS_ORDER[s];
const n = (x) => Number(x).toLocaleString('en-US');

/** Apply approved actions. Returns { data, useSubstituteFor }. */
export function applyActions(data, actions = []) {
  const d = structuredClone(data);
  const useSubstituteFor = [];
  for (const a of actions) {
    if (a.type === 'transfer') {
      const src = d.deliveries.find((x) => x.id === a.from);
      if (!src || a.qty <= 0 || a.qty > src.qty) throw new Error(`cannot move ${a.qty} from ${a.from}`);
      src.qty -= a.qty;
      d.deliveries.push({ ...src, id: `${a.from}>${a.toChipset}`, qty: a.qty, eta: a.arrive, forChipset: a.toChipset, status: 'confirmed', note: `Re-pegged from ${a.from} (+${d.config.transferDays} days transfer)` });
    } else if (a.type === 'substitute') {
      useSubstituteFor.push(a.chipset);
    } else if (a.type === 'moveLaunch') {
      d.models.find((m) => m.id === a.model).launchDate = a.date;
    }
  }
  return { data: d, useSubstituteFor };
}

export function computeWith(data, actions = []) {
  const { data: d, useSubstituteFor } = applyActions(data, actions);
  return { data: d, result: computeAll(d, { useSubstituteFor }), useSubstituteFor };
}

const gapOf = (l) => (l ? l.shortfall + l.lateQty : 0);

/** What got worse compared with the original plan. */
export function affectedBy(original, result) {
  const models = result.models.filter((m) => {
    const o = original.models.find((x) => x.id === m.id);
    return rank(m.status) > rank(o.status) || m.eta.late > o.eta.late || (m.eta.known === false && o.eta.known);
  }).map((m) => m.id);
  const lines = result.lines.filter((l) => {
    const o = original.lines.find((x) => x.id === l.id);
    return gapOf(l) > gapOf(o) || l.lateDays > (o?.lateDays ?? 0) || rank(l.status) > rank(o?.status ?? 'ready');
  }).map((l) => l.id);
  const chipsets = Object.values(result.chipsets).filter((c) => {
    const o = original.chipsets[c.id];
    return (c.eta.testStart ?? '9999') > (o.eta.testStart ?? '9999') || (c.eta.late ?? '9999') > (o.eta.late ?? '9999');
  }).map((c) => c.id);
  return { models, lines, chipsets };
}

function describe(opt, data) {
  const cfg = data.config;
  if (opt.type === 'transfer') {
    const d = data.deliveries.find((x) => x.id === opt.from);
    return {
      title: `Move ${n(opt.qty)} ${opt.part} from ${opt.from} to ${opt.toChipset}`,
      detail: `${opt.from} was bought for ${d.forChipset} and lands ${fmtDate(d.eta, true)}. Re-pegged units reach the plant ${fmtDate(opt.arrive, true)} (${cfg.transferDays}-day transfer).`,
      tradeoffs: [`${d.forChipset} keeps ${n(d.qty - opt.qty)} of ${n(d.qty)} from this order (checked: its launches stay as they are)`],
      approval: `Procurement, to re-peg the order; ${d.forChipset} program owner informed`,
    };
  }
  if (opt.type === 'substitute') {
    const s = opt.sub;
    return {
      title: `Build ${opt.chipset} test boards with substitute ${s.part}`,
      detail: `${n(s.qty)} units of ${s.part} are free and approved for ${opt.chipset}. The ${s.driverTeam} team must port the driver first (${s.driverChangeDays[0]}–${s.driverChangeDays[1]} days), then validate it in testing (${s.validationDays[0]}–${s.validationDays[1]} days).`,
      tradeoffs: [`Firmware work for the ${s.driverTeam} team`, 'Wider software date range (driver work is uncertain)', 'Production still uses the original part'],
      approval: `${s.driverTeam} software lead (driver work) and quality (validation plan)`,
    };
  }
  const m = data.models.find((x) => x.id === opt.model);
  return {
    title: `Move ${m.name} launch to ${fmtDate(opt.date, true)}`,
    detail: `${opt.days} days later than planned (${fmtDate(m.launchDate, true)}). The earliest date that restores the original verdict.`,
    tradeoffs: ['Customer-facing date change', `${opt.days} days of sales lost or moved`],
    approval: 'Product and sales leadership (launch date change)',
  };
}

/**
 * Generate, test and rank recovery options for the current state.
 * `data` is the disrupted dataset, `actions` the actions already approved.
 */
export function recoveryOptions(original, data, actions = []) {
  const cfg = data.config;
  const { data: cur, result: now, useSubstituteFor } = computeWith(data, actions);
  const affected = affectedBy(original, now);
  const out = { now, affected, options: [], considered: [], recommended: null, escalation: null };
  if (!affected.models.length) return out;

  const affLines = now.lines.filter((l) => affected.lines.includes(l.id) && gapOf(l) > 0);
  const candidates = [];
  // 1. transfers: same part, a dated order pegged to another program
  for (const l of affLines) {
    for (const d of cur.deliveries) {
      if (d.part !== l.part || d.status === 'rejected' || !d.eta || !d.forChipset || d.forChipset === l.chipset || d.qty <= 0) continue;
      const arrive = addDays(latest(d.eta, cfg.asOf), cfg.transferDays);
      if (!l.shortfall && l.readyDate && arrive >= l.readyDate) continue; // would not arrive any sooner
      candidates.push({ type: 'transfer', from: d.id, part: d.part, qty: Math.min(gapOf(l), d.qty), toChipset: l.chipset, arrive, line: l.id });
    }
  }
  // 2. approved substitute for test boards (stock checked by the allocator)
  for (const l of affLines) {
    if (l.kind === 'test-boards' && l.substitute && !useSubstituteFor.includes(l.chipset) && !candidates.some((c) => c.type === 'substitute' && c.chipset === l.chipset)) {
      candidates.push({ type: 'substitute', chipset: l.chipset, sub: l.substitute, line: l.id });
    }
  }
  // 3. move the launch: earliest date that restores the original verdict
  for (const id of affected.models) {
    const m = now.models.find((x) => x.id === id);
    const want = rank(original.models.find((x) => x.id === id).status);
    if (rank(m.status) <= want) continue;
    for (let days = 1; days <= cfg.maxLaunchMoveDays; days++) {
      const date = addDays(m.launchDate, days);
      const r = computeWith(cur, [{ type: 'moveLaunch', model: id, date }]);
      const after = computeAll(r.data, { useSubstituteFor }).models.find((x) => x.id === id);
      if (rank(after.status) <= want) { candidates.push({ type: 'moveLaunch', model: id, date, days }); break; }
    }
  }

  // Test every candidate with the engine.
  const gapTotal = (r) => r.lines.filter((l) => affected.lines.includes(l.id)).reduce((s, l) => s + gapOf(l), 0);
  const worstLate = (r) => affected.chipsets.map((c) => r.chipsets[c].eta.late ?? '9999').sort().at(-1) ?? '';
  const seen = new Set();
  for (const c of candidates) {
    const key = c.type === 'transfer' ? `t:${c.from}:${c.toChipset}` : c.type === 'substitute' ? `s:${c.chipset}` : `m:${c.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { data: d2 } = applyActions(cur, c.type === 'substitute' ? [] : [c]);
    const subs = c.type === 'substitute' ? [...useSubstituteFor, c.chipset] : useSubstituteFor;
    const r = computeAll(d2, { useSubstituteFor: subs });
    const models = affected.models.map((id) => {
      const o = original.models.find((x) => x.id === id);
      const b = now.models.find((x) => x.id === id);
      const a = r.models.find((x) => x.id === id);
      return { id, name: a.name, original: o.status, disrupted: b.status, after: a.status, eta: [a.eta.early, a.eta.late], launch: a.launchDate, restored: rank(a.status) <= rank(o.status) };
    });
    const harmed = r.models.filter((m) => !affected.models.includes(m.id) && rank(m.status) > rank(now.models.find((x) => x.id === m.id).status)).map((m) => m.name);
    const improved = models.some((x) => rank(x.after) < rank(x.disrupted)) || gapTotal(r) < gapTotal(now) || worstLate(r) < worstLate(now);
    const remaining = r.lines.filter((l) => affected.lines.includes(l.id) && gapOf(l) > 0)
      .map((l) => ({ id: l.id, part: l.part, shortfall: l.shortfall, lateQty: l.lateQty, lateDays: l.lateDays, reason: l.reasons[0] ?? '' }));
    const testStarts = affected.chipsets.map((id) => ({ id, before: now.chipsets[id].eta.testStart, after: r.chipsets[id].eta.testStart, planned: r.chipsets[id].plannedTestStart }));
    const option = { ...c, ...describe(c, cur), key, models, remaining, testStarts, restoredCount: models.filter((x) => x.restored).length };
    if (harmed.length) out.considered.push({ ...option, why: `Not offered: it would make ${harmed.join(', ')} worse (competing demand).` });
    else if (!improved) out.considered.push({ ...option, why: 'Not offered: it does not improve any affected launch.' });
    else out.options.push(option);
  }
  const typeOrder = { transfer: 0, substitute: 1, moveLaunch: 2 };
  out.options.sort((a, b) => b.restoredCount - a.restoredCount || typeOrder[a.type] - typeOrder[b.type] ||
    (a.models.map((x) => x.eta[1] ?? '9999').sort().at(-1)).localeCompare(b.models.map((x) => x.eta[1] ?? '9999').sort().at(-1)));
  out.recommended = out.options[0] ?? null;
  if (!out.recommended || out.recommended.restoredCount < affected.models.length) {
    const left = (out.recommended ? out.recommended.models.filter((x) => !x.restored) : affected.models.map((id) => ({ name: now.models.find((m) => m.id === id).name, after: now.models.find((m) => m.id === id).status })));
    out.escalation = left.length
      ? `${out.recommended ? 'Even with the best option, ' : 'No eligible action helps. '}${left.map((x) => `${x.name} (${x.after === 'blocked' ? 'blocked' : 'at risk'})`).join(', ')} ${left.length === 1 ? 'is' : 'are'} not resolved. Escalate: ask the supplier to expedite or confirm a date, or take a launch-date decision outside the ${cfg.maxLaunchMoveDays}-day window.`
      : null;
  }
  return out;
}

/** Days between two ISO dates, signed; exported for the UI's "+N days" labels. */
export const shiftDays = (a, b) => daysBetween(a, b);
