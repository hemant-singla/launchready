# LaunchReady — Handoff

Resume prompt: "Continue LaunchReady. Read HANDOFF.md in hemant-singla/launchready and carry on from the next unfinished step."

## Status
| Step | State |
|---|---|
| Plan + readiness rules | ✅ Approved by Hemant (2026-10-06) |
| 1 — The problem | ✍️ Drafted in docs/PRODUCT_BRIEF.md §1. Waiting at the checkpoint for Hemant's OK |
| 2 — Product + code | Not started |
| 3 — How it helps | Not started |
| 4 — PM specs | Not started |
| 5 — AI agent | Not started (ask Hemant before any API spend, with a cost quote) |
| 6 — Website | Not started (checkpoint: live link) |
| 7 — Supply-chain role | Not started |
| 8 — Gaps | Not started |

## Decisions (facts)
- Tech: plain HTML/CSS/JS, no build step, served by GitHub Pages. Core logic lives in shared JS modules used by both the app and the Node tests (`node --test`). Data is JSON.
- Agent: Sonnet via the Anthropic API with tool calls into the same JS logic. Runs are recorded to JSON and replayed in the app.
- Readiness rules (thresholds are defaults and can change):
  - Software ETA range = test start + test window (longer for new chipsets) + backlog fix time (critical 3–14 d, major 2–7, minor 1–3), divided by team capacity. Ready = all submitted, no open criticals, late ETA ≤ launch − 7 d. At risk = range straddles that buffer. Blocked = early ETA after launch.
  - Supply: allocate in launch-date order, with no double allocation. Two need dates: test boards, then production. Undated deliveries count as zero and are flagged. Ready = free stock + confirmed deliveries before need. At risk = needs a substitute, a tight delivery, or an undated one. Blocked = a shortfall remains.
  - Launch status = the worse of the two sides, with reasons from both.

## Next
After Hemant OKs Step 1, do Step 2 (data, logic, tests, static app).

## Credits used
- **Estimate (not measured):** about $2 so far (planning + Step 1 writing). Projected total: $30–40 of the $50 budget.
- **Facts:** no API calls spent on agent runs yet.
