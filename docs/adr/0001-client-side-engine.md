# 1. Compute everything client-side from a pure engine

- Status: accepted
- Date: 2026-10-29

## Context

LaunchReady is a public prototype on GitHub Pages: no server, no secrets, no running costs. The same numbers have to appear in the UI, in unit tests, and in the tool results an AI agent sees. The dataset is small (tens of models, hundreds of rows).

## Decision

All business logic lives in `src/engine` as pure TypeScript functions over plain data, with no React or I/O. The dataset is bundled at build time. The app, the tests (Vitest) and the agent tools (`src/agent/tools.ts`) import the same functions.

## Consequences

- One source of truth for every rule; a test failure means the UI would be wrong too.
- What-if previews are instant (a full recompute takes milliseconds), so the UI can recalculate on every slider move.
- No shared state between viewers. Decisions travel in the URL instead (see ADR 0003).
- At real scale the engine would move behind an API, but its pure-function shape makes that a packaging change, not a rewrite.
