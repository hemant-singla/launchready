// Holds the workspace state, mirrors it into the URL, and derives every
// computed result from it (see workspace.ts for the state and its encoding).
import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { SCENARIOS, type ScenarioKey } from '../../engine/scenarios';
import { applyLab, type Lab } from '../../engine/lab';
import { affectedBy, computeWith, type Action } from '../../engine/recovery';
import { parseHash, replaceQuery } from '../lib/router';
import { BASE, BASELINE, decodeWorkspace, describeLab, encodeWorkspace, reducer, WorkspaceContext, type Workspace } from './workspace';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => decodeWorkspace(parseHash(window.location.hash).query.get('w')));

  // Mirror the shareable part of the state into the URL.
  useEffect(() => {
    const query = parseHash(window.location.hash).query;
    const w = encodeWorkspace(state);
    if (w) query.set('w', w);
    else query.delete('w');
    replaceQuery(query.toString());
  }, [state]);

  const derived = useMemo(() => {
    let disrupted = BASE;
    for (const k of state.scenarios) disrupted = SCENARIOS[k].apply(disrupted);
    if (state.lab) disrupted = applyLab(disrupted, state.lab);
    const { data, result } = computeWith(disrupted, state.decisions.actions);
    const affected = affectedBy(BASELINE, result);
    const disruptions = [
      ...state.scenarios.map((k) => SCENARIOS[k].summary),
      ...(state.lab ? [describeLab(BASE, state.lab)].filter(Boolean) : []),
    ];
    return { disrupted, data, result, affected, disruptions, isDisrupted: disruptions.length > 0 || state.decisions.actions.length > 0 };
  }, [state.scenarios, state.lab, state.decisions.actions]);

  const toggleScenario = useCallback((key: ScenarioKey) => dispatch({ type: 'toggleScenario', key }), []);
  const setLab = useCallback(
    (lab: Lab | null) => dispatch({ type: 'setLab', lab, label: lab ? `Simulated: ${describeLab(BASE, lab)}` : 'Cleared the custom what-if' }),
    [],
  );
  const approve = useCallback((option: Action & { title: string }, result: string) => dispatch({ type: 'decide', option, approved: true, result }), []);
  const reject = useCallback((option: Action & { title: string }) => dispatch({ type: 'decide', option, approved: false, result: 'No change to the plan' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo<Workspace>(
    () => ({ state, base: BASE, baseline: BASELINE, ...derived, toggleScenario, setLab, approve, reject, undo, reset }),
    [state, derived, toggleScenario, setLab, approve, reject, undo, reset],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

