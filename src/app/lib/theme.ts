// Light / dark theme. Follows the system until the user picks one; the
// choice is a per-viewer convenience, so storage failures are ignored.
import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'lr-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const m = media();
  m.addEventListener('change', cb);
  return () => {
    listeners.delete(cb);
    m.removeEventListener('change', cb);
  };
};

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return media().matches ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, current);
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
    listeners.forEach((l) => l());
  }, []);
  return [theme, toggle];
}
