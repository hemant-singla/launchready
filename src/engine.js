// Joins both sides: supply allocation feeds test-board dates into the software
// ETA, and every model gets one status = the worse of its two sides.
import { allocate } from './supply.js';
import { softwareEta, softwareStatus } from './software.js';
import { latest } from './dates.js';

export const STATUS_ORDER = { ready: 0, 'at-risk': 1, blocked: 2 };
export const worst = (...statuses) => statuses.reduce((a, b) => (STATUS_ORDER[b] > STATUS_ORDER[a] ? b : a), 'ready');

/**
 * Compute everything the app shows.
 * @param opts.useSubstituteFor chipset ids where the approved substitute part
 *        is applied to their test boards (adds the driver-change work).
 */
export function computeAll(data, { useSubstituteFor = [] } = {}) {
  const { lines, sources } = allocate(data);

  const chipsets = {};
  for (const c of data.chipsets) {
    const tb = lines.filter((l) => l.kind === 'test-boards' && l.chipset === c.id);
    const useSub = useSubstituteFor.includes(c.id);
    let testStartDelay = [0, 0];
    let extraTestDays = [0, 0];
    let boardsReadyDate;
    if (!c.testStartedOn) {
      const dates = [];
      let covered = true;
      for (const l of tb) {
        if (useSub && l.substitute) {
          dates.push(l.needDate); // substitute stock is on hand by the need date
          // The driver change must land before testing on substitute boards.
          testStartDelay = [Math.max(testStartDelay[0], l.substitute.driverChangeDays[0]), Math.max(testStartDelay[1], l.substitute.driverChangeDays[1])];
          // ...and the new driver needs its own validation inside the test cycle.
          extraTestDays = [Math.max(extraTestDays[0], l.substitute.validationDays[0]), Math.max(extraTestDays[1], l.substitute.validationDays[1])];
        } else if (l.shortfall > 0) covered = false;
        else dates.push(l.readyDate);
      }
      boardsReadyDate = covered ? latest(c.plannedTestStart, ...dates) : null;
    }
    chipsets[c.id] = { ...c, boardsReadyDate, usingSubstitute: useSub && testStartDelay[1] > 0, eta: softwareEta(data, c.id, { boardsReadyDate, testStartDelay, extraTestDays }) };
  }

  const models = data.models.map((m) => {
    const chip = chipsets[m.chipset];
    const sw = softwareStatus(data, chip.eta, m.launchDate);
    const mine = lines.filter((l) => l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset));
    const supplyReasons = [];
    let supplyStatus = 'ready';
    for (const l of mine) {
      if (chip.usingSubstitute && l.kind === 'test-boards' && l.substitute) {
        supplyStatus = worst(supplyStatus, 'at-risk');
        supplyReasons.push(`${m.chipset} test boards use substitute ${l.substitute.part} for ${l.substitute.qty} units (pending ${l.substitute.driverTeam} driver change)`);
        continue;
      }
      supplyStatus = worst(supplyStatus, l.status);
      supplyReasons.push(...l.reasons);
    }
    return {
      ...m,
      software: sw,
      supply: { status: supplyStatus, reasons: supplyReasons },
      status: worst(sw.status, supplyStatus),
      eta: chip.eta,
    };
  });

  return { models, chipsets, lines, sources };
}
