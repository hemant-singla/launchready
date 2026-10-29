// Decision state: which recovery actions were approved, and the activity log.
// Pure functions so the rules can be tested:
//   approving adds the action (the data changes); rejecting only logs it;
//   reset returns to the original plan.
import type { Action } from './recovery';

export interface LogEntry {
  n: number;
  decision: 'approved' | 'rejected' | 'note';
  title: string;
  result: string;
  /** When it happened (ISO timestamp); set by the app, not by the engine. */
  at?: string;
}
export interface Decisions { actions: Action[]; log: LogEntry[] }

export const initialDecisions = (): Decisions => ({ actions: [], log: [] });

const actionOf = (opt: Action): Action => {
  switch (opt.type) {
    case 'transfer': return { type: 'transfer', from: opt.from, part: opt.part, qty: opt.qty, toChipset: opt.toChipset, arrive: opt.arrive };
    case 'substitute': return { type: 'substitute', chipset: opt.chipset };
    case 'moveLaunch': return { type: 'moveLaunch', model: opt.model, date: opt.date, days: opt.days };
  }
};

/** Record a decision on a recovery option. `result` is a short calculated summary for the log. */
export function decide(state: Decisions, option: Action & { title: string }, approved: boolean, result = ''): Decisions {
  const entry: LogEntry = { n: state.log.length + 1, decision: approved ? 'approved' : 'rejected', title: option.title, result };
  return {
    actions: approved ? [...state.actions, actionOf(option)] : state.actions,
    log: [...state.log, entry],
  };
}

/** Withdraw the most recent approval: its action is removed and the log says so. */
export function undoLast(state: Decisions): Decisions {
  if (!state.actions.length) return state;
  const last = [...state.log].reverse().find((e) => e.decision === 'approved');
  return note({ ...state, actions: state.actions.slice(0, -1) }, `Undid approval: ${last?.title ?? 'last action'}`);
}

/** Add a plain note (e.g. "agent run started") to the log. */
export const note = (state: Decisions, text: string): Decisions =>
  ({ ...state, log: [...state.log, { n: state.log.length + 1, decision: 'note', title: text, result: '' }] });
