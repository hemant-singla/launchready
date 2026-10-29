import { CircleAlert, Info } from 'lucide-react';
import type { ModelResult } from '../../engine/types';
import { explain } from '../../engine/lab';
import { addDays, toDay } from '../../engine/dates';
import { useWorkspace } from '../state/workspace';
import { chainFor } from '../lib/chain';
import { cutoffOf, date, dateLong, num, partName, prettyDates, STATUS_LABEL } from '../lib/format';
import { href } from '../lib/router';
import { Drawer, StatusBadge, StatusText } from '../components/ui';

export function LaunchDrawer({ model: m, onClose }: { model: ModelResult; onClose: () => void }) {
  const { result, data, base, baseline, affected } = useWorkspace();
  const before = baseline.models.find((x) => x.id === m.id)!;
  const steps = chainFor(m, result, data, { m: before, r: baseline, data: base });
  const firstBreak = steps.findIndex((s) => s.status !== 'ready');
  const lines = result.lines.filter((l) => l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset));
  const reasons = [...m.software.reasons, ...m.supply.reasons];
  const isAffected = affected.models.includes(m.id);

  return (
    <Drawer
      onClose={onClose}
      label={`${m.name} details`}
      header={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2>{m.name}</h2>
            <StatusBadge status={m.status} />
            {before.status !== m.status && <span className="faint" style={{ fontSize: 12 }}>was {STATUS_LABEL[before.status]}</span>}
          </div>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            {m.segment} · {m.chipset} platform · launches {dateLong(m.launchDate)}
          </p>
        </>
      }
      footer={
        <>
          <a className="btn" href={href(`/app/supply?chipset=${m.chipset}`)}>Supply evidence</a>
          <a className="btn" href={href(`/app/software?chipset=${m.chipset}`)}>Software evidence</a>
          {isAffected && <a className="btn primary" href={href('/app/recovery')}>Recovery options</a>}
        </>
      }
    >
      <section>
        <p className="explain">{explain(m, result, data)}</p>
      </section>

      <section aria-label="How the risk travels">
        <div className="section-title">How the risk travels</div>
        <div className="chain">
          {steps.map((s, i) => (
            <div key={s.key} className={`chain-step ${s.status}${i === firstBreak ? ' first-break' : ''}`}>
              <div className="bar" />
              <div className="name">{s.name}</div>
              {s.was && <div className="was">{s.was}</div>}
              <div className="value">{s.value}</div>
              <div className="sub">{s.sub}</div>
            </div>
          ))}
        </div>
        {firstBreak >= 0 && (
          <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            The first link that breaks is highlighted. Everything after it inherits the delay.
          </p>
        )}
      </section>

      <section aria-label="Software readiness window">
        <div className="section-title">Software readiness window</div>
        <ReadinessBar m={m} />
      </section>

      <PlatformIssues chipset={m.chipset} />

      <section aria-label="Parts for this launch">
        <div className="section-title">Parts for this launch</div>
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Build</th>
                <th>Part</th>
                <th className="right">Qty</th>
                <th>Needed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.kind === 'test-boards' ? 'Test boards' : 'Production'}</td>
                  <td>
                    {partName(data, l.part)}
                    {(l.shortfall > 0 || l.lateQty > 0) && (
                      <div className="cell-sub">{l.shortfall ? `${num(l.shortfall)} not covered` : `${num(l.lateQty)} arrive ${l.lateDays}d late`}</div>
                    )}
                  </td>
                  <td className="right num">{num(l.qty)}</td>
                  <td className="num">{date(l.needDate)}</td>
                  <td><StatusText status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {reasons.length > 0 && (
        <section aria-label="All findings">
          <div className="section-title">All findings</div>
          <ul className="reason-list">
            {reasons.map((r) => (
              <li key={r}>
                <CircleAlert size={14} color="var(--risk)" />
                <span>{prettyDates(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="faint" style={{ fontSize: 12, display: 'flex', gap: 6 }}>
        <Info size={14} style={{ flex: 'none', marginTop: 1 }} /> Every date and quantity above is calculated from the plan data by the tested engine; nothing is typed in.
      </p>
    </Drawer>
  );
}

function PlatformIssues({ chipset }: { chipset: string }) {
  const { data, result } = useWorkspace();
  const open = data.tickets.filter((t) => t.chipset === chipset && t.status === 'open');
  const eta = result.chipsets[chipset].eta;
  if (!open.length) {
    return (
      <section aria-label="Open issues">
        <div className="section-title">Open issues on {chipset}</div>
        <p className="muted" style={{ fontSize: 13 }}>{result.chipsets[chipset].testStartedOn ? 'None open.' : 'Testing hasn\'t started yet, so there are no test-lab issues on this platform.'}</p>
      </section>
    );
  }
  const rank = { critical: 0, major: 1, minor: 2 } as const;
  const top = [...open].sort((a, b) => rank[a.severity] - rank[b.severity] || (b.eta ? 1 : 0) - (a.eta ? 1 : 0)).slice(0, 4);
  const committed = open.filter((t) => t.eta?.confidence === 'committed').length;
  return (
    <section aria-label="Open issues">
      <div className="section-title">Open issues on {chipset}</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
        {open.length} open, {committed} with a committed fix date{eta.known && eta.lastCommittedFix ? ` (latest ${date(eta.lastCommittedFix)})` : ''}. Issues without a date count at their standard fix time.
      </p>
      <ul className="reason-list">
        {top.map((t) => (
          <li key={t.id} style={{ color: 'var(--text)' }}>
            <a href={href(`/app/issues/${t.id}`)} className="mono" style={{ flex: 'none' }}>{t.id}</a>
            <span>{t.title} <span className="faint">· {t.severity} · {t.team} · {t.eta ? `fix ${t.eta.confidence === 'committed' ? 'committed' : 'estimated'} ${date(t.eta.fixBy)}` : 'no date yet'}</span></span>
          </li>
        ))}
      </ul>
      {open.length > top.length && <a href={href(`/app/issues?platform=${chipset}`)} style={{ fontSize: 13 }}>All {open.length} issues on {chipset}</a>}
    </section>
  );
}

function ReadinessBar({ m }: { m: ModelResult }) {
  const { data } = useWorkspace();
  const e = m.eta;
  if (!e.known) return <p className="muted">The software date can't be calculated yet: {e.notes.join('; ')}.</p>;
  const cutoff = cutoffOf(data, m.launchDate);
  const start = addDays(e.early < cutoff ? e.early : cutoff, -10);
  const end = addDays(e.late > m.launchDate ? e.late : m.launchDate, 7);
  const span = toDay(end) - toDay(start);
  const pct = (d: string) => `${((toDay(d) - toDay(start)) / span) * 100}%`;
  return (
    <>
      <div className="rangebar" role="img" aria-label={`Software ready between ${date(e.early)} and ${date(e.late)}; cutoff ${date(cutoff)}; launch ${date(m.launchDate)}`}>
        <div className="track" />
        <div className={`window ${m.software.status}`} style={{ left: pct(e.early), width: `calc(${pct(e.late)} - ${pct(e.early)} + 4px)` }} />
        <div className="mark" style={{ left: pct(cutoff) }} />
        <div className="mark-label" style={{ left: pct(cutoff) }}>cutoff {date(cutoff)}</div>
        <div className="mark launch" style={{ left: pct(m.launchDate) }} />
        <div className="mark-label" style={{ left: pct(m.launchDate), top: -2, color: 'var(--text)' }}>launch</div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Ready between <b>{date(e.early)}</b> (everything goes well) and <b>{date(e.late)}</b> (every fix takes its longest). It must be ready by {date(cutoff)}, {data.config.bufferDays} days before launch.
      </p>
    </>
  );
}
