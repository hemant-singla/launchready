import { Check, Moon, Sun, BookOpen } from 'lucide-react';
import { VIEWS, type View } from '../lib/views';
import { href } from '../lib/router';
import { useWorkspace } from '../state/workspace';
import { useTheme } from '../lib/theme';
import { dateLong } from '../lib/format';

export function Sidebar({ view, open, onNavigate }: { view: View; open: boolean; onNavigate: () => void }) {
  const { result, affected, base, state, data } = useWorkspace();
  const [theme, toggleTheme] = useTheme();
  const needAttention = result.models.filter((m) => m.status !== 'ready').length;
  const counts: Partial<Record<View, { n: number; alert?: boolean }>> = {
    launches: { n: needAttention, alert: affected.models.length > 0 },
    recovery: affected.models.length ? { n: affected.models.length, alert: true } : undefined,
    activity: state.decisions.log.length ? { n: state.decisions.log.length } : undefined,
    issues: { n: data.tickets.filter((t) => t.status === 'open').length },
  };
  const groups: [string, View[]][] = [
    ['Plan', ['launches', 'timeline', 'recovery']],
    ['Software', ['software', 'issues', 'testlab']],
    ['Supply', ['supply']],
    ['History', ['activity']],
  ];

  return (
    <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Main">
      <a className="brand" href={href('/app/launches')} onClick={onNavigate}>
        <span className="brand-mark" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        <span>
          <span className="brand-name">LaunchReady</span>
          <span className="brand-sub" style={{ display: 'block' }}>{base.config.company}</span>
        </span>
      </a>
      {groups.map(([label, views]) => (
        <div key={label}>
          <div className="nav-label">{label}</div>
          {views.map((v) => {
            const { title, icon: Icon } = VIEWS[v];
            const c = counts[v];
            return (
              <a key={v} className="nav-item" href={href(`/app/${v}`)} aria-current={v === view ? 'page' : undefined} onClick={onNavigate}>
                <Icon size={16} />
                {title}
                {c && <span className={`count${c.alert ? ' alert' : ''}`}>{c.n}</span>}
              </a>
            );
          })}
        </div>
      ))}
      <div className="sidebar-foot">
        <a className="nav-item" href="#/" style={{ padding: '0 2px', height: 28 }}>
          <BookOpen size={15} /> The story behind this
        </a>
        <div className="row">
          <span>Data as of {dateLong(base.config.asOf)}</span>
          <button className="btn ghost sm icon" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
        <span>Fictional company and data</span>
      </div>
    </nav>
  );
}
