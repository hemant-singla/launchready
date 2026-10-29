// Test lab: the 24/7 automated testing behind the software dates. How many
// hours ran and how many failed, pass rate by platform, which suites find the
// most issues, and the latest failures, each linked to the issue it raised.
import { useMemo } from 'react';
import { addDays, daysBetween } from '../../engine/dates';
import type { Dataset, TestRun } from '../../engine/types';
import { useWorkspace } from '../state/workspace';
import { href } from '../lib/router';
import { date, num, plural } from '../lib/format';
import { Bars, Lines, StackedColumns } from '../components/charts';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function stats(data: Dataset) {
  const asOf = data.config.asOf;
  const runs = data.testRuns;
  const platforms = [...new Set(runs.map((r) => r.chipset))];
  const first = runs.reduce((a, r) => (r.startedOn < a ? r.startedOn : a), asOf);
  const days: string[] = [];
  for (let d = first; d <= asOf; d = addDays(d, 1)) days.push(d);
  const on = (d: string) => runs.filter((r) => r.startedOn === d);
  const hours = (rs: TestRun[], result: TestRun['result']) => rs.filter((r) => r.result === result).reduce((n, r) => n + r.hours, 0);
  const lastWeek = runs.filter((r) => daysBetween(asOf, r.startedOn) < 7);
  const done = (rs: TestRun[]) => rs.filter((r) => r.result !== 'running');
  const rate = (rs: TestRun[]) => { const d = done(rs); return d.length ? d.filter((r) => r.result === 'pass').length / d.length : null; };
  return {
    days, platforms,
    hoursByDay: { pass: days.map((d) => hours(on(d), 'pass')), fail: days.map((d) => hours(on(d), 'fail')), running: days.map((d) => hours(on(d), 'running')) },
    rateByPlatform: Object.fromEntries(platforms.map((p) => [p, days.map((d) => rate(on(d).filter((r) => r.chipset === p)))])),
    week: {
      hours: lastWeek.reduce((n, r) => n + r.hours, 0),
      runs: done(lastWeek).length,
      rate: rate(lastWeek) ?? 0,
      newIssues: lastWeek.filter((r) => r.newIssue).reduce((n, r) => n + r.ticketIds.length, 0),
      running: runs.filter((r) => r.result === 'running').length,
    },
  };
}

export default function TestLabPage() {
  const { data } = useWorkspace();
  const s = useMemo(() => stats(data), [data]);
  const labIssues = data.tickets.filter((t) => t.source === 'test-lab');
  const byTeam = data.teams.map((t) => {
    const mine = labIssues.filter((x) => x.team === t.id);
    return { label: t.name, value: mine.length, note: `${mine.filter((x) => x.status === 'open').length} open` };
  }).sort((a, b) => b.value - a.value);
  const failures = data.testRuns.filter((r) => r.result === 'fail').slice(-6).reverse();

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Test lab</h2>
          <p>Automated tests run around the clock on every platform in testing. A failed step attaches the TV log, and the triage bot routes it to a team by its log signature. Data as of {date(data.config.asOf)}; today's runs are still going.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="label">Hours tested, last 7 days</div><div className="value">{num(s.week.hours)}</div><div className="sub">{s.week.running} runs going now</div></div>
        <div className="card kpi"><div className="label">Runs finished, last 7 days</div><div className="value">{num(s.week.runs)}</div><div className="sub">{s.platforms.length} platforms, {data.testSuites.length} suites</div></div>
        <div className="card kpi"><div className="label">Pass rate, last 7 days</div><div className="value">{pct(s.week.rate)}</div><div className="sub">failures include repeats of known issues</div></div>
        <div className="card kpi"><div className="label">New issues found, last 7 days</div><div className="value">{s.week.newIssues}</div><div className="sub">{plural(labIssues.length, 'issue')} found since testing began</div></div>
      </div>

      <div className="chart-grid">
        <section className="card">
          <div className="card-head"><h3>Test hours per day</h3></div>
          <div className="card-body">
            <StackedColumns
              label="Test hours per day by result"
              categories={s.days.map((d) => date(d))}
              series={[{ key: 'pass', label: 'Passed', color: 'var(--ready)' }, { key: 'fail', label: 'Failed', color: 'var(--blocked)' }, { key: 'running', label: 'Running', color: 'var(--text-3)' }]}
              values={s.hoursByDay}
              format={(v) => `${num(v)} h`}
            />
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Pass rate by platform</h3></div>
          <div className="card-body">
            <Lines
              label="Daily pass rate by platform"
              categories={s.days.map((d) => date(d))}
              series={s.platforms.map((p, i) => ({ key: p, label: p, color: `var(--series-${i + 1})` }))}
              values={s.rateByPlatform}
              min={0}
              max={1}
              format={pct}
            />
          </div>
        </section>
      </div>

      <div className="chart-grid">
        <section className="card">
          <div className="card-head"><h3>Issues found by the test lab, by team</h3></div>
          <div className="card-body">
            <Bars label="Issues found by the test lab, by team" items={byTeam} color="var(--series-1)" />
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Latest failures</h3></div>
          <ul className="fail-list">
            {failures.map((r) => {
              const suite = data.testSuites.find((x) => x.id === r.suite)!;
              const t = data.tickets.find((x) => x.id === r.ticketIds[0]);
              return (
                <li key={r.id}>
                  <div>
                    <b>{suite.name}</b> <span className="faint">· {r.chipset} · {date(r.startedOn)}</span>
                    <div className="muted" style={{ fontSize: 13 }}>Failed at: {r.failedStep !== null ? suite.steps[r.failedStep] : 'unknown step'}</div>
                  </div>
                  {t && <a href={href(`/app/issues/${t.id}`)} className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.newIssue ? 'raised' : 'repeat of'} {t.id}</a>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3>Test suites</h3><span className="faint" style={{ fontSize: 12 }}>last 14 runs: ● passed · ✕ failed · ○ running</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Suite</th><th className="hide-md">What it does</th><th className="right">Length</th><th className="right">Runs</th><th className="right">Pass rate</th><th>Last 14 runs</th><th className="right">Issues found</th></tr></thead>
            <tbody>
              {data.testSuites.map((suite) => {
                const runs = data.testRuns.filter((r) => r.suite === suite.id);
                const done = runs.filter((r) => r.result !== 'running');
                const passRate = done.length ? done.filter((r) => r.result === 'pass').length / done.length : 0;
                const found = data.tickets.filter((t) => t.testCase?.suite === suite.id);
                return (
                  <tr key={suite.id}>
                    <td className="cell-title">{suite.name}</td>
                    <td className="hide-md muted" style={{ fontSize: 13, maxWidth: 360 }}>{suite.steps.slice(0, 3).join(' → ')}{suite.steps.length > 3 ? ' → …' : ''}</td>
                    <td className="right num">{suite.hours} h</td>
                    <td className="right num">{num(runs.length)}</td>
                    <td className="right num">{pct(passRate)}</td>
                    <td>
                      <span className="run-strip" aria-label={`Last runs: ${runs.slice(-14).map((r) => r.result).join(', ')}`}>
                        {runs.slice(-14).map((r) => <span key={r.id} className={`run ${r.result}`} title={`${r.id} · ${r.chipset} · ${date(r.startedOn)} · ${r.result}`}>{r.result === 'fail' ? '✕' : r.result === 'running' ? '○' : '●'}</span>)}
                      </span>
                    </td>
                    <td className="right num">{found.length ? <a href={href(`/app/issues?suite=${suite.id}&state=all`)}>{found.length}</a> : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
