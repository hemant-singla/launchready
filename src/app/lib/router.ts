// A small hash router. GitHub Pages serves static files only, so routes live
// in the hash: #/app/launches/HAL-77?w=<workspace>. The path picks the view;
// the query carries the shareable workspace state (see state/workspace.tsx).
import { useSyncExternalStore } from 'react';

export interface Route {
  /** Path segments, e.g. ['app', 'launches', 'HAL-77']. */
  segments: string[];
  query: URLSearchParams;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path, search = ''] = raw.split('?');
  return { segments: path.split('/').filter(Boolean), query: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}

const currentQuery = () => parseHash(window.location.hash).query.toString();

/** Build an href for a path, keeping the current workspace query. */
export function href(path: string, query = currentQuery()): string {
  return `#${path}${query ? `?${query}` : ''}`;
}

/** Go to a path (adds a history entry), keeping the workspace query. */
export function navigate(path: string): void {
  window.location.hash = href(path).slice(1);
}

/** Replace the query without adding a history entry (used for state sync). */
export function replaceQuery(query: string): void {
  const { segments } = parseHash(window.location.hash);
  const next = `#/${segments.join('/')}${query ? `?${query}` : ''}`;
  if (next !== window.location.hash) {
    window.history.replaceState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
