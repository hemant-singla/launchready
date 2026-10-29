// Supply detail: one shipment's full story (purchase order, transport,
// tracking events, inspection, what it feeds) and a scorecard per supplier.
import { CircleDashed, CircleDot, Truck, TriangleAlert } from 'lucide-react';
import { useWorkspace } from '../state/workspace';
import { date, modelName, num, partName, supplierName } from '../lib/format';
import { href } from '../lib/router';
import { Drawer, StatusText } from '../components/ui';

const pct = (v?: number) => (v === undefined ? '–' : `${Math.round(v * 100)}%`);

export function ShipmentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, base, result } = useWorkspace();
  const d = data.deliveries.find((x) => x.id === id)!;
  const original = base.deliveries.find((x) => x.id === id);
  const sup = data.suppliers.find((s) => s.id === d.supplier);
  const feeds = result.lines.flatMap((l) => l.allocations.filter((a) => a.source === d.id).map((a) => ({ l, a })));
  const status = d.status === 'rejected' ? 'blocked' : !d.eta || d.status !== 'confirmed' ? 'at-risk' : 'ready';
  const value = d.po ? d.po.unitCost * d.qty : null;

  return (
    <Drawer
      onClose={onClose}
      label={`${d.id} shipment details`}
      header={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="mono faint">{d.id}</span>
            <StatusText status={status} />
            <span className="faint" style={{ fontSize: 13 }}>{d.status}</span>
          </div>
          <h2 style={{ marginTop: 6 }}>{num(d.qty)} × {partName(data, d.part)}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            From {supplierName(data, d.supplier)} · for {d.forChipset ?? 'any platform'} · {d.eta ? `arrives ${date(d.eta)}` : 'no confirmed date'}
            {original?.eta && d.eta && original.eta !== d.eta ? ` (planned ${date(original.eta)})` : ''}
          </p>
        </>
      }
    >
      {d.lastUpdate && (
        <section aria-label="Latest update">
          <div className="section-title">Latest update</div>
          <p className={d.status === 'confirmed' ? '' : 'alert-line'}>
            {d.status !== 'confirmed' && <TriangleAlert size={14} />} <span><b>{date(d.lastUpdate.at)}:</b> {d.lastUpdate.text}</span>
          </p>
        </section>
      )}

      <section aria-label="What it feeds">
        <div className="section-title">What it feeds</div>
        {feeds.length ? (
          <div className="card table-wrap">
            <table className="data">
              <thead><tr><th>Build</th><th className="right">Qty</th><th>Needed</th><th>Status</th></tr></thead>
              <tbody>
                {feeds.map(({ l, a }) => (
                  <tr key={l.id}>
                    <td>{l.kind === 'test-boards' ? `${l.chipset} test boards` : <a href={href(`/app/launches/${l.model}`)}>{modelName(data, l.model)} production</a>}</td>
                    <td className="right num">{num(a.qty)}</td>
                    <td className="num">{date(l.needDate)}{a.date > l.needDate && <span className="cell-sub" style={{ color: 'var(--risk)', display: 'block' }}>{date(a.date)}, late</span>}</td>
                    <td><StatusText status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>{d.status === 'rejected' || !d.eta ? 'Nothing: rejected and undated shipments are never counted as supply.' : 'Not allocated to any build yet (spare for later needs).'}</p>
        )}
      </section>

      {d.events && (
        <section aria-label="Tracking">
          <div className="section-title">Tracking</div>
          <ol className="ship-events">
            {d.events.map((e, i) => {
              const warn = !e.planned && (e.stage === 'delayed' || e.stage === 'what-if' || (e.stage === 'inspection' && /reject/i.test(e.text)));
              return (
              <li key={i} className={`${e.planned ? 'planned' : 'done'}${warn ? ' warn' : ''}`}>
                {e.planned ? <CircleDashed size={14} /> : warn ? <TriangleAlert size={14} /> : <CircleDot size={14} />}
                <span className="num" style={{ minWidth: 52 }}>{date(e.at)}</span>
                <span>{e.text}{e.planned && <span className="faint"> (planned)</span>}</span>
              </li>
              );
            })}
          </ol>
        </section>
      )}

      {d.po && (
        <section aria-label="Order and transport">
          <div className="section-title">Order and transport</div>
          <dl className="kv">
            <dt>Purchase order</dt><dd className="mono">{d.po.number}</dd>
            <dt>Placed</dt><dd>{date(d.po.placedOn)}</dd>
            <dt>Unit cost</dt><dd>${d.po.unitCost.toFixed(2)} · order value ${num(Math.round(value ?? 0))}</dd>
            <dt>Terms</dt><dd>{d.po.incoterm}</dd>
            {d.transport && <><dt>Transport</dt><dd><Truck size={13} style={{ verticalAlign: -2 }} /> {d.transport.mode === 'air' ? 'Air' : 'Sea'} · {d.transport.carrier} · <span className="mono">{d.transport.tracking}</span></dd></>}
          </dl>
        </section>
      )}

      {d.inspection && (
        <section aria-label="Incoming inspection">
          <div className="section-title">Incoming inspection</div>
          <p>
            {d.inspection.result === 'passed' ? 'Passed' : <b style={{ color: 'var(--blocked)' }}>Rejected</b>}: {d.inspection.failed} of {d.inspection.sampled} samples failed{d.inspection.reason ? ` (${d.inspection.reason})` : ''}.
          </p>
        </section>
      )}

      {sup && (
        <section aria-label="Supplier">
          <div className="section-title">Supplier: {supplierName(data, sup.id)}</div>
          <dl className="kv">
            <dt>Location</dt><dd>{sup.region}</dd>
            <dt>On time (12 months)</dt><dd>{pct(sup.onTimeRate)}{sup.avgDelayDays !== undefined && ` · late ones average ${sup.avgDelayDays} days`}</dd>
            <dt>Quality</dt><dd>{sup.defectPpm} defective parts per million</dd>
            <dt>Lead time</dt><dd>{sup.leadTimeDays} days</dd>
            {sup.latestNote && <><dt>Latest note</dt><dd>{sup.latestNote}</dd></>}
          </dl>
        </section>
      )}
      <p className="faint" style={{ fontSize: 12 }}>Fictional orders, carriers and tracking numbers.</p>
    </Drawer>
  );
}

export function SupplierScorecard() {
  const { data } = useWorkspace();
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><h3>Suppliers</h3><span className="faint" style={{ fontSize: 12 }}>last 12 months</span></div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Supplier</th><th className="hide-md">Supplies</th><th className="right">On time</th><th className="right hide-sm">Avg delay</th><th className="right hide-sm">Defects (ppm)</th><th className="right hide-md">Lead time</th><th className="right">Open shipments</th><th className="hide-md">Latest note</th></tr>
          </thead>
          <tbody>
            {[...data.suppliers].sort((a, b) => (a.onTimeRate ?? 1) - (b.onTimeRate ?? 1)).map((s) => {
              const ships = data.deliveries.filter((d) => d.supplier === s.id);
              const open = ships.filter((d) => d.status !== 'rejected' && (!d.eta || d.eta > data.config.asOf));
              const problems = ships.filter((d) => d.status !== 'confirmed');
              const weak = (s.onTimeRate ?? 1) < 0.85;
              return (
                <tr key={s.id}>
                  <td><div className="cell-title">{supplierName(data, s.id)}</div><div className="cell-sub">{s.region}</div></td>
                  <td className="hide-md muted" style={{ fontSize: 13 }}>{[...new Set(ships.map((d) => partName(data, d.part)))].join(', ')}</td>
                  <td className="right num">
                    <span style={{ color: weak ? 'var(--risk)' : undefined, fontWeight: weak ? 600 : undefined }}>{pct(s.onTimeRate)}</span>
                    {weak && <div className="cell-sub" style={{ color: 'var(--risk)' }}>below 85%</div>}
                  </td>
                  <td className="right num hide-sm">{s.avgDelayDays} d</td>
                  <td className="right num hide-sm">{s.defectPpm}</td>
                  <td className="right num hide-md">{s.leadTimeDays} d</td>
                  <td className="right num">{open.length}{problems.length > 0 && <div className="cell-sub" style={{ color: 'var(--risk)' }}>{problems.length} with a problem</div>}</td>
                  <td className="hide-md muted" style={{ fontSize: 13, maxWidth: 300 }}>{s.latestNote}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
