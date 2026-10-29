// Activity: an audit trail of disruptions applied and decisions taken.
import type { ReactElement } from 'react';
import { Check, CircleDot, X } from 'lucide-react';
import type { LogEntry } from '../../engine/decisions';
import { useWorkspace } from '../state/workspace';

const ICON: Record<LogEntry['decision'], ReactElement> = {
  approved: <Check size={14} color="var(--ready)" />,
  rejected: <X size={14} color="var(--blocked)" />,
  note: <CircleDot size={14} className="faint" />,
};

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export default function ActivityPage() {
  const { state } = useWorkspace();
  const log = [...state.decisions.log].reverse();
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Activity</h2>
          <p>What was simulated and decided in this session, newest first. Approved actions are also saved in the page link.</p>
        </div>
      </div>
      <div className="card">
        {log.length === 0 ? (
          <div className="empty">Nothing yet. Simulate a disruption or approve a recovery option and it will be recorded here.</div>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {log.map((e) => (
              <li key={e.n} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ marginTop: 3 }}>{ICON[e.decision]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {e.decision !== 'note' && <b style={{ textTransform: 'capitalize' }}>{e.decision}: </b>}
                    {e.title}
                  </div>
                  {e.result && <div className="muted" style={{ fontSize: 13 }}>{e.result}</div>}
                </div>
                <span className="faint num" style={{ fontSize: 12 }}>{time(e.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
