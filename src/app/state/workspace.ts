// Workspace state: which disruptions are applied (preset scenarios plus one
// custom what-if), which recovery actions were approved, and the activity log.
//
// The disruption and the approved actions are mirrored into the URL (?w=...),
// so any view can be shared as a link and reopened in the same state. All
// numbers are derived from this state by the engine; nothing else is stored.
// The provider component lives in WorkspaceProvider.tsx.
import { createContext, useContext, useMemo } from 'react';
import { loadData } from '../../engine/data';
import { computeAll } from '../../engine/compute';
import { SCENARIOS, type ScenarioKey } from '../../engine/scenarios';
import type { Lab } from '../../engine/lab';
import { recoveryOptions, type Action, type Affected, type Recovery } from '../../engine/recovery';
import { decide, initialDecisions, note, undoLast, type Decisions } from '../../engine/decisions';
import type { Dataset, Result } from '../../engine/types';
import { date, partName } from '../lib/format';

export interface WorkspaceState {
  scenarios: ScenarioKey[];
  lab: Lab | null;
  decisions: Decisions;
}

type Msg =
  | { type: 'toggleScenario'; key: ScenarioKey }
  | { type: 'setLab'; lab: Lab | null; label: string }
  | { type: 'decide'; option: Action & { title: string }; approved: boolean; result: string }
  | { type: 'undo' }
  | { type: 'reset' };

const EMPTY: WorkspaceState = { scenarios: [], lab: null, decisions: initialDecisions() };

/** Stamp the newest log entry with the current time. */
const stamp = (d: Decisions): Decisions => {
  const last = d.log.at(-1);
  return last && !last.at ? { ...d, log: [...d.log.slice(0, -1), { ...last, at: new Date().toISOString() }] } : d;
};

export function reducer(state: WorkspaceState, msg: Msg): WorkspaceState {
  const next = update(state, msg);
  return next === state ? state : { ...next, decisions: stamp(next.decisions) };
}

function update(state: WorkspaceState, msg: Msg): WorkspaceState {
  switch (msg.type) {
    case 'toggleScenario': {
      const on = state.scenarios.includes(msg.key);
      const scenarios = on ? state.scenarios.filter((k) => k !== msg.key) : [...state.scenarios, msg.key];
      const text = `${on ? 'Removed' : 'Applied'} disruption: ${SCENARIOS[msg.key].title}`;
      return { ...state, scenarios, decisions: note(state.decisions, text) };
    }
    case 'setLab':
      return { ...state, lab: msg.lab, decisions: note(state.decisions, msg.label) };
    case 'decide':
      return { ...state, decisions: decide(state.decisions, msg.option, msg.approved, msg.result) };
    case 'undo':
      return { ...state, decisions: undoLast(state.decisions) };
    case 'reset':
      return { ...EMPTY, decisions: note(initialDecisions(), 'Workspace reset to the original plan') };
  }
}

// ---------- URL encoding ----------

interface Encoded { s?: ScenarioKey[]; l?: Lab; a?: Action[] }

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function encodeWorkspace(state: WorkspaceState): string {
  const e: Encoded = {};
  if (state.scenarios.length) e.s = state.scenarios;
  if (state.lab) e.l = state.lab;
  if (state.decisions.actions.length) e.a = state.decisions.actions;
  return Object.keys(e).length ? toBase64Url(JSON.stringify(e)) : '';
}

export function decodeWorkspace(w: string | null): WorkspaceState {
  if (!w) return EMPTY;
  try {
    const e = JSON.parse(fromBase64Url(w)) as Encoded;
    const scenarios = (e.s ?? []).filter((k): k is ScenarioKey => k in SCENARIOS);
    const actions = e.a ?? [];
    const decisions: Decisions = actions.length
      ? { actions, log: [{ n: 1, decision: 'note', title: `Opened a shared link with ${actions.length} approved action${actions.length > 1 ? 's' : ''}`, result: '' }] }
      : initialDecisions();
    return { scenarios, lab: e.l ?? null, decisions };
  } catch {
    return EMPTY; // a broken link opens the original plan rather than failing
  }
}

// ---------- derived data ----------

export const BASE: Dataset = loadData();
export const BASELINE: Result = computeAll(BASE);

export interface Workspace {
  state: WorkspaceState;
  /** Original data and plan, before any disruption. */
  base: Dataset;
  baseline: Result;
  /** Data with the disruption applied (before recovery actions). */
  disrupted: Dataset;
  /** Data and result after approved actions: what every view shows. */
  data: Dataset;
  result: Result;
  affected: Affected;
  isDisrupted: boolean;
  /** Plain descriptions of the active disruptions. */
  disruptions: string[];
  toggleScenario: (key: ScenarioKey) => void;
  setLab: (lab: Lab | null) => void;
  approve: (option: Action & { title: string }, result: string) => void;
  reject: (option: Action & { title: string }) => void;
  undo: () => void;
  reset: () => void;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export function describeLab(data: Dataset, lab: Lab): string {
  const d = data.deliveries.find((x) => x.id === lab.delivery);
  const what = d ? `${partName(data, d.part)} shipment (${d.id})` : lab.delivery;
  const parts: string[] = [];
  if (lab.mode === 'reject') parts.push(`${what} rejected at inspection`);
  else if (lab.mode === 'nodate') parts.push(`${what} has no confirmed date`);
  else if (lab.delay) parts.push(`${what} ${lab.delay > 0 ? `${lab.delay} days late` : `${-lab.delay} days early`}${d?.eta ? ` (due ${date(d.eta)})` : ''}`);
  if (lab.shift) {
    const m = data.models.find((x) => x.id === lab.model);
    parts.push(`${m?.name ?? lab.model} launch moved ${lab.shift > 0 ? `${lab.shift} days later` : `${-lab.shift} days earlier`}`);
  }
  return parts.join('; ');
}

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ws;
}

// Recovery search re-runs the engine for every candidate action, so it is
// computed only where it is shown, and cached per disruption + actions.
const recoveryCache = new Map<string, Recovery>();
export function useRecovery(): Recovery {
  const { disrupted, state } = useWorkspace();
  const key = JSON.stringify([state.scenarios, state.lab, state.decisions.actions]);
  return useMemo(() => {
    let rec = recoveryCache.get(key);
    if (!rec) {
      rec = recoveryOptions(BASELINE, disrupted, state.decisions.actions);
      recoveryCache.set(key, rec);
    }
    return rec;
  }, [key, disrupted, state.decisions.actions]);
}
