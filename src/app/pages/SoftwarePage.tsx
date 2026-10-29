// Software evidence: per platform, code submissions against the deadline,
// open tickets by severity, each team's fix backlog, and the ready range.
import { openTickets } from '../../engine/software';
import type { Severity } from '../../engine/types';
import { useWorkspace } from '../state/workspace';
import { date, plural, STATUS_RANK } from '../lib/format';
import { href, navigate } from '../lib/router';
import { StatusText } from '../components/ui';

const SEV: Severity[] = ['critical', 'major', 'minor'];
const SEV_COLOR: Record<Severity, string> = { critical: 'var(--blocked)', major: 'var(--risk)', minor: 'var(--text-3)' };

export default function SoftwarePage({ chipset }: { chipset: string }) {
  const { data, result } = useWorkspace();
  const rank = (id: string) => Math.max(...result.models.filter((m) => m.chipset === id).map((m) => STATUS_RANK[m.software.status]), 0);
  // Platforms with software problems first, then in test-start order.
  const chips = Object.values(result.chipsets)
    .filter((c) => !chipset || c.id === chipset)
    .sort((a, b) => rank(b.id) - rank(a.id) || a.plannedTestStart.localeCompare(b.plannedTestStart));
  const setChipset = (c: string) => navigate(`/app/software${c ? `?chipset=${encodeURIComponent(c)}` : ''}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Software</h2>
          <p>Testing starts when every team's code is in and test boards exist. The ready range adds the test window and each team's fix backlog at its capacity.</p>
        </div>
        <select className="select" value={chipset} onChange={(e) => setChipset(e.target.value)} aria-label="Platform">
          <option value="">All platforms</option>
          {data.chipsets.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {chips.map((c) => {
          const tickets = openTickets(data, c.id);
          const subs = data.submissions.filter((s) => s.chipset === c.id);
          const models = result.models.filter((m) => m.chipset === c.id);
          const worst = models.reduce((a, m) => (m.software.status === 'blocked' || (m.software.status === 'at-risk' && a !== 'blocked') ? m.software.status : a), 'ready' as typeof models[number]['software']['status']);
          return (
            <section className="card" key={c.id} aria-label={`${c.id} platform`}>
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <h3>{c.id}</h3>
                {c.isNew && <span className="badge neutral">new platform</span>}
                <StatusText status={worst} />
                <span className="muted" style={{ fontSize: 13 }}>Used by {models.map((m) => m.name).join(', ')}</span>
              </div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <Stat label="Testing" value={c.testStartedOn ? `Started ${date(c.testStartedOn)}` : c.eta.known ? `Starts ${date(c.eta.testStart)}` : "Can't schedule"} sub={`plan ${date(c.plannedTestStart)}`} />
                <Stat label="Software ready" value={c.eta.known ? `${date(c.eta.early)} – ${date(c.eta.late)}` : 'Unknown'} sub={c.eta.known ? 'best case – worst case' : c.eta.notes.join('; ')} />
                <Stat label="Code in" value={`${subs.filter((s) => s.submittedOn).length} of ${subs.length} teams`} sub={`deadline ${date(c.codeDeadline)}`} />
                <Stat label="Open tickets" value={plural(tickets.length, 'ticket')} sub={SEV.map((s) => `${tickets.filter((t) => t.severity === s).length} ${s}`).join(' · ')} />
              </div>
              <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                <table className="data">
                  <thead><tr><th>Team</th><th>Code</th><th className="right">New code</th><th>Open tickets</th><th className="right">Fix backlog</th></tr></thead>
                  <tbody>
                    {data.teams.map((t) => {
                      const s = subs.find((x) => x.team === t.id);
                      const mine = tickets.filter((x) => x.team === t.id);
                      const b = c.eta.backlog[t.id];
                      const late = s && !s.submittedOn && ((s.expectedOn ?? '') > s.dueDate || data.config.asOf > s.dueDate);
                      return (
                        <tr key={t.id}>
                          <td className="cell-title">{t.name}</td>
                          <td>
                            {!s ? <span className="faint">–</span> : s.submittedOn ? <span className="status ready">In {date(s.submittedOn)}</span>
                              : <span className={`status ${late ? 'at-risk' : 'ready'}`}>{s.expectedOn ? `Expected ${date(s.expectedOn)}` : 'No date'}</span>}
                            {late && <div className="cell-sub" style={{ color: 'var(--risk)' }}>due {date(s.dueDate)}</div>}
                            {s?.note && <div className="team-note"><b>{t.name} team, {date(s.updatedOn)}:</b> {s.note}</div>}
                          </td>
                          <td className="right num muted">{s ? `${s.newCodePct}%` : ''}</td>
                          <td>
                            {mine.length === 0 ? <span className="faint">none</span> : <a href={href(`/app/issues?platform=${c.id}&team=${t.id}`)} className="plain">{SEV.filter((sv) => mine.some((x) => x.severity === sv)).map((sv) => (
                              <span key={sv} style={{ marginRight: 10, color: SEV_COLOR[sv], fontWeight: sv === 'critical' ? 600 : 500 }}>{mine.filter((x) => x.severity === sv).length} {sv}</span>
                            ))}</a>}
                          </td>
                          <td className="right num">{b ? (b.days[1] ? `${b.days[0]}–${b.days[1]} days` : <span className="faint">–</span>) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {tickets.some((t) => t.severity === 'critical') && (
                <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="section-title">Critical tickets</div>
                  <ul className="reason-list">
                    {tickets.filter((t) => t.severity === 'critical').map((t) => (
                      <li key={t.id}><a href={href(`/app/issues/${t.id}`)} className="mono">{t.id}</a> {t.title} <span className="faint">· {t.team} · open {t.ageDays} days{t.eta ? ` · fix ${t.eta.confidence === 'committed' ? 'committed for' : 'estimated'} ${date(t.eta.fixBy)}` : ''}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 2 }} className="num">{value}</div>
      <div className="faint" style={{ fontSize: 12 }}>{sub}</div>
    </div>
  );
}
