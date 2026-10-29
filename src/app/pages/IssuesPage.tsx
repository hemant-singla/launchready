// Issues: every software problem, where it came from (24/7 test lab or a
// customer's "Report this issue"), who has it now, what they last said, and
// when they expect it fixed. Each opens a drawer with the TV log, the failing
// test step or the customer report, the routing, and the full timeline.
import { useMemo, useState } from 'react';
import { Bot, FlaskConical, MessageSquareWarning, Search, Users } from 'lucide-react';
import { daysBetween } from '../../engine/dates';
import type { Severity, Ticket } from '../../engine/types';
import { useWorkspace } from '../state/workspace';
import { href, navigate } from '../lib/router';
import { date, num, plural, prettyDates, WORKFLOW_LABEL } from '../lib/format';
import { addDays } from '../../engine/dates';
import { Drawer, StatusText } from '../components/ui';

const SEV_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`badge ${s === 'critical' ? 'blocked' : s === 'major' ? 'at-risk' : 'neutral'}`}>{s[0].toUpperCase() + s.slice(1)}</span>;
}

export function SourceBadge({ t }: { t: Ticket }) {
  return t.source === 'customer'
    ? <span className="source customer" title="Reported from TVs in homes"><Users size={12} /> Customers{t.report ? ` · ${num(t.report.units)} TVs` : ''}</span>
    : <span className="source lab" title="Found by the 24/7 test lab"><FlaskConical size={12} /> Test lab</span>;
}

export function FixDate({ t }: { t: Ticket }) {
  if (t.status === 'fixed') return <span className="faint">Fixed {date(t.fixedOn)}</span>;
  if (!t.eta) return <span className="faint">No date yet</span>;
  return t.eta.confidence === 'committed'
    ? <span title="Committed by the team"><b>{date(t.eta.fixBy)}</b> <span className="faint">committed</span></span>
    : <span title="The team's rough estimate"><i>{date(t.eta.fixBy)}</i> <span className="faint">estimate</span></span>;
}

type SourceFilter = 'all' | 'test-lab' | 'customer';
type StateFilter = 'open' | 'fixed' | 'all';

export default function IssuesPage({ selected, query }: { selected?: string; query: URLSearchParams }) {
  const { data } = useWorkspace();
  const [text, setText] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [state, setState] = useState<StateFilter>((['open', 'fixed', 'all'] as const).find((v) => v === query.get('state')) ?? 'open');
  const [severity, setSeverity] = useState('');
  const [team, setTeam] = useState(query.get('team') ?? '');
  const [platform, setPlatform] = useState(query.get('platform') ?? '');
  const [suite, setSuite] = useState(query.get('suite') ?? '');
  const asOf = data.config.asOf;

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return data.tickets
      .filter((t) => (state === 'all' || t.status === state) && (source === 'all' || t.source === source) && (!severity || t.severity === severity) && (!team || t.team === team) && (!platform || t.chipset === platform) && (!suite || t.testCase?.suite === suite))
      .filter((t) => !q || `${t.id} ${t.title} ${t.component} ${t.triage?.signature} ${t.team} ${t.chipset}`.toLowerCase().includes(q))
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || Number(b.source === 'customer') - Number(a.source === 'customer') || a.openedOn.localeCompare(b.openedOn));
  }, [data, text, source, state, severity, team, platform, suite]);

  const open = data.tickets.filter((t) => t.status === 'open');
  const customer = open.filter((t) => t.source === 'customer');
  const committed = open.filter((t) => t.eta?.confidence === 'committed');
  const ticket = data.tickets.find((t) => t.id === selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Issues</h2>
          <p>Software problems found by the 24/7 test lab or reported from customers' TVs, routed to a team by their log signature. The latest comment and fix date come from the team that has the issue now.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="label">Open issues</div><div className="value">{open.length}</div><div className="sub">{open.filter((t) => t.severity === 'critical').length} critical · {open.filter((t) => t.severity === 'major').length} major</div></div>
        <div className="card kpi"><div className="label"><FlaskConical size={13} /> Found by the test lab</div><div className="value">{open.length - customer.length}</div><div className="sub">{plural(data.testRuns.filter((r) => r.result !== 'running').length, 'test run')} so far</div></div>
        <div className="card kpi"><div className="label"><Users size={13} /> Reported by customers</div><div className="value">{customer.length}</div><div className="sub">{num(customer.reduce((n, t) => n + (t.report?.units ?? 0), 0))} TVs affected</div></div>
        <div className="card kpi"><div className="label">With a committed fix date</div><div className="value">{committed.length}<span className="delta faint"> of {open.length}</span></div><div className="sub">dates that feed the software-ready quote</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={14} />
            <input className="input" placeholder="Search issues, logs, teams" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search issues" />
          </div>
          <div className="segmented" role="group" aria-label="Source">
            {([['all', 'All sources'], ['test-lab', 'Test lab'], ['customer', 'Customers']] as [SourceFilter, string][]).map(([v, l]) => (
              <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}>{l}</button>
            ))}
          </div>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
            <option value="">Any severity</option><option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option>
          </select>
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="">All teams</option>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
            <option value="">All platforms</option>{[...new Set(data.tickets.map((t) => t.chipset))].map((c) => <option key={c}>{c}</option>)}
          </select>
          {suite && <button className="chip" aria-pressed onClick={() => setSuite('')} title="Clear the suite filter">{data.testSuites.find((x) => x.id === suite)?.name} ✕</button>}
          <div className="segmented" role="group" aria-label="State">
            {([['open', 'Open'], ['fixed', 'Fixed'], ['all', 'All']] as [StateFilter, string][]).map(([v, l]) => (
              <button key={v} aria-pressed={state === v} onClick={() => setState(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Issue</th><th>Source</th><th>Severity</th><th className="hide-sm">Team</th><th className="hide-md">Stage</th><th className="right hide-md">Age</th><th className="hide-md">Latest comment</th><th>Fix date</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const last = t.comments?.at(-1);
                return (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/app/issues/${t.id}`)}>
                    <td>
                      <a className="cell-title" href={href(`/app/issues/${t.id}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit' }}>{t.title}</a>
                      <div className="cell-sub"><span className="mono">{t.id}</span> · {t.chipset} · {t.component}</div>
                    </td>
                    <td><SourceBadge t={t} /></td>
                    <td><SeverityBadge s={t.severity} /></td>
                    <td className="hide-sm">{t.team}</td>
                    <td className="hide-md muted">{WORKFLOW_LABEL[t.workflow ?? (t.status === 'fixed' ? 'fixed' : 'new')]}</td>
                    <td className="right num hide-md">{t.status === 'open' ? `${daysBetween(asOf, t.openedOn)}d` : ''}</td>
                    <td className="hide-md" style={{ maxWidth: 340 }}>
                      {last && <div className="comment-snippet"><b>{last.by}</b> <span className="faint">{date(last.at)}</span><br />{prettyDates(last.text)}</div>}
                    </td>
                    <td className="num"><FixDate t={t} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No issues match these filters.</div>}
        </div>
      </div>
      {ticket && <IssueDrawer t={ticket} onClose={() => navigate('/app/issues')} />}
    </>
  );
}

export function IssueDrawer({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const { data, result } = useWorkspace();
  const suite = t.testCase ? data.testSuites.find((s) => s.id === t.testCase!.suite) : undefined;
  const run = t.testCase?.runId ? data.testRuns.find((r) => r.id === t.testCase!.runId) : undefined;
  const chip = result.chipsets[t.chipset];
  const launches = result.models.filter((m) => m.chipset === t.chipset);
  const [vLo, vHi] = data.config.verifyDays;
  const committedOpen = t.status === 'open' && t.eta?.confidence === 'committed' && chip.eta.known;
  // Does this fix (plus verification) push the platform's software date?
  const binds = committedOpen && chip.eta.known && addDays(t.eta!.fixBy, vHi) >= chip.eta.late;

  return (
    <Drawer
      onClose={onClose}
      label={`${t.id} details`}
      header={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="mono faint">{t.id}</span>
            <SeverityBadge s={t.severity} />
            <span className="badge neutral">{WORKFLOW_LABEL[t.workflow ?? 'new']}</span>
            <SourceBadge t={t} />
          </div>
          <h2 style={{ marginTop: 6 }}>{t.title}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{t.component} · {t.chipset} platform · with the {t.team} team · opened {date(t.openedOn)}</p>
        </>
      }
      footer={<a className="btn" href={href(`/app/software?chipset=${t.chipset}`)}>{t.chipset} software</a>}
    >
      <section aria-label="Fix date">
        <div className="section-title">Fix date</div>
        {t.status === 'fixed' ? (
          <p>Fixed on <b>{date(t.fixedOn)}</b>.</p>
        ) : t.eta ? (
          <p>
            {t.eta.confidence === 'committed' ? <>The {t.team} team <b>committed</b> to a fix in a release build by <b>{date(t.eta.fixBy)}</b>.</> : <>The {t.team} team's <b>rough estimate</b> is <b>{date(t.eta.fixBy)}</b>; it isn't a commitment yet.</>}
            {' '}The test lab then needs {vLo}–{vHi} days to verify it.
            {committedOpen && chip.eta.known && (binds
              ? <> That makes it the last thing {t.chipset} software waits for: ready {date(chip.eta.early)}–{date(chip.eta.late)}.</>
              : <> Verified by {date(addDays(t.eta!.fixBy, vHi))} at the latest, which is before {t.chipset} software is ready ({date(chip.eta.early)}–{date(chip.eta.late)}), so other work sets that date.</>)}
            {t.eta.confidence === 'estimate' && <> Until it's committed, the plan uses the standard {t.severity} fix time ({data.config.fixDays[t.severity].join('–')} days) for it.</>}
          </p>
        ) : (
          <p>No date yet: the team is still investigating. The plan uses the standard {t.severity} fix time ({data.config.fixDays[t.severity].join('–')} days) until they commit to one.</p>
        )}
      </section>

      <section aria-label="Launches affected">
        <div className="section-title">Launches on this platform</div>
        <ul className="reason-list">
          {launches.map((m) => <li key={m.id} style={{ color: 'var(--text)' }}><a href={href(`/app/launches/${m.id}`)}>{m.name}</a> <span className="faint">launches {date(m.launchDate)}</span> <StatusText status={m.status} /></li>)}
        </ul>
      </section>

      {t.report && (
        <section aria-label="Customer report">
          <div className="section-title">Where it came from: customers</div>
          <blockquote className="quote">"{t.report.quote}"</blockquote>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Reports</dt><dd>{num(t.report.units)} TVs used "Report this issue"</dd>
            <dt>Devices</dt><dd>{t.report.devices}</dd>
            <dt>Software</dt><dd>{t.report.firmware}</dd>
            <dt>First seen</dt><dd>{date(t.report.firstSeen)}</dd>
          </dl>
          <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>Last year's models run the same software branch, so a problem in homes today also blocks the new launches on this platform.</p>
        </section>
      )}

      {suite && t.testCase && (
        <section aria-label="Test that found it">
          <div className="section-title">Where it came from: test lab</div>
          <p style={{ marginBottom: 8 }}><b>{suite.name}</b> ({suite.hours} h){run && <> · run <span className="mono">{run.id}</span> on rig {run.rig}, {date(run.startedOn)}</>}</p>
          <ol className="test-steps">
            {suite.steps.map((s, i) => (
              <li key={s} className={i < t.testCase!.step ? 'ok' : i === t.testCase!.step ? 'failed' : 'skipped'}>
                <span className="mark" aria-hidden="true">{i < t.testCase!.step ? '✓' : i === t.testCase!.step ? '✗' : '·'}</span>
                {s}
                {i === t.testCase!.step && <span className="sr-only"> (failed here)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {t.log && (
        <section aria-label="TV log">
          <div className="section-title">TV log</div>
          <pre className="tvlog">{t.log.map((line, i) => <span key={i} className={i === t.triage?.line ? 'hit' : undefined}>{line}{'\n'}</span>)}</pre>
          {t.triage && <p className="faint" style={{ fontSize: 12, marginTop: 4 }}>Highlighted: the line the triage rule matched.</p>}
        </section>
      )}

      {t.triage && (
        <section aria-label="Routing">
          <div className="section-title">How it reached the {t.team} team</div>
          <p style={{ display: 'flex', gap: 8 }}><Bot size={16} className="faint" style={{ flex: 'none', marginTop: 2 }} /> <span>The triage bot matched the log signature <code className="inline">{t.triage.signature}</code> to the rule <b>{t.triage.rule}</b> on {date(t.triage.routedOn)}.</span></p>
        </section>
      )}

      {t.comments && (
        <section aria-label="Timeline">
          <div className="section-title">Timeline</div>
          <ol className="timeline">
            {t.comments.map((c, i) => (
              <li key={i}>
                <div className="timeline-meta"><b>{c.by}</b> <span className="faint">{date(c.at)}</span></div>
                <div>{prettyDates(c.text)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="faint" style={{ fontSize: 12, display: 'flex', gap: 6 }}><MessageSquareWarning size={14} style={{ flex: 'none' }} /> Fictional issue, logs and comments, generated for the demo.</p>
    </Drawer>
  );
}
