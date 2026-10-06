// Substitute-part software check: if we build test boards with the approved
// substitute part, does the extra driver work still fit before launch?
import { computeAll } from './engine.js';

export function substituteCheck(data, chipsetId) {
  const before = computeAll(data);
  const lines = before.lines.filter((l) => l.kind === 'test-boards' && l.chipset === chipsetId && l.substitute);
  if (!lines.length) {
    const gaps = before.lines.filter((l) => l.kind === 'test-boards' && l.chipset === chipsetId && (l.shortfall || l.lateQty));
    return { possible: false, reason: gaps.length ? 'no approved substitute with enough free stock for the gap' : 'test boards are not short or late, no substitute needed' };
  }
  const after = computeAll(data, { useSubstituteFor: [chipsetId] });
  const models = before.models.filter((m) => m.chipset === chipsetId).map((m) => {
    const a = after.models.find((x) => x.id === m.id);
    return { model: m.id, launch: m.launchDate, before: { status: m.status, eta: [m.eta.early, m.eta.late] }, after: { status: a.status, eta: [a.eta.early, a.eta.late] } };
  });
  return {
    possible: true,
    substitutes: lines.map((l) => l.substitute),
    testStart: [after.chipsets[chipsetId].eta.testStart, after.chipsets[chipsetId].eta.testStartLatest],
    models,
  };
}
