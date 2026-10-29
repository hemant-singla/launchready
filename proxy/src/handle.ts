// The assistant proxy: the only place the Anthropic API key lives.
//
// It accepts the browser's request but keeps only `messages`; the model,
// system prompt, tools and limits are rebuilt from src/agent/assistant.ts, so
// the endpoint can't be used as a general-purpose Claude API. On top of that:
// an origin allowlist, a per-IP rate limit, and size caps. The response
// stream is passed through unchanged.
import type Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_BETAS, buildParams } from '../../src/agent/assistant';

/** Cloudflare's rate-limiting binding (see wrangler.toml). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ANTHROPIC_API_KEY: string;
  /** Comma-separated origins allowed to call the proxy. */
  ALLOWED_ORIGINS: string;
  RATE_LIMITER?: RateLimiter;
}

export const UPSTREAM = 'https://api.anthropic.com/v1/messages';
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_MESSAGES = 80;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

function cors(origin: string | null, env: Env): Record<string, string> | null {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/** An error in the API's own shape, so the SDK maps it to its typed errors. */
function apiError(status: number, type: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function validMessages(value: unknown): value is Anthropic.Beta.BetaMessageParam[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_MESSAGES &&
    // Only user and assistant turns: no injected system messages.
    value.every((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content))) &&
    value[0].role === 'user'
  );
}

export async function handle(request: Request, env: Env, upstream: Fetch = fetch): Promise<Response> {
  const corsHeaders = cors(request.headers.get('Origin'), env);
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    if (!corsHeaders) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') ?? 'content-type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (!corsHeaders) return apiError(403, 'permission_error', 'Origin not allowed.');
  if (request.method !== 'POST' || url.pathname !== '/v1/messages') return apiError(404, 'not_found_error', 'Not found.', corsHeaders);

  if (env.RATE_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return apiError(429, 'rate_limit_error', 'Too many requests. Try again in a minute.', { ...corsHeaders, 'retry-after': '30' });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return apiError(413, 'request_too_large', 'Conversation too long. Start a new one.', corsHeaders);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, 'invalid_request_error', 'Body must be JSON.', corsHeaders);
  }
  const messages = (body as { messages?: unknown })?.messages;
  if (!validMessages(messages)) return apiError(400, 'invalid_request_error', 'Invalid messages.', corsHeaders);

  const { betas, ...params } = buildParams(messages);
  const res = await upstream(UPSTREAM, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': (betas ?? ASSISTANT_BETAS).join(','),
    },
    body: JSON.stringify(params),
  });

  // Stream the upstream response straight back.
  const headers = new Headers(corsHeaders);
  for (const h of ['content-type', 'request-id', 'retry-after']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
}
