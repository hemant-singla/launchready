# 2. Deterministic recovery search; AI explains, never computes

- Status: accepted
- Date: 2026-10-29

## Context

Recovery options (re-allocate an order, use an approved substitute, move a launch) must be correct: a wrong quantity or a re-allocation that silently breaks another launch is worse than no suggestion. Language models are good at investigating and explaining, but can state numbers they didn't compute.

## Decision

Options are generated and tested by a deterministic search (`recoveryOptions`): every candidate is applied to a copy of the plan and recalculated against all launches; anything that doesn't help or that hurts another launch is dropped, with the reason kept. An AI agent can sit on top using tools that wrap the same engine (`src/agent/tools.ts`). The agent's instructions require every date, quantity and status to come from a tool result, and a human approves any plan.

The earlier version showed a *scripted* "agent workflow". It was labelled as simulated, but it still read as a mock-up. The app now shows the deterministic search as what it is.

## Consequences

- Every option on screen is reproducible and covered by tests.
- The AI layer is optional and additive. Without an API key the product still works fully.
- Recorded agent runs, if added, must be labelled as recorded (a test enforces the label).
