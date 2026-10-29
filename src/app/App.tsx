import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link2, Menu, Search, Sparkles, Zap, RotateCcw } from 'lucide-react';
import { useRoute, navigate } from './lib/router';
import { useWorkspace } from './state/workspace';
import { useToast } from './components/useToast';
import { Sidebar } from './components/Sidebar';
import { VIEWS, type View } from './lib/views';
import { CommandPalette } from './components/CommandPalette';
import { SimulateDialog } from './components/SimulateDialog';
import { Kbd } from './components/ui';
import { LaunchesPage } from './pages/LaunchesPage';

const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const RecoveryPage = lazy(() => import('./pages/RecoveryPage'));
const SupplyPage = lazy(() => import('./pages/SupplyPage'));
const SoftwarePage = lazy(() => import('./pages/SoftwarePage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const TestLabPage = lazy(() => import('./pages/TestLabPage'));
const StoryPage = lazy(() => import('./story/StoryPage'));
// The assistant (and the Anthropic SDK) load on first open, then stay mounted
// so the conversation survives closing the panel.
const AssistantPanel = lazy(() => import('./assistant/AssistantPanel'));

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function App() {
  const route = useRoute();
  const [first, second, third] = route.segments;
  if (first !== 'app') {
    return (
      <Suspense fallback={null}>
        <StoryPage />
      </Suspense>
    );
  }
  const view = (second in VIEWS ? second : 'launches') as View;
  return <AppShell view={view} id={third} query={route.query} />;
}

function AppShell({ view, id, query }: { view: View; id?: string; query: URLSearchParams }) {
  const { isDisrupted, reset, state } = useWorkspace();
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [menu, setMenu] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  if (assistant && !assistantLoaded) setAssistantLoaded(true);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copied: it opens this view with the same disruption and decisions');
    } catch {
      toast('Copy the address bar to share this view');
    }
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, select, textarea');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('[role="dialog"]')) {
        if (e.key === 's') { e.preventDefault(); setSimulate(true); }
        if (e.key === 'a') { e.preventDefault(); setAssistant(true); }
        const go: Record<string, View> = { '1': 'launches', '2': 'timeline', '3': 'recovery', '4': 'software', '5': 'issues', '6': 'testlab', '7': 'supply', '8': 'activity' };
        if (go[e.key]) navigate(`/app/${go[e.key]}`);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.title = `${VIEWS[view].title} · LaunchReady`;
  }, [view]);

  const page = (() => {
    switch (view) {
      case 'launches': return <LaunchesPage selected={id} />;
      case 'timeline': return <TimelinePage />;
      case 'recovery': return <RecoveryPage />;
      case 'supply': return <SupplyPage chipset={query.get('chipset') ?? ''} selected={id} />;
      case 'software': return <SoftwarePage chipset={query.get('chipset') ?? ''} />;
      case 'issues': return <IssuesPage selected={id} query={query} />;
      case 'testlab': return <TestLabPage />;
      case 'activity': return <ActivityPage />;
    }
  })();

  const changes = state.scenarios.length + (state.lab ? 1 : 0);

  return (
    <div className={`shell${assistant ? ' with-assistant' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar view={view} open={menu} onNavigate={() => setMenu(false)} />
      {menu && <div className="scrim" style={{ zIndex: 44 }} onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={18} /></button>
          <h1>{VIEWS[view].title}</h1>
          {isDisrupted && (
            <span className="badge accent hide-sm" title="A what-if is applied to the plan">
              <Zap size={12} /> What-if active{changes > 1 ? ` (${changes})` : ''}
            </span>
          )}
          <span className="spacer" />
          <button className="btn search-btn" onClick={() => setPalette(true)} aria-label="Search and commands">
            <Search size={15} /> <span className="label">Search or jump to…</span> <Kbd>{isMac ? '⌘' : 'Ctrl'} K</Kbd>
          </button>
          {isDisrupted && (
            <button className="btn ghost icon" onClick={() => { reset(); toast('Back to the original plan'); }} aria-label="Reset to the original plan" title="Reset to the original plan">
              <RotateCcw size={16} />
            </button>
          )}
          <button className="btn ghost icon hide-sm" onClick={share} aria-label="Copy link to this view" title="Copy link to this view"><Link2 size={16} /></button>
          <button className="btn" onClick={() => setAssistant((v) => !v)} aria-pressed={assistant} title="Ask LaunchReady (A)">
            <Sparkles size={15} /> <span className="hide-sm">Ask AI</span>
          </button>
          <button className="btn primary" onClick={() => setSimulate(true)} title="Simulate a disruption (S)">
            <Zap size={15} /> <span className="hide-sm">Simulate disruption</span>
          </button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Suspense fallback={<div className="empty">Loading…</div>}>{page}</Suspense>
        </main>
      </div>
      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantPanel open={assistant} onClose={() => setAssistant(false)} view={id ? `${VIEWS[view].title} › ${id}` : VIEWS[view].title} />
        </Suspense>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} onSimulate={() => setSimulate(true)} onShare={share} onAsk={() => setAssistant(true)} />}
      {simulate && <SimulateDialog onClose={() => setSimulate(false)} />}
    </div>
  );
}
