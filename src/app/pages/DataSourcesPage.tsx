// Data sources: where every piece of data would come from in production, how
// it's fetched and how fresh it is, with each source's sample payload
// converted live by its adapter.
import { useState } from 'react';
import { ArrowRight, ChevronDown, Database } from 'lucide-react';
import { DATA_SOURCES, type DataSource } from '../../integrations/sources';
import { useWorkspace } from '../state/workspace';
import { date } from '../lib/format';

export default function DataSourcesPage() {
  const { data } = useWorkspace();
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Data sources</h2>
          <p>
            LaunchReady doesn't replace the systems teams already use; it reads them. Each source below names the system of
            record, how the data is fetched and how fresh it is. This demo runs on generated data as of {date(data.config.asOf)}; the
            adapters that would load the real thing are in the code, and you can run them on a sample payload from each system.
          </p>
        </div>
      </div>

      <div className="card flow" aria-label="How data flows">
        {['Source systems', 'Adapters (read-only sync)', 'Normalised tables', 'Readiness engine', 'Views and assistant'].map((s, i, all) => (
          <span key={s} className="flow-step">
            <span className="flow-box">{s}</span>
            {i < all.length - 1 && <ArrowRight size={16} className="faint" />}
          </span>
        ))}
      </div>

      <div className="sources">
        {DATA_SOURCES.map((s) => <SourceCard key={s.id} s={s} />)}
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        Product names show the kind of system and its data format; LaunchReady isn't affiliated with them, and the sample payloads are fictional.
      </p>
    </>
  );
}

function SourceCard({ s }: { s: DataSource }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card source-card">
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={16} className="accent" />
          <h3 style={{ fontSize: 15 }}>{s.name}</h3>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{s.systems}</p>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Feeds</dt><dd>{s.feeds}</dd>
          <dt>How</dt><dd>{s.how}</dd>
          <dt>Refresh</dt><dd>{s.cadence}</dd>
          <dt>Owner</dt><dd>{s.owner}</dd>
          <dt>Mapping</dt><dd><ul className="mapping">{s.fields.map((f) => <li key={f}>{f}</li>)}</ul></dd>
        </dl>
      </div>
      {s.sample && (
        <>
          <button className="sample-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} /> Run the adapter on a sample: {s.sample.label}
          </button>
          {open && (
            <div className="sample-grid">
              <div>
                <div className="section-title">From the source</div>
                <pre className="json">{JSON.stringify(s.sample.raw, null, 2)}</pre>
              </div>
              <div>
                <div className="section-title">As LaunchReady stores it</div>
                <pre className="json">{JSON.stringify(s.sample.convert(), null, 2)}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
