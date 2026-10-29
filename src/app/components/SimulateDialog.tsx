// "Simulate a disruption": preset scenarios plus a custom what-if on any
// shipment or launch date. Shows the impact live before it is applied.
import { useMemo, useState } from 'react';
import { SCENARIOS, type ScenarioKey } from '../../engine/scenarios';
import { applyLab, type Lab, type LabMode } from '../../engine/lab';
import { computeAll } from '../../engine/compute';
import { addDays } from '../../engine/dates';
import { useWorkspace } from '../state/workspace';
import { date, num, partName, plural } from '../lib/format';
import { Dialog } from './ui';

const DEFAULT_LAB: Lab = { delivery: 'DL-UC3-01', mode: 'delay', delay: 0, model: 'HAL-77', shift: 0 };
const isChange = (l: Lab) => l.mode !== 'delay' || l.delay !== 0 || l.shift !== 0;
const DELAY: [number, number] = [-14, 60];
const SHIFT: [number, number] = [-21, 42];

export function SimulateDialog({ onClose }: { onClose: () => void }) {
  const { base, baseline, state, toggleScenario, setLab } = useWorkspace();
  const [lab, setDraft] = useState<Lab>(state.lab ?? DEFAULT_LAB);
  const set = (patch: Partial<Lab>) => setDraft((l) => ({ ...l, ...patch }));

  const deliveries = useMemo(
    () => [...base.deliveries].sort((a, b) => partName(base, a.part).localeCompare(partName(base, b.part)) || (a.eta ?? '').localeCompare(b.eta ?? '')),
    [base],
  );
  const delivery = base.deliveries.find((d) => d.id === lab.delivery);
  const model = base.models.find((m) => m.id === lab.model);

  // Live preview against the original plan (scenarios not included, so the
  // number describes this what-if alone).
  const preview = useMemo(() => {
    const r = computeAll(applyLab(base, lab));
    const worse = r.models.filter((m) => {
      const o = baseline.models.find((x) => x.id === m.id)!;
      return m.status !== o.status && m.status !== 'ready';
    });
    return worse;
  }, [base, baseline, lab]);

  const changed = isChange(lab);
  const apply = () => {
    setLab(lab);
    onClose();
  };

  return (
    <Dialog
      title="Simulate a disruption"
      onClose={onClose}
      footer={
        <>
          {state.lab && (
            <button className="btn ghost" onClick={() => { setLab(null); onClose(); }}>
              Clear custom what-if
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>{changed ? 'Cancel' : 'Done'}</button>
          <button className="btn primary" onClick={apply} disabled={!changed} title={changed ? undefined : 'Change the shipment or launch date first'}>Apply what-if</button>
        </>
      }
    >
      <div className="field">
        <span className="label">Common disruptions</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => {
            const on = state.scenarios.includes(k);
            return (
              <label key={k} className="card" style={{ display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={on} onChange={() => toggleScenario(k)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontWeight: 500 }}>{SCENARIOS[k].title}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{SCENARIOS[k].summary}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label htmlFor="sim-delivery">Or build your own: pick a supplier shipment</label>
        <select id="sim-delivery" className="select" value={lab.delivery} onChange={(e) => set({ delivery: e.target.value })}>
          {deliveries.map((d) => (
            <option key={d.id} value={d.id}>
              {partName(base, d.part)} · {num(d.qty)} units · {d.eta ? `due ${date(d.eta)}` : 'no date'}
              {d.forChipset ? ` · for ${d.forChipset}` : ''}
              {d.status === 'rejected' ? ' · rejected' : ''} ({d.id})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="label">What happens to it</span>
        <div className="segmented" role="group" aria-label="What happens to the shipment">
          {([['delay', 'Arrives late or early'], ['reject', 'Fails inspection'], ['nodate', 'Supplier loses the date']] as [LabMode, string][]).map(([mode, text]) => (
            <button key={mode} type="button" aria-pressed={lab.mode === mode} onClick={() => set({ mode })}>{text}</button>
          ))}
        </div>
        {lab.mode === 'delay' && delivery?.eta && (
          <>
            <input type="range" min={DELAY[0]} max={DELAY[1]} value={lab.delay} onChange={(e) => set({ delay: Number(e.target.value) })} aria-label="Days late" />
            <span className="hint">
              {lab.delay === 0 ? 'On time' : lab.delay > 0 ? `${lab.delay} days late` : `${-lab.delay} days early`}: arrives {date(addDays(delivery.eta, lab.delay))} instead of {date(delivery.eta)}
            </span>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="sim-model">Optionally move a launch date</label>
        <select id="sim-model" className="select" value={lab.model} onChange={(e) => set({ model: e.target.value })}>
          {base.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name} · launches {date(m.launchDate)}</option>
          ))}
        </select>
        <input type="range" min={SHIFT[0]} max={SHIFT[1]} value={lab.shift} onChange={(e) => set({ shift: Number(e.target.value) })} aria-label="Days to move the launch" />
        {model && (
          <span className="hint">
            {lab.shift === 0 ? 'Launch date unchanged' : `Launch ${date(addDays(model.launchDate, lab.shift))} (${lab.shift > 0 ? `${lab.shift} days later` : `${-lab.shift} days earlier`})`}
          </span>
        )}
      </div>

      {changed && <div className={`banner${preview.length ? '' : ' ok'}`} style={{ margin: 0 }} aria-live="polite">
        <div className="body">
          <div className="title">
            {preview.length ? `${plural(preview.length, 'launch', 'launches')} would need attention` : 'No launch changes status'}
          </div>
          {preview.length > 0 && <ul>{preview.map((m) => <li key={m.id}>{m.name} → {m.status === 'blocked' ? 'Blocked' : 'At risk'}</li>)}</ul>}
        </div>
      </div>}
    </Dialog>
  );
}
