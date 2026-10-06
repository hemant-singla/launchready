// The what-if simulator ("lab") on the start page. Two small pure functions:
//   applyLab(data, lab)        -> a new dataset with the user's edits applied
//   knockOn(before, after, d)  -> the chain of effects, in plain sentences
// Like everything in src/, these are tested and used as-is by the app.
import { addDays, fmtDate } from './dates.js';

/**
 * lab = { delivery, mode: 'delay' | 'reject' | 'nodate', delay (days, may be negative),
 *         model, shift (days to move that model's launch) }
 */
export function applyLab(data, lab) {
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
export const substituteOptions = (result) =>
  [...new Set(result.lines.filter((l) => l.kind === 'test-boards' && l.substitute).map((l) => l.chipset))];

const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const span = (e) => (e.known ? `${fmtDate(e.early, true)} – ${fmtDate(e.late, true)}` : 'unknown');

/**
 * Compare two computed results and list what changed, in the order a launch
 * manager would trace it: parts -> testing -> software -> launch.
 */
export function knockOn(before, after, data) {
  const out = [];
  const name = (l) => (l.kind === 'test-boards' ? `${l.chipset} test boards` : `${data.models.find((m) => m.id === l.model).name} production`);
  for (const l of after.lines) {
    const b = before.lines.find((x) => x.id === l.id);
    if (!b || (b.shortfall === l.shortfall && b.lateQty === l.lateQty && b.lateDays === l.lateDays && b.status === l.status)) continue;
    let text;
    if (l.shortfall > 0) text = `${name(l)}: ${l.shortfall.toLocaleString('en-US')} of ${l.qty.toLocaleString('en-US')} ${l.part} not covered`;
    else if (l.lateQty > 0) text = `${name(l)}: ${l.lateQty.toLocaleString('en-US')} of ${l.qty.toLocaleString('en-US')} ${l.part} arrive ${l.lateDays} days after they're needed`;
    else text = `${name(l)}: ${l.part} now covered on time`;
    out.push({ stage: 'parts', status: l.status, text });
  }
  for (const [id, c] of Object.entries(after.chipsets)) {
    const b = before.chipsets[id];
    if (c.eta.testStart !== b.eta.testStart) {
      out.push({ stage: 'testing', status: c.eta.testStart && b.eta.testStart && c.eta.testStart < b.eta.testStart ? 'ready' : 'at-risk',
        text: c.eta.testStart ? `${id} testing starts ${fmtDate(c.eta.testStart, true)} (was ${b.eta.testStart ? fmtDate(b.eta.testStart, true) : 'unknown'})` : `${id} testing can't be scheduled: boards have no date`,
        });
    }
    if (c.eta.early !== b.eta.early || c.eta.late !== b.eta.late) {
      out.push({ stage: 'software', status: c.eta.known && b.eta.known && c.eta.late < b.eta.late ? 'ready' : 'at-risk', text: `${id} software ready ${span(c.eta)} (was ${span(b.eta)})` });
    }
  }
  for (const m of after.models) {
    const b = before.models.find((x) => x.id === m.id);
    if (b.status === m.status && b.launchDate === m.launchDate) continue;
    out.push({ stage: 'launch', status: m.status, model: m.id, text: modelText(m, b), why: mainReason(m, after) });
  }
  return out;
}

const RANK = { ready: 0, 'at-risk': 1, blocked: 2 };
/** The one reason that decides a model's verdict: from the worse side, and on
 *  the supply side from the build line with the worst status. */
export function mainReason(m, result) {
  if (m.status === 'ready') return '';
  if (RANK[m.software.status] >= RANK[m.supply.status]) return m.software.reasons[0] ?? '';
  const line = result.lines.find((l) => (l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset)) && l.status === m.supply.status && l.reasons.length);
  return line?.reasons[0] ?? m.supply.reasons[0] ?? '';
}

function modelText(m, b) {
  const moved = b.launchDate !== m.launchDate ? ` · launch ${fmtDate(m.launchDate, true)} (was ${fmtDate(b.launchDate, true)})` : '';
  return `${m.name}: ${b.status === m.status ? LABEL[m.status] : `${LABEL[b.status]} → ${LABEL[m.status]}`}${moved}`;
}

/**
 * One plain-language sentence a non-specialist can read: what is at risk and
 * why, built from the calculated result (no numbers are typed in).
 */
export function explain(m, result, data) {
  if (m.status === 'ready') return `${m.name} is on track for ${fmtDate(m.launchDate, true)}.`;
  const lead = m.status === 'blocked' ? `${m.name} will miss its ${fmtDate(m.launchDate, true)} launch unless something changes:` : `${m.name} may miss its ${fmtDate(m.launchDate, true)} launch:`;
  const partName = (id) => data.parts.find((p) => p.id === id)?.name ?? id;
  const n = (x) => x.toLocaleString('en-US');
  const cutoff = addDays(m.launchDate, -data.config.bufferDays);
  const mine = result.lines.filter((l) => l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset));
  const tb = mine.find((l) => l.kind === 'test-boards' && (l.lateQty || l.shortfall));
  const swFirst = RANK[m.software.status] >= RANK[m.supply.status];
  if (swFirst) {
    const e = m.eta;
    if (tb && e.known && e.slipDays > 0) {
      return `${lead} ${n(tb.lateQty || tb.shortfall)} of its ${n(tb.qty)} test boards depend on a delayed ${partName(tb.part)} delivery, so testing starts ${e.slipDays} days late and the software is expected ${fmtDate(e.early, true)}–${fmtDate(e.late, true)}, after the ${fmtDate(cutoff, true)} cutoff.`;
    }
    if (!e.known) return `${lead} its software date can't be calculated yet (${e.notes.join('; ')}).`;
    const pretty = (t) => t.replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
    const late = e.late > cutoff ? ` The software is expected ${fmtDate(e.early, true)}–${fmtDate(e.late, true)}, after the ${fmtDate(cutoff, true)} cutoff.` : '';
    const code = m.software.reasons.find((r) => /code/i.test(r));
    if (code) return `${lead} ${pretty(code)}.${late}`;
    const crit = m.software.reasons.find((r) => /critical/i.test(r));
    if (crit) return `${lead} ${pretty(crit).replace(/^(\d+) open critical ticket/, '$1 open critical bug')} must be fixed before launch.${late}`;
    return `${lead}${late || ` ${pretty(m.software.reasons[0] ?? '')}.`}`;
  }
  const order = { blocked: 2, 'at-risk': 1, ready: 0 };
  const l = [...mine].sort((a, b) => order[b.status] - order[a.status])[0];
  const what = l.kind === 'test-boards' ? 'its test boards' : 'its first production run';
  const pn = partName(l.part);
  if (l.shortfall && l.undatedQty) return `${lead} ${n(l.shortfall)} ${pn} parts for ${what} depend on a delivery that has no confirmed date.`;
  if (l.shortfall) return `${lead} ${n(l.shortfall)} of ${n(l.qty)} ${pn} parts for ${what} are not covered by stock or any dated delivery.`;
  if (l.lateQty) return `${lead} ${n(l.lateQty)} of ${n(l.qty)} ${pn} parts for ${what} arrive ${l.lateDays} days after they're needed${l.undatedQty ? ', unless a delivery with no confirmed date turns up in time' : ''}.`;
  if (l.tight) return `${lead} the ${pn} delivery for ${what} lands with less than ${data.config.tightDeliveryDays} days to spare.`;
  const r = (m.supply.reasons[0] ?? '').replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
  return `${lead} ${r.charAt(0).toLowerCase()}${r.slice(1)}.`;
}
