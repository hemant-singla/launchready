// Supply evidence: every supplier shipment (with what changed and which builds
// it feeds) and free stock per part. Filterable by platform.
import { useMemo, useState } from 'react';
import { daysBetween } from '../../engine/dates';
import { stockSummary } from '../../engine/supply';
import { useWorkspace } from '../state/workspace';
import { date, modelName, num, partName, supplierName } from '../lib/format';
import { navigate } from '../lib/router';
import { StatusText } from '../components/ui';

export default function SupplyPage({ chipset }: { chipset: string }) {
  const { data, base, result } = useWorkspace();
  const [problemsOnly, setProblemsOnly] = useState(false);
  const setChipset = (c: string) => navigate(`/app/supply${c ? `?chipset=${encodeURIComponent(c)}` : ''}`);

  // Which builds each delivery feeds, from the allocation.
  const feeds = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const l of result.lines) {
      for (const a of l.allocations) {
        const who = l.kind === 'test-boards' ? `${l.chipset} test boards` : modelName(data, l.model);
        const list = (out[a.source] ??= []);
        if (!list.includes(who)) list.push(who);
      }
    }
    return out;
  }, [result, data]);

  const parts = chipset ? new Set(data.bom.filter((b) => b.chipset === chipset).map((b) => b.part)) : null;
  const deliveries = data.deliveries
    .filter((d) => !parts || parts.has(d.part))
    .map((d) => {
      const orig = base.deliveries.find((x) => x.id === d.id);
      const changed = !orig || orig.eta !== d.eta || orig.status !== d.status || orig.qty !== d.qty;
      const slip = d.eta && d.originalEta ? daysBetween(d.eta, d.originalEta) : null;
      const problem = d.status !== 'confirmed' || !d.eta || (slip ?? 0) > 0 || changed;
      return { d, changed, slip, problem };
    })
    .filter((x) => !problemsOnly || x.problem)
    .sort((a, b) => Number(b.changed) - Number(a.changed) || Number(b.problem) - Number(a.problem) || (a.d.eta ?? '').localeCompare(b.d.eta ?? ''));

  const stock = Object.values(
    stockSummary(data)
      .filter((s) => !parts || parts.has(s.part))
      .reduce<Record<string, { part: string; onHand: number; allocated: number; free: number }>>((acc, s) => {
        const r = (acc[s.part] ??= { part: s.part, onHand: 0, allocated: 0, free: 0 });
        r.onHand += s.onHand;
        r.allocated += s.allocated;
        r.free += s.free;
        return acc;
      }, {}),
  );

  const statusOf = (s: string, eta: string | null) =>
    s === 'rejected' ? 'blocked' : !eta || s === 'delayed' || s === 'unconfirmed' ? 'at-risk' : 'ready';
  const statusText: Record<string, string> = { confirmed: 'Confirmed', delayed: 'Delayed', rejected: 'Rejected', unconfirmed: 'No date' };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Supply</h2>
          <p>Supplier shipments and free stock. Parts are shared out in need-date order and never counted twice; shipments with no date are never counted.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select" value={chipset} onChange={(e) => setChipset(e.target.value)} aria-label="Platform">
            <option value="">All platforms</option>
            {data.chipsets.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
          <button className="chip" aria-pressed={problemsOnly} onClick={() => setProblemsOnly((v) => !v)}>Problems only</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Supplier shipments</h3><span className="faint" style={{ fontSize: 12 }}>{deliveries.length}</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Part</th><th className="hide-md">Supplier</th><th className="right">Qty</th><th>Bought for</th><th>Due</th><th>Status</th><th className="hide-md">Feeds</th></tr>
            </thead>
            <tbody>
              {deliveries.map(({ d, changed, slip }) => (
                <tr key={d.id} className={changed ? 'changed' : undefined}>
                  <td><div className="cell-title">{partName(data, d.part)}</div><div className="cell-sub mono">{d.id}</div></td>
                  <td className="hide-md muted">{supplierName(data, d.supplier)}</td>
                  <td className="right num">{num(d.qty)}</td>
                  <td>{d.forChipset ?? <span className="faint">any</span>}</td>
                  <td className="num">
                    {d.eta ? date(d.eta) : <span style={{ color: 'var(--risk)' }}>no date</span>}
                    {slip ? <div className="cell-sub" style={{ color: slip > 0 ? 'var(--risk)' : 'var(--ready)' }}>{slip > 0 ? `+${slip}` : slip} days vs {date(d.originalEta)}</div> : null}
                  </td>
                  <td>
                    <StatusText status={statusOf(d.status, d.eta)} />
                    <div className="cell-sub">{statusText[d.status] ?? d.status}{d.note ? ` · ${d.note}` : ''}</div>
                  </td>
                  <td className="hide-md muted" style={{ fontSize: 13 }}>{feeds[d.id]?.join(', ') ?? <span className="faint">not used</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {deliveries.length === 0 && <div className="empty">No shipments match.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Stock on hand</h3><span className="faint" style={{ fontSize: 12 }}>all warehouses</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Part</th><th className="right">On hand</th><th className="right">Already allocated</th><th className="right">Free</th></tr></thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.part}>
                  <td><div className="cell-title">{partName(data, s.part)}</div><div className="cell-sub mono">{s.part}</div></td>
                  <td className="right num">{num(s.onHand)}</td>
                  <td className="right num muted">{num(s.allocated)}</td>
                  <td className="right num" style={{ fontWeight: 600 }}>{num(s.free)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
