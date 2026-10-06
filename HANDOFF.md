# LaunchReady — Handoff

Resume prompt: "Continue LaunchReady. Read HANDOFF.md in hemant-singla/launchready and carry on from the next unfinished step."

## Status
| Step | State |
|---|---|
| Plan + readiness rules | ✅ Approved by Hemant (2026-10-06) |
| 1 — The problem | ✅ Done; Hemant said "continue" (2026-10-06) |
| 2 — Product + code | ✅ Done: data/, src/, tests/ (14 passing), index.html + assets/, docs/DATA.md, docs/CODE_WALKTHROUGH.md |
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
  - Supply: allocate in need-date order, with no double allocation. Two need dates: test boards, then production. Undated deliveries count as zero and are flagged. Ready = free stock + confirmed deliveries before need. At risk = needs a substitute, a tight delivery, or an undated one. Blocked = a shortfall remains.
  - Launch status = the worse of the two sides, with reasons from both.

## Step 2 facts
- Baseline: 12 Ready, 4 At risk (Lumen 65/75: Indus-L display code late; Zenith 55/65: open critical audio ticket), 0 Blocked.
- USB delay scenario: Halo 77 goes At risk (Volga-X testing starts 8 Dec instead of 12 Nov; ready 8–15 Jan vs 11 Jan cutoff). Options are checked in tests: move 20 UC-300 from DL-UC3-02 → Ready; substitute UC-310 → testing starts 13–26 Nov; move launch to 25 Jan → software Ready.
- Competing scenario: Zenith 75/85 Blocked, Zenith 55/65 served first. Missing date scenario: Halo 55/65/77 At risk, delivery flagged and not counted.
- Decision: demand lines are served in need-date order; supply pegged to a chipset (a PO placed for it) is used first. A substitute is shown as an option and only applied when chosen. Its driver change delays the test start by 1–14 days.
- Decision: a late test start is shown as context; the verdict comes from the ETA range itself.

## Blocker
- GitHub push refused (403): the Claude GitHub App is not installed on hemant-singla/launchready. Commits are local and mirrored to /mnt/project-files/launchready.

## Next
Step 3 (how it helps), Step 4 (PM specs), then Step 5 (agent: ask before API spend).

## Credits used
- **Estimate (not measured):** about $8 so far (planning, Step 1, Step 2 code + app). Projected total: $30–40 of the $50 budget.
- **Facts:** no API calls spent on agent runs yet.
