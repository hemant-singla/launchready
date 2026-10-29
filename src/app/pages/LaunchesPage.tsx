import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Search } from 'lucide-react';
import type { ModelResult, Status } from '../../engine/types';
import { useWorkspace } from '../state/workspace';
import { href, navigate } from '../lib/router';
import { date, mainRisk, num, plural, softwareSlack, STATUS_LABEL, STATUS_RANK } from '../lib/format';
import { StatusBadge } from '../components/ui';
import { LaunchDrawer } from './LaunchDrawer';
import { daysBetween } from '../../engine/dates';

type SortKey = 'default' | 'name' | 'launch' | 'status' | 'buffer';
type Filter = 'all' | 'attention' | 'ready';

export function LaunchesPage({ selected }: { selected?: string }) {
  const { result, baseline, affected, data, isDisrupted, disruptions, reset } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('all');
  const [line, setLine] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'default', dir: 1 });
  const [cursorRaw, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const was = (id: string) => baseline.models.find((m) => m.id === id)!;
  const changed = (m: ModelResult) => affected.models.includes(m.id) || m.status !== was(m.id).status;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = result.models.filter((m) =>
      (filter === 'all' || (filter === 'ready' ? m.status === 'ready' : m.status !== 'ready')) &&
      (!line || m.line === line) &&
      (!q || `${m.name} ${m.chipset} ${m.segment} ${m.id}`.toLowerCase().includes(q)));
    const cmp: Record<SortKey, (a: ModelResult, b: ModelResult) => number> = {
      default: (a, b) => Number(changed(b)) - Number(changed(a)) || STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.launchDate.localeCompare(b.launchDate),
      name: (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }),
      launch: (a, b) => a.launchDate.localeCompare(b.launchDate),
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
      buffer: (a, b) => (softwareSlack(data, a) ?? -999) - (softwareSlack(data, b) ?? -999),
    };
    return [...list].sort((a, b) => cmp[sort.key](a, b) * sort.dir || a.launchDate.localeCompare(b.launchDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, filter, line, query, sort, data, affected]);

  const cursor = Math.min(cursorRaw, Math.max(0, rows.length - 1));

  // Keyboard: j/k (or arrows) move, Enter opens, / focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (selected || e.metaKey || e.ctrlKey || e.altKey || t.closest('input, select, textarea, [role="dialog"]')) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(rows.length - 1, cursor + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(0, cursor - 1)); }
      else if (e.key === 'Enter' && rows[cursor]) navigate(`/app/launches/${rows[cursor].id}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, cursor, selected]);

  const counts = (r: { models: ModelResult[] }, s: Status) => r.models.filter((m) => m.status === s).length;
  const nextAtRisk = [...result.models].filter((m) => m.status !== 'ready').sort((a, b) => a.launchDate.localeCompare(b.launchDate))[0];
  const lines = [...new Set(data.models.map((m) => m.line))];
  const selectedModel = result.models.find((m) => m.id === selected);

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Launches</h2>
          <p>Every launch, with its software and supply status combined. Sorted so whatever changed is at the top.</p>
        </div>
      </div>

      {isDisrupted && (affected.models.length > 0 ? (
        <div className="banner" role="region" aria-label="Impact of the current disruption">
          <AlertTriangle size={18} className="icon" />
          <div className="body">
            <div className="title">
              {plural(affected.models.length, 'launch', 'launches')} hit: {affected.models.map((id) => data.models.find((m) => m.id === id)?.name).join(', ')}
            </div>
            <ul>{disruptions.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
          <div className="actions">
            <a className="btn primary sm" href={href('/app/recovery')}>See recovery options</a>
            <button className="btn sm" onClick={reset}>Reset</button>
          </div>
        </div>
      ) : (
        <div className="banner ok" role="region" aria-label="Impact of the current disruption">
          <CheckCircle2 size={18} className="icon" />
          <div className="body">
            <div className="title">No launch is worse than the original plan</div>
            {disruptions.length > 0 && <ul>{disruptions.map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
          <div className="actions"><button className="btn sm" onClick={reset}>Reset</button></div>
        </div>
      ))}

      <div className="kpis">
        {(['ready', 'at-risk', 'blocked'] as Status[]).map((s) => {
          const n = counts(result, s);
          const d = n - counts(baseline, s);
          return (
            <div className="card kpi" key={s}>
              <div className="label"><span className={`status ${s}`} />{STATUS_LABEL[s]}</div>
              <div className="value">
                {n}
                {d !== 0 && <span className={`delta ${(s === 'ready' ? d < 0 : d > 0) ? 'delta-up' : 'delta-down'}`}>{d > 0 ? `+${d}` : d} vs plan</span>}
              </div>
              <div className="sub">{s === 'ready' ? 'on track for their date' : s === 'at-risk' ? 'could miss their date' : 'will miss unless something changes'}</div>
            </div>
          );
        })}
        <div className="card kpi">
          <div className="label">Next launch needing attention</div>
          <div className="value" style={{ fontSize: 18, marginTop: 8 }}>
            {nextAtRisk ? <a href={href(`/app/launches/${nextAtRisk.id}`)}>{nextAtRisk.name}</a> : 'None'}
          </div>
          <div className="sub">{nextAtRisk ? `${date(nextAtRisk.launchDate)} · in ${daysBetween(nextAtRisk.launchDate, data.config.asOf)} days` : 'all launches on track'}</div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={14} />
            <input ref={searchRef} className="input" placeholder="Filter launches" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter launches" />
          </div>
          <div className="segmented" role="group" aria-label="Status filter">
            {([['all', 'All'], ['attention', 'Needs attention'], ['ready', 'Ready']] as [Filter, string][]).map(([f, label]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
            ))}
          </div>
          <select className="select" value={line} onChange={(e) => setLine(e.target.value)} aria-label="Product line">
            <option value="">All lines</option>
            {lines.map((l) => <option key={l}>{l}</option>)}
          </select>
          <span style={{ flex: 1 }} />
          <span className="faint hide-sm" style={{ fontSize: 12 }}>
            {num(rows.length)} of {result.models.length} · <span className="kbd">j</span> <span className="kbd">k</span> to move, <span className="kbd">↵</span> to open
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {header('name', 'Model')}
                <th className="hide-sm">Platform</th>
                {header('launch', 'Launch')}
                {header('status', 'Status')}
                <th className="hide-md">Software ready</th>
                {header('buffer', 'Buffer', 'right')}
                <th>Main risk</th>
                <th className="hide-md">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const risk = mainRisk(m, result, data);
                const slack = softwareSlack(data, m);
                const before = was(m.id);
                return (
                  <tr
                    key={m.id}
                    className={`clickable${changed(m) ? ' changed' : ''}`}
                    aria-selected={i === cursor}
                    onClick={() => navigate(`/app/launches/${m.id}`)}
                  >
                    <td>
                      <a className="cell-title" href={href(`/app/launches/${m.id}`)} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit' }}>{m.name}</a>
                      <div className="cell-sub">{m.segment}</div>
                    </td>
                    <td className="hide-sm">
                      {m.chipset}
                      {data.chipsets.find((c) => c.id === m.chipset)?.isNew && <span className="badge neutral" style={{ marginLeft: 6 }}>new</span>}
                    </td>
                    <td className="num">
                      {date(m.launchDate)}
                      {before.launchDate !== m.launchDate && <div className="cell-sub">was {date(before.launchDate)}</div>}
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                      {before.status !== m.status && <div className="cell-sub">was {STATUS_LABEL[before.status]}</div>}
                    </td>
                    <td className="num hide-md">{m.eta.known ? `${date(m.eta.early)} – ${date(m.eta.late)}` : <span className="faint">unknown</span>}</td>
                    <td className="num right">
                      {slack === null ? <span className="faint">–</span> : <span style={{ color: slack < 0 ? 'var(--blocked)' : slack < 7 ? 'var(--risk)' : undefined }}>{slack >= 0 ? `${slack}d` : `${-slack}d late`}</span>}
                    </td>
                    <td>{risk ? risk.label : <span className="faint">–</span>}</td>
                    <td className="hide-md muted">{risk?.owner ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No launches match these filters.</div>}
        </div>
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
        Buffer: days between the latest software-ready date and the cutoff ({data.config.bufferDays} days before launch).
      </p>

      {selectedModel && <LaunchDrawer model={selectedModel} onClose={() => navigate('/app/launches')} />}
    </>
  );
}
