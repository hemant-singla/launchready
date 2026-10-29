// ⌘K command palette: jump to any view or launch, apply a disruption, reset.
import { Command } from 'cmdk';
import { Link2, Moon, RotateCcw, Zap } from 'lucide-react';
import { SCENARIOS, type ScenarioKey } from '../../engine/scenarios';
import { navigate } from '../lib/router';
import { useWorkspace } from '../state/workspace';
import { useTheme } from '../lib/theme';
import { useToast } from './useToast';
import { Modal, StatusText } from './ui';
import { VIEWS, type View } from '../lib/views';
import { date } from '../lib/format';

export function CommandPalette({ onClose, onSimulate, onShare }: { onClose: () => void; onSimulate: () => void; onShare: () => void }) {
  const { result, state, toggleScenario, reset } = useWorkspace();
  const [, toggleTheme] = useTheme();
  const toast = useToast();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal onClose={onClose} label="Command menu">
      <Command label="Command menu" loop>
        <Command.Input placeholder="Search launches, views and actions…" data-autofocus />
        <Command.List>
          <Command.Empty>No results.</Command.Empty>
          <Command.Group heading="Go to">
            {(Object.keys(VIEWS) as View[]).map((v) => {
              const { title, icon: Icon } = VIEWS[v];
              return (
                <Command.Item key={v} value={`go ${title}`} onSelect={run(() => navigate(`/app/${v}`))}>
                  <Icon size={16} /> {title}
                </Command.Item>
              );
            })}
          </Command.Group>
          <Command.Group heading="Launches">
            {result.models.map((m) => (
              <Command.Item key={m.id} value={`launch ${m.name} ${m.id} ${m.chipset} ${m.line}`} onSelect={run(() => navigate(`/app/launches/${m.id}`))}>
                <span>{m.name}</span>
                <span className="faint">{date(m.launchDate)}</span>
                <span className="right"><StatusText status={m.status} /></span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Simulate">
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => (
              <Command.Item key={k} value={`simulate ${SCENARIOS[k].title}`} onSelect={run(() => toggleScenario(k))}>
                <Zap size={16} />
                {state.scenarios.includes(k) ? 'Remove: ' : ''}
                {SCENARIOS[k].title}
              </Command.Item>
            ))}
            <Command.Item value="simulate custom what-if delay shipment" onSelect={run(onSimulate)}>
              <Zap size={16} /> Custom what-if…
            </Command.Item>
            <Command.Item value="reset original plan" onSelect={run(() => { reset(); toast('Back to the original plan'); })}>
              <RotateCcw size={16} /> Reset to the original plan
            </Command.Item>
          </Command.Group>
          <Command.Group heading="General">
            <Command.Item value="copy share link" onSelect={run(onShare)}>
              <Link2 size={16} /> Copy link to this view
            </Command.Item>
            <Command.Item value="toggle theme dark light" onSelect={run(toggleTheme)}>
              <Moon size={16} /> Toggle dark mode
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  );
}
