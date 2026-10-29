// The dependency chain for one launch, in the order the risk travels:
// test-board parts -> testing -> software -> production parts -> launch.
// Each step carries its own status, so the first broken link is visible.
import { daysBetween } from '../../engine/dates';
import type { Dataset, ModelResult, Result, Status } from '../../engine/types';
import { cutoffOf, date, num, partName, STATUS_RANK } from './format';

export interface ChainStep {
  key: 'boards' | 'testing' | 'software' | 'production' | 'launch';
  name: string;
  value: string;
  sub: string;
  status: Status;
  /** The baseline value when it changed, shown struck through. */
  was?: string;
}

const worstOf = <T extends { status: Status }>(xs: T[]) => [...xs].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])[0];

function boardsStep(m: ModelResult, r: Result, data: Dataset): ChainStep {
  const chip = r.chipsets[m.chipset];
  if (chip.testStartedOn) return { key: 'boards', name: 'Test boards', value: 'Built', sub: `testing since ${date(chip.testStartedOn)}`, status: 'ready' };
  const lines = r.lines.filter((l) => l.kind === 'test-boards' && l.chipset === m.chipset);
  const l = worstOf(lines);
  if (!l) return { key: 'boards', name: 'Test boards', value: 'No parts needed', sub: '', status: 'ready' };
  const usingSub = chip.usingSubstitute && l.substitute;
  if (usingSub) return { key: 'boards', name: 'Test boards', value: `Substitute ${l.substitute!.part}`, sub: `driver change ${l.substitute!.driverChangeDays.join('–')} days`, status: 'at-risk' };
  if (l.shortfall) return { key: 'boards', name: 'Test boards', value: `${num(l.shortfall)} parts short`, sub: partName(data, l.part), status: l.status };
  if (l.lateQty) return { key: 'boards', name: 'Test boards', value: `Parts ${date(l.readyDate)}`, sub: `${l.lateDays} days after ${date(l.needDate)} · ${partName(data, l.part)}`, status: l.status };
  return { key: 'boards', name: 'Test boards', value: `Parts by ${date(chip.boardsReadyDate)}`, sub: `needed ${date(l.needDate)}`, status: l.status };
}

function testingStep(m: ModelResult, r: Result): ChainStep {
  const chip = r.chipsets[m.chipset];
  const e = m.eta;
  if (chip.testStartedOn) return { key: 'testing', name: 'Testing', value: `Started ${date(chip.testStartedOn)}`, sub: 'on the bench', status: 'ready' };
  if (!e.known) return { key: 'testing', name: 'Testing', value: "Can't schedule", sub: e.notes.join('; '), status: 'blocked' };
  const range = e.testStartLatest !== e.testStart ? `${date(e.testStart)}–${date(e.testStartLatest)}` : date(e.testStart);
  return {
    key: 'testing',
    name: 'Testing',
    value: `Starts ${range}`,
    sub: e.slipDays > 0 ? `${e.slipDays} days late (plan ${date(chip.plannedTestStart)})` : `plan ${date(chip.plannedTestStart)}`,
    status: e.slipDays > 0 ? 'at-risk' : 'ready',
  };
}

function softwareStep(m: ModelResult, data: Dataset): ChainStep {
  const e = m.eta;
  const cutoff = cutoffOf(data, m.launchDate);
  return {
    key: 'software',
    name: 'Software',
    value: e.known ? `${date(e.early)}–${date(e.late)}` : 'Unknown',
    sub: `must be ready by ${date(cutoff)}`,
    status: m.software.status,
  };
}

function productionStep(m: ModelResult, r: Result, data: Dataset): ChainStep {
  const l = worstOf(r.lines.filter((x) => x.model === m.id));
  if (!l) return { key: 'production', name: 'Production parts', value: 'Covered', sub: '', status: 'ready' };
  const pn = partName(data, l.part);
  if (l.shortfall) return { key: 'production', name: 'Production parts', value: `${num(l.shortfall)} short`, sub: l.undatedQty ? `${pn} · delivery has no date` : pn, status: l.status };
  if (l.lateQty) return { key: 'production', name: 'Production parts', value: `${l.lateDays} days late`, sub: pn, status: l.status };
  if (l.tight) return { key: 'production', name: 'Production parts', value: 'Covered, tight', sub: pn, status: l.status };
  return { key: 'production', name: 'Production parts', value: 'Covered', sub: `needed ${date(l.needDate)}`, status: 'ready' };
}

function launchStep(m: ModelResult, data: Dataset): ChainStep {
  const days = daysBetween(m.launchDate, data.config.asOf);
  return { key: 'launch', name: 'Launch', value: date(m.launchDate), sub: `in ${days} days`, status: m.status };
}

export function chainFor(m: ModelResult, r: Result, data: Dataset, baseline?: { m: ModelResult; r: Result; data: Dataset }): ChainStep[] {
  const steps = [boardsStep(m, r, data), testingStep(m, r), softwareStep(m, data), productionStep(m, r, data), launchStep(m, data)];
  if (baseline) {
    const before = [boardsStep(baseline.m, baseline.r, baseline.data), testingStep(baseline.m, baseline.r), softwareStep(baseline.m, baseline.data), productionStep(baseline.m, baseline.r, baseline.data), launchStep(baseline.m, baseline.data)];
    steps.forEach((s, i) => {
      if (before[i].value !== s.value) s.was = before[i].value;
    });
  }
  return steps;
}
