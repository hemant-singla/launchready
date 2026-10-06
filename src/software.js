// Software side: when will each chipset's software be ready?
//
// The ready date is a RANGE (earliest .. latest), built from three things:
//   1. Testing can only start when all teams' code is in AND test boards exist.
//   2. Testing takes a fixed window (longer for new chipsets), followed by a
//      stabilisation tail for issues found late in testing.
//   3. Open tickets must be fixed. Each ticket takes a range of days by
//      severity; each team works through its own backlog with its capacity.
// The earliest date uses the optimistic end of every range, the latest date
// the pessimistic end. No guessing: every input comes from the data files.
import { addDays, latest, daysBetween } from './dates.js';

/** Open tickets for a chipset, with age in days. */
export function openTickets(data, chipset) {
  return data.tickets
    .filter((t) => t.chipset === chipset && t.status === 'open')
    .map((t) => ({ ...t, ageDays: daysBetween(data.config.asOf, t.openedOn) }));
}

/** Per-team backlog in days: [optimistic, pessimistic], given team capacity. */
export function teamBacklog(data, chipset, extraWork = []) {
  const { fixDays } = data.config;
  const out = {};
  for (const team of data.teams) {
    const mine = openTickets(data, chipset).filter((t) => t.team === team.id);
    let lo = mine.reduce((n, t) => n + fixDays[t.severity][0], 0);
    let hi = mine.reduce((n, t) => n + fixDays[t.severity][1], 0);
    for (const w of extraWork.filter((w) => w.team === team.id)) { lo += w.days[0]; hi += w.days[1]; }
    out[team.id] = {
      tickets: mine.length,
      days: [Math.ceil(lo / team.fixCapacity), Math.ceil(hi / team.fixCapacity)],
    };
  }
  return out;
}

/**
 * Software-ready range for one chipset.
 * @param boardsReadyDate date all test boards are available (from supply), or
 *        null when supply cannot cover them. Ignored once testing has started.
 * @param extraWork extra fix work, e.g. [{ team: 'Audio', days: [2, 5] }]
 * @param testStartDelay [lo, hi] days testing waits on top of that, e.g. a
 *        driver change for a substitute part must land before testing.
 * @param extraTestDays [lo, hi] extra validation inside the test cycle, e.g.
 *        re-testing the new driver on substitute boards.
 */
export function softwareEta(data, chipsetId, { boardsReadyDate = undefined, extraWork = [], testStartDelay = [0, 0], extraTestDays = [0, 0] } = {}) {
  const cfg = data.config;
  const c = data.chipsets.find((x) => x.id === chipsetId);
  const subs = data.submissions.filter((s) => s.chipset === chipsetId);
  const pending = subs.filter((s) => !s.submittedOn);
  const unknownCode = pending.filter((s) => !s.expectedOn);
  const codeComplete = latest(...subs.map((s) => s.submittedOn ?? s.expectedOn));

  const notes = [];
  let testStart;
  if (c.testStartedOn) {
    testStart = c.testStartedOn;
  } else {
    if (unknownCode.length) notes.push(`${unknownCode.map((s) => s.team).join(', ')} code has no expected date`);
    if (boardsReadyDate === null) notes.push('test boards are not covered by supply');
    if (unknownCode.length || boardsReadyDate === null) {
      return { chipset: chipsetId, known: false, notes, pending, codeComplete, testStart: null, early: null, late: null, backlog: teamBacklog(data, chipsetId, extraWork) };
    }
    testStart = latest(c.plannedTestStart, addDays(codeComplete, cfg.boardBringUpDays), boardsReadyDate);
  }

  const kind = c.isNew ? 'new' : 'reused';
  const window = cfg.testWindowDays[kind];
  const [tailLo, tailHi] = cfg.stabilisationDays[kind];
  const startLo = addDays(testStart, testStartDelay[0]);
  const startHi = addDays(testStart, testStartDelay[1]);
  const backlog = teamBacklog(data, chipsetId, extraWork);
  const worstLo = Math.max(0, ...Object.values(backlog).map((b) => b.days[0]));
  const worstHi = Math.max(0, ...Object.values(backlog).map((b) => b.days[1]));
  // Fixing can't start before boards are on the bench (or before today).
  const fixLo = latest(cfg.asOf, startLo);
  const fixHi = latest(cfg.asOf, startHi);

  return {
    chipset: chipsetId, known: true, notes, pending, codeComplete,
    testStart: startLo, testStartLatest: startHi, testEnd: addDays(startHi, window + extraTestDays[1]),
    slipDays: daysBetween(startLo, c.plannedTestStart),
    early: latest(addDays(startLo, window + extraTestDays[0] + tailLo), addDays(fixLo, worstLo)),
    late: latest(addDays(startHi, window + extraTestDays[1] + tailHi), addDays(fixHi, worstHi)),
    backlog,
  };
}

/** Software status for a model with launch date `launch`, given its chipset's ETA. */
export function softwareStatus(data, eta, launch) {
  const cfg = data.config;
  const reasons = [];
  const crit = openTickets(data, eta.chipset).filter((t) => t.severity === 'critical');
  const cutoff = addDays(launch, -cfg.bufferDays);

  if (!eta.known) {
    return { status: 'blocked', reasons: [`${eta.chipset} software date unknown: ${eta.notes.join('; ')}`] };
  }
  // A pending submission only matters once it is overdue or expected after the deadline.
  for (const s of eta.pending.filter((s) => s.expectedOn > s.dueDate || cfg.asOf > s.dueDate)) {
    reasons.push(`${s.team} code for ${eta.chipset} is late: due ${s.dueDate}, now expected ${s.expectedOn}`);
  }
  if (crit.length) reasons.push(`${crit.length} open critical ticket${crit.length > 1 ? 's' : ''} on ${eta.chipset} (oldest ${Math.max(...crit.map((t) => t.ageDays))} days)`);
  // A late test start is context, not a verdict: its effect is already in the ETA.
  const context = [];
  if (eta.slipDays > 0) {
    const hi = daysBetween(eta.testStartLatest, eta.testStart) + eta.slipDays;
    const days = hi > eta.slipDays ? `${eta.slipDays}–${hi} days` : `${eta.slipDays} day${eta.slipDays > 1 ? 's' : ''}`;
    context.push(`${eta.chipset} testing starts ${days} late (planned ${data.chipsets.find((c) => c.id === eta.chipset).plannedTestStart})`);
  }

  if (eta.early > launch) {
    return { status: 'blocked', reasons: [`${eta.chipset} software ready ${eta.early}–${eta.late}: even the earliest date is after launch (${launch})`, ...reasons, ...context] };
  }
  if (eta.late > cutoff) {
    reasons.unshift(`${eta.chipset} software ready ${eta.early}–${eta.late}; latest date misses the ${cfg.bufferDays}-day buffer before launch (${cutoff})`);
    return { status: 'at-risk', reasons: [...reasons, ...context] };
  }
  return reasons.length ? { status: 'at-risk', reasons: [...reasons, ...context] } : { status: 'ready', reasons: [] };
}
