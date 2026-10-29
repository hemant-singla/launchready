// How the browser reaches Claude.
//
// - Proxy (production): VITE_AGENT_PROXY_URL points at the Cloudflare Worker in
//   proxy/, which holds the API key and rebuilds every request (fixed model,
//   prompt and tools, rate-limited). No secret ever reaches the browser.
// - Own key (local development or a visitor's choice): an API key kept in this
//   tab's sessionStorage and sent only to api.anthropic.com.
import Anthropic from '@anthropic-ai/sdk';
import type { StreamFn } from '../../agent/loop';

export type Connection = { mode: 'proxy'; url: string } | { mode: 'key'; key: string };

const KEY = 'lr-anthropic-key';
export const PROXY_URL = import.meta.env.VITE_AGENT_PROXY_URL?.trim() ?? '';

export function savedConnection(): Connection | null {
  if (PROXY_URL) return { mode: 'proxy', url: PROXY_URL };
  try {
    const key = sessionStorage.getItem(KEY);
    return key ? { mode: 'key', key } : null;
  } catch {
    return null; // storage blocked: ask again
  }
}

export function saveKey(key: string): Connection {
  try {
    sessionStorage.setItem(KEY, key);
  } catch {
    /* storage blocked: the key lasts for this page view only */
  }
  return { mode: 'key', key };
}

export function forgetKey(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** A StreamFn bound to a connection; `signal` cancels the in-flight call. */
export function createStream(conn: Connection, signal: AbortSignal): StreamFn {
  const client =
    conn.mode === 'proxy'
      ? // The proxy ignores this header and uses its own secret.
        new Anthropic({ apiKey: 'via-proxy', baseURL: conn.url, dangerouslyAllowBrowser: true, maxRetries: 1 })
      : new Anthropic({ apiKey: conn.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  return async (params, onText) => {
    const stream = client.beta.messages.stream(params, { signal });
    stream.on('text', (delta) => onText(delta));
    return stream.finalMessage();
  };
}

/** A short, human message for a failed call. */
export function describeError(err: unknown, conn: Connection | null): string {
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.';
  if (err instanceof Anthropic.AuthenticationError) return conn?.mode === 'key' ? 'That API key was rejected. Check it and try again.' : 'The assistant service rejected the request.';
  if (err instanceof Anthropic.RateLimitError) return 'Too many questions in a short time. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the assistant. Check your connection and try again.";
  if (err instanceof Anthropic.APIError) return `The assistant returned an error (${err.status ?? 'unknown'}). Try again in a moment.`;
  return 'Something went wrong while answering. Try again.';
}
