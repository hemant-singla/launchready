// Small SVG charts drawn to the data-viz spec: thin marks, rounded data ends
// at the baseline, 2px surface gaps between stacked fills, recessive grid,
// a hover layer on every mark, and text in text tokens (never series colour).
import { useState, type MouseEvent, type ReactNode } from 'react';

export interface Series { key: string; label: string; color: string }

const W = 640;
const PAD = { top: 12, right: 64, bottom: 24, left: 40 };

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="chart-tip" style={{ left: `${(x / W) * 100}%`, top: y }} role="status">
      {children}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}

/** Stacked columns over categories (e.g. test hours per day by result). */
export function StackedColumns({ categories, series, values, height = 200, format = (v: number) => String(v), label }: {
  categories: string[]; series: Series[]; values: Record<string, number[]>; height?: number; format?: (v: number) => string; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = categories.map((_, i) => series.reduce((n, s) => n + (values[s.key][i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - PAD.left - 16; // no end labels on columns
  const ih = height - PAD.top - PAD.bottom;
  const bw = iw / categories.length;
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div className="chart" style={{ position: 'relative' }}>
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="axis">{format(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => {
          let acc = 0;
          const x = PAD.left + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const segs = series.map((s) => {
            const v = values[s.key][i] ?? 0;
            const y0 = y(acc);
            acc += v;
            return { s, v, y0, y1: y(acc) };
          }).filter((g) => g.v > 0);
          return (
            <g key={c} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${c}: ${series.map((s) => `${s.label} ${format(values[s.key][i] ?? 0)}`).join(', ')}`}>
              <rect x={PAD.left + i * bw} y={PAD.top} width={bw} height={ih} fill="transparent" />
              {segs.map((g, k) => {
                const last = k === segs.length - 1;
                const h = Math.max(0, g.y0 - g.y1 - (last ? 0 : 2));
                return last
                  ? <path key={g.s.key} d={roundTop(x, g.y1, w, h, Math.min(4, w / 2, h))} fill={g.s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
                  : <rect key={g.s.key} x={x} y={g.y1 + 2} width={w} height={h} fill={g.s.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {(i % Math.ceil(categories.length / 8) === 0 || i === categories.length - 1) && <text x={x + w / 2} y={height - 6} textAnchor="middle" className="axis">{c}</text>}
            </g>
          );
        })}
        <line x1={PAD.left} x2={PAD.left + iw} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.left + (hover + 0.5) * bw} y={8}>
          <b>{categories[hover]}</b>
          {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}: {format(values[s.key][hover] ?? 0)}</div>)}
        </Tooltip>
      )}
    </div>
  );
}

/** Lines over categories with a crosshair tooltip and end labels. */
export function Lines({ categories, series, values, height = 200, min = 0, max = 1, format = (v: number) => String(v), label }: {
  categories: string[]; series: Series[]; values: Record<string, (number | null)[]>; height?: number; min?: number; max?: number; format?: (v: number) => string; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (categories.length === 1 ? iw / 2 : (i / (categories.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - min) / (max - min)) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const pathOf = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const lastPoint = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return { i, v: vals[i] as number }; return null; };
  // Spread end labels so they don't collide.
  const ends = series.map((s) => ({ s, p: lastPoint(values[s.key]) })).filter((e) => e.p).sort((a, b) => y(a.p!.v) - y(b.p!.v));
  let prev = -Infinity;
  const labelY = new Map<string, number>();
  for (const e of ends) { const want = Math.max(y(e.p!.v) + 4, prev + 12); labelY.set(e.s.key, want); prev = want; }
  const onMove = (evt: MouseEvent<SVGRectElement>) => {
    const box = (evt.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (categories.length - 1));
    setHover(Math.max(0, Math.min(categories.length - 1, i)));
  };
  return (
    <div className="chart" style={{ position: 'relative' }}>
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="axis">{format(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => (i % Math.ceil(categories.length / 8) === 0 || i === categories.length - 1) && <text key={c} x={x(i)} y={height - 6} textAnchor="middle" className="axis">{c}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className="crosshair" />}
        {series.map((s) => (
          <g key={s.key}>
            <path d={pathOf(values[s.key])} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && values[s.key][hover] !== null && <circle cx={x(hover)} cy={y(values[s.key][hover] as number)} r={4.5} fill={s.color} className="dot-ring" />}
            {labelY.has(s.key) && <text x={PAD.left + iw + 8} y={labelY.get(s.key)} className="end-label">{s.label}</text>}
          </g>
        ))}
        <rect x={PAD.left} y={PAD.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={8}>
          <b>{categories[hover]}</b>
          {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}: {values[s.key][hover] === null ? 'no runs' : format(values[s.key][hover] as number)}</div>)}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars, one row per item, value labelled at the bar end. */
export function Bars({ items, color, format = (v: number) => String(v), label }: {
  items: { label: string; value: number; note?: string }[]; color: string; format?: (v: number) => string; label: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars" role="img" aria-label={label}>
      {items.map((it) => (
        <div key={it.label} className="hbar-row" title={`${it.label}: ${format(it.value)}${it.note ? ` (${it.note})` : ''}`}>
          <span className="hbar-label">{it.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></span>
          <span className="hbar-value num">{format(it.value)}{it.note && <span className="faint"> · {it.note}</span>}</span>
        </div>
      ))}
    </div>
  );
}

function roundTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  r = Math.max(0, Math.min(r, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceStep(max: number) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}
