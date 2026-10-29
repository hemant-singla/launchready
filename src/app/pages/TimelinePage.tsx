// Timeline: each launch's testing window and software-ready range against its
// cutoff and launch date. When a what-if is active, the original range is
// drawn as a dashed outline so the slip is visible at a glance.
import { useMemo, useState, type ReactNode } from 'react';
import { addDays, toDay } from '../../engine/dates';
import type { ModelResult } from '../../engine/types';
import { useWorkspace } from '../state/workspace';
import { cutoffOf, date, STATUS_LABEL } from '../lib/format';
import { navigate } from '../lib/router';

const ROW = 34;
const LABEL_W = 150;
const PAD_TOP = 34;
const WIDTH = 1100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TimelinePage() {
  const { result, baseline, data, affected } = useWorkspace();
  const [hover, setHover] = useState<string | null>(null);
  const models = useMemo(() => [...result.models].sort((a, b) => a.launchDate.localeCompare(b.launchDate) || a.name.localeCompare(b.name, 'en', { numeric: true })), [result]);

  const start = addDays(data.config.asOf, -7);
  const end = useMemo(() => {
    const dates = result.models.flatMap((m) => [m.launchDate, m.eta.late ?? m.launchDate]);
    return addDays(dates.sort().at(-1)!, 14);
  }, [result]);
  const span = toDay(end) - toDay(start);
  const x = (d: string) => Math.max(LABEL_W, LABEL_W + ((toDay(d) - toDay(start)) / span) * (WIDTH - LABEL_W - 16));
  const height = PAD_TOP + models.length * ROW + 8;

  const months: string[] = [];
  for (let d = `${start.slice(0, 7)}-01`; d <= end; ) {
    if (d >= start) months.push(d);
    const [y, mo] = [+d.slice(0, 4), +d.slice(5, 7)];
    d = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  }
  const hovered = models.find((m) => m.id === hover);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Timeline</h2>
          <p>Software-ready range for every launch against its cutoff (dashed) and launch date (diamond). Click a row for details.</p>
        </div>
        <Legend />
      </div>
      <div className="card" style={{ overflowX: 'auto', position: 'relative' }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" style={{ minWidth: 760, display: 'block' }} role="img" aria-label="Launch timeline">
          {months.filter((d) => x(d) > LABEL_W).map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={PAD_TOP - 8} y2={height} stroke="var(--border)" />
              <text x={x(d) + 4} y={18} fontSize={11} fill="var(--text-3)">{MONTHS[+d.slice(5, 7) - 1]}{d === months[0] || d.slice(5, 7) === '01' ? ` ${d.slice(0, 4)}` : ''}</text>
            </g>
          ))}
          <line x1={x(data.config.asOf)} x2={x(data.config.asOf)} y1={PAD_TOP - 12} y2={height} stroke="var(--accent)" strokeWidth={1.5} />
          <text x={x(data.config.asOf) + 4} y={PAD_TOP - 4} fontSize={10} fill="var(--accent-text)" fontWeight={600}>today</text>

          {models.map((m, i) => (
            <TimelineRow
              key={m.id}
              m={m}
              before={baseline.models.find((b) => b.id === m.id)!}
              y={PAD_TOP + i * ROW}
              x={x}
              cutoff={cutoffOf(data, m.launchDate)}
              highlight={affected.models.includes(m.id)}
              testEnd={result.chipsets[m.chipset].eta.testEnd ?? null}
              testStart={result.chipsets[m.chipset].eta.testStart}
              onHover={setHover}
            />
          ))}
        </svg>
        {hovered && (
          <div className="card" style={{ position: 'absolute', right: 12, top: 12, padding: '10px 12px', fontSize: 13, boxShadow: 'var(--shadow-md)', pointerEvents: 'none' }}>
            <b>{hovered.name}</b> · <span className={`status ${hovered.status}`}>{STATUS_LABEL[hovered.status]}</span>
            <div className="muted">Software {hovered.eta.known ? `${date(hovered.eta.early)} – ${date(hovered.eta.late)}` : 'unknown'}</div>
            <div className="muted">Cutoff {date(cutoffOf(data, hovered.launchDate))} · launch {date(hovered.launchDate)}</div>
          </div>
        )}
      </div>
    </>
  );
}

function TimelineRow({ m, before, y, x, cutoff, highlight, testStart, testEnd, onHover }: {
  m: ModelResult; before: ModelResult; y: number; x: (d: string) => number; cutoff: string; highlight: boolean;
  testStart: string | null; testEnd: string | null; onHover: (id: string | null) => void;
}) {
  const color = m.software.status === 'ready' ? 'var(--ready)' : m.software.status === 'at-risk' ? 'var(--risk)' : 'var(--blocked)';
  const mid = y + ROW / 2;
  const moved = before.eta.known && m.eta.known && (before.eta.early !== m.eta.early || before.eta.late !== m.eta.late);
  const open = () => navigate(`/app/launches/${m.id}`);
  return (
    <g
      className="tl-row"
      tabIndex={0}
      role="button"
      aria-label={`${m.name}: ${STATUS_LABEL[m.status]}, launches ${date(m.launchDate)}`}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      onMouseEnter={() => onHover(m.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(m.id)}
      onBlur={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      <rect x={0} y={y} width={WIDTH} height={ROW} fill={highlight ? 'var(--risk-soft)' : 'transparent'} opacity={highlight ? 0.7 : 1} />
      <line x1={0} x2={WIDTH} y1={y + ROW} y2={y + ROW} stroke="var(--border)" />
      <circle cx={12} cy={mid} r={4} fill={m.status === 'ready' ? 'var(--ready)' : m.status === 'at-risk' ? 'var(--risk)' : 'var(--blocked)'} />
      <text x={22} y={mid + 4} fontSize={12} fill="var(--text)" fontWeight={500}>{m.name}</text>
      <text x={LABEL_W - 8} y={mid + 4} fontSize={10} fill="var(--text-3)" textAnchor="end">{m.chipset}</text>
      {testStart && testEnd && (
        <rect x={x(testStart)} y={mid - 3} width={Math.max(2, x(testEnd) - x(testStart))} height={6} rx={3} fill="var(--bg-active)" />
      )}
      {moved && before.eta.known && (
        <rect x={x(before.eta.early)} y={mid - 7} width={Math.max(4, x(before.eta.late) - x(before.eta.early))} height={14} rx={7} fill="none" stroke="var(--text-3)" strokeDasharray="3 3" />
      )}
      {m.eta.known && (
        <rect x={x(m.eta.early)} y={mid - 6} width={Math.max(4, x(m.eta.late) - x(m.eta.early))} height={12} rx={6} fill={color} />
      )}
      <line x1={x(cutoff)} x2={x(cutoff)} y1={mid - 10} y2={mid + 10} stroke="var(--text-3)" strokeDasharray="2 2" strokeWidth={1.5} />
      <path d={`M ${x(m.launchDate)} ${mid - 7} l 7 7 l -7 7 l -7 -7 z`} fill="var(--text)" />
      {before.launchDate !== m.launchDate && (
        <path d={`M ${x(before.launchDate)} ${mid - 6} l 6 6 l -6 6 l -6 -6 z`} fill="none" stroke="var(--text-3)" />
      )}
    </g>
  );
}

function Legend() {
  const item = (svg: ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
      <svg width={26} height={14} aria-hidden="true">{svg}</svg>
      {label}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {item(<rect x={1} y={4} width={24} height={6} rx={3} fill="var(--bg-active)" />, 'Testing')}
      {item(<rect x={1} y={1} width={24} height={12} rx={6} fill="var(--ready)" />, 'Software ready')}
      {item(<rect x={1} y={1} width={24} height={12} rx={6} fill="none" stroke="var(--text-3)" strokeDasharray="3 3" />, 'Original')}
      {item(<line x1={13} x2={13} y1={0} y2={14} stroke="var(--text-3)" strokeDasharray="2 2" strokeWidth={1.5} />, 'Cutoff')}
      {item(<path d="M 13 1 l 6 6 l -6 6 l -6 -6 z" fill="var(--text)" />, 'Launch')}
    </div>
  );
}
