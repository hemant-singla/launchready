// Recovery: the options that would fix the launches a disruption hit, each
// tested with the engine, compared side by side, and approved or rejected.
import { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, CircleSlash, Lightbulb, ShieldAlert, Zap } from 'lucide-react';
import type { RecoveryOption } from '../../engine/recovery';
import type { Dataset } from '../../engine/types';
import { daysBetween } from '../../engine/dates';
import { useRecovery, useWorkspace } from '../state/workspace';
import { useToast } from '../components/useToast';
import { StatusBadge, StatusText } from '../components/ui';
import { date, plural, prettyDates } from '../lib/format';
import { optionName } from '../lib/options';
import { href } from '../lib/router';

const KIND: Record<RecoveryOption['type'], string> = { transfer: 'Re-allocate stock', substitute: 'Approved substitute', moveLaunch: 'Change the date' };

export default function RecoveryPage() {
  const { data, affected, result, approve, reject, undo, isDisrupted } = useWorkspace();
  const rec = useRecovery();
  const toast = useToast();
  const [showConsidered, setShowConsidered] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  if (!affected.models.length) {
    return (
      <>
        <div className="page-head"><div><h2>Recovery</h2><p>When a disruption hits a launch, the ways to recover it appear here, tested and compared.</p></div></div>
        <div className="card empty">
          {isDisrupted ? (
            <>
              <CheckCircle2 size={28} color="var(--ready)" />
              <p style={{ marginTop: 8, fontWeight: 600 }}>Every launch is back to its original plan.</p>
              <p className="muted" style={{ marginTop: 4 }}>See the <a href={href('/app/activity')}>activity log</a> for what was approved.</p>
            </>
          ) : (
            <>
              <Zap size={28} color="var(--accent)" />
              <p style={{ marginTop: 8, fontWeight: 600 }}>Nothing needs recovering in the current plan.</p>
              <p className="muted" style={{ marginTop: 4 }}>Press <span className="kbd">S</span> or use <b>Simulate disruption</b> to see how a supplier delay plays out.</p>
            </>
          )}
        </div>
      </>
    );
  }

  const decideOn = (o: RecoveryOption, approved: boolean) => {
    const restored = o.models.filter((m) => m.restored).map((m) => m.name);
    const resultText = restored.length ? `${restored.join(', ')} back on plan` : 'Partial improvement';
    if (approved) {
      approve(o, resultText);
      toast(`Approved: ${optionName(o, data)}`, { label: 'Undo', run: undo });
    } else {
      reject(o);
      toast('Rejected; the plan is unchanged');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{plural(affected.models.length, 'launch', 'launches')} {affected.models.length === 1 ? 'needs' : 'need'} a recovery decision</h2>
          <p>
            Each option below was applied to the plan and recalculated. Options that would make any other launch worse are
            left out. Approving one updates every view.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>What's affected</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Launch</th><th>Date</th><th>Plan</th><th>Now</th><th>Software ready</th></tr></thead>
            <tbody>
              {affected.models.map((id) => {
                const m = result.models.find((x) => x.id === id)!;
                const o = rec.options[0]?.models.find((x) => x.id === id);
                return (
                  <tr key={id}>
                    <td><a href={href(`/app/launches/${id}`)} className="cell-title">{m.name}</a></td>
                    <td className="num">{date(m.launchDate)}</td>
                    <td><StatusText status={o?.original ?? 'ready'} /></td>
                    <td><StatusBadge status={m.status} /></td>
                    <td className="num">{m.eta.known ? `${date(m.eta.early)} – ${date(m.eta.late)}` : 'unknown'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rec.options.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
          {rec.options.map((o, i) => (
            <OptionCard key={o.key} option={o} recommended={i === 0} data={data} onDecide={(ok) => decideOn(o, ok)} />
          ))}
        </div>
      )}

      {rec.escalation && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <ShieldAlert size={18} className="icon" />
          <div className="body">
            <div className="title">Escalate</div>
            <p className="muted" style={{ marginTop: 2 }}>{rec.escalation}</p>
          </div>
        </div>
      )}

      {rec.considered.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <button className="card-head" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} aria-expanded={showConsidered} onClick={() => setShowConsidered((v) => !v)}>
            <CircleSlash size={16} className="faint" />
            <h3>Considered and ruled out ({rec.considered.length})</h3>
            <ChevronDown size={16} style={{ marginLeft: 'auto', transform: showConsidered ? 'rotate(180deg)' : undefined }} />
          </button>
          {showConsidered && (
            <ul className="card-body reason-list">
              {rec.considered.map((o) => (
                <li key={o.key}><CircleSlash size={14} /> <span><b>{optionName(o, data)}</b>: {o.why.replace(/^Not offered: /, '')}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <button className="card-head" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} aria-expanded={showMethod} onClick={() => setShowMethod((v) => !v)}>
          <Lightbulb size={16} className="faint" />
          <h3>How these options were found</h3>
          <ChevronDown size={16} style={{ marginLeft: 'auto', transform: showMethod ? 'rotate(180deg)' : undefined }} />
        </button>
        {showMethod && (
          <div className="card-body muted" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p>1. Compare the current plan with the original one and list the launches, builds and platforms that got worse.</p>
            <p>2. Generate only the actions the data supports: re-allocating units of the same part from an order bought for another program ({data.config.transferDays}-day transfer), an approved substitute part (with its driver change and validation), or the earliest later launch date within {data.config.maxLaunchMoveDays} days.</p>
            <p>3. Apply each action to a copy of the plan and recalculate everything. Drop it if it doesn't help, or if it makes any other launch worse.</p>
            <p>4. Rank what's left: most launches restored first, then the least disruptive kind of action, then the earliest software date.</p>
            <p className="faint">This search is deterministic and fully tested. An AI agent can sit on top of it to explain options and draft messages to owners, but it never invents numbers.</p>
          </div>
        )}
      </div>
    </>
  );
}

function OptionCard({ option: o, recommended, data, onDecide }: { option: RecoveryOption; recommended: boolean; data: Dataset; onDecide: (approved: boolean) => void }) {
  const launchShift = o.type === 'moveLaunch' ? o.days : 0;
  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', borderColor: recommended ? 'var(--accent)' : undefined }}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {recommended && <span className="badge accent">Recommended</span>}
          <span className="badge neutral">{KIND[o.type]}</span>
          {o.restoredCount < o.models.length && <span className="badge at-risk">Partial fix</span>}
        </div>
        <div>
          <h3 style={{ fontSize: 15 }}>{optionName(o, data)}</h3>
          <p className="faint mono" style={{ fontSize: 11, marginTop: 2 }}>{o.title}</p>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>{prettyDates(o.detail)}</p>

        <div>
          <div className="section-title">Result</div>
          <ul className="reason-list">
            {o.models.map((m) => (
              <li key={m.id} style={{ alignItems: 'center', color: 'var(--text)' }}>
                <span style={{ minWidth: 72 }}>{m.name}</span>
                <StatusText status={m.disrupted} /> <ArrowRight size={12} className="faint" /> <StatusText status={m.after} />
              </li>
            ))}
          </ul>
          {o.testStarts.map((t) => t.after && t.before !== t.after && (
            <p key={t.id} className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t.id} testing starts {date(t.after)} (now {date(t.before)}, plan {date(t.planned)})
              {t.after > t.planned ? `, ${daysBetween(t.after, t.planned)} days after plan` : ', on plan'}
            </p>
          ))}
        </div>

        <dl className="kv">
          <dt>Launch date</dt>
          <dd>{launchShift ? <span style={{ color: 'var(--risk)' }}>+{launchShift} days ({date(o.type === 'moveLaunch' ? o.date : '')})</span> : 'Unchanged'}</dd>
          <dt>Trade-off</dt>
          <dd>{o.tradeoffs.join('; ')}</dd>
          <dt>Approval</dt>
          <dd>{o.approval}</dd>
          {o.remaining.length > 0 && (
            <>
              <dt>Still open</dt>
              <dd style={{ color: 'var(--risk)' }}>{o.remaining.map((r) => prettyDates(r.reason)).join('; ')}</dd>
            </>
          )}
        </dl>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <button className={`btn ${recommended ? 'primary' : ''}`} onClick={() => onDecide(true)}>Approve</button>
        <button className="btn ghost" onClick={() => onDecide(false)}>Reject</button>
      </div>
    </article>
  );
}
