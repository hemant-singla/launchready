// Demo state for decisions: which recovery actions were approved, and the
// activity log. Pure functions so the rules can be tested:
//   approving adds the action (the data changes); rejecting only logs it;
//   reset returns to the original plan.
export const initialDemo = () => ({ actions: [], log: [] });

const ACTION_KEYS = ['type', 'from', 'part', 'qty', 'toChipset', 'arrive', 'chipset', 'model', 'date', 'days'];
const actionOf = (opt) => Object.fromEntries(ACTION_KEYS.filter((k) => opt[k] !== undefined).map((k) => [k, opt[k]]));

/** Record a decision on a recovery option. `result` is a short calculated summary for the log. */
export function decide(demo, option, approved, result = '') {
  const entry = { n: demo.log.length + 1, decision: approved ? 'approved' : 'rejected', title: option.title, result };
  return {
    actions: approved ? [...demo.actions, actionOf(option)] : demo.actions,
    log: [...demo.log, entry],
  };
}

/** Add a plain note (e.g. "agent run started") to the log. */
export const note = (demo, text) => ({ ...demo, log: [...demo.log, { n: demo.log.length + 1, decision: 'note', title: text, result: '' }] });
