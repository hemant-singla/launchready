# 5. An in-app assistant: tools in the browser, a thin proxy for the key

- Status: accepted
- Date: 2026-10-29

## Context

Users should be able to ask the plan questions in plain language ("why is Halo 77 at risk?", "what if Northbay slips another week?") instead of finding the answer across views. The site is static (GitHub Pages), so it can't hold an API key. Answers must not contain invented numbers, and the assistant must not change the plan on its own (ADR 0002).

## Decision

- **Tools run in the browser** against the live workspace, wrapping the engine. The model only decides what to look up and how to explain it.
- **A Cloudflare Worker proxy** holds the key. It accepts only `messages` and rebuilds the request (model, system prompt, tools, limits) from the same module the browser uses, so it can't be used as a general Claude endpoint. It adds an origin allowlist, a per-IP rate limit and size caps. The spend cap lives in the Console.
- **A manual streaming loop** (`src/agent/loop.ts`), not the SDK's tool runner, because the tools must run in the browser against React state and the transport has to work through the proxy. The loop is transport-agnostic and unit-tested with a scripted model.
- **Changes are proposals.** Two tools return a description that the panel renders as a button; applying it goes through the normal reducer, with Undo and the activity log.
- **Model:** Claude Sonnet 5.5 at `medium` effort for cost and latency, with server-side refusal fallback.
- **Fallback for development:** without a proxy URL, a visitor can paste their own key, kept in sessionStorage and sent only to Anthropic.

## Consequences

- The assistant's answers can always be traced to tool results, which the panel shows.
- The hosted assistant needs one-time setup (Cloudflare and Anthropic credentials); until then the site still works and the panel asks for a key.
- Rate limiting is per IP and approximate; the Console spend limit is the real cost ceiling.
- No conversation is stored server-side; a reload starts a new conversation.
