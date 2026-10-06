# LaunchReady — Handoff

Resume prompt: "Continue LaunchReady. Read HANDOFF.md in hemant-singla/launchready and carry on from the next unfinished step."

## Status
| Step | State |
|---|---|
| Plan + readiness rules | ✅ Approved by Hemant (2026-10-06) |
| 1 — The problem | ✅ Done; Hemant said "continue" (2026-10-06) |
| 2 — Product + code | ✅ Done: data/, src/, tests/ (14 passing), index.html + assets/, docs/DATA.md, docs/CODE_WALKTHROUGH.md |
| 3 — How it helps | ✅ Done: PRODUCT_BRIEF §3 (plus §2 product summary) |
| 4 — PM specs | ✅ Done: PRODUCT_BRIEF §4 |
| 5 — AI agent | 🟡 Code done: agent/tools.js, agent/run.mjs, Agent panel (assets/agent.js), brief §5, 20 tests. **Runs NOT recorded yet**: Hemant chose Sonnet 5.5 (quoted ~$1–3, estimate), needs ANTHROPIC_API_KEY in the cloud environment |
| 6 — Website | 🟡 Live at https://hemant-singla.github.io/launchready/ and redesigned (see below). Case study + homepage entry in portfolio PR #1 (Hemant merges). Checkpoint: Hemant's one round of feedback |
| 7 — Supply-chain role | ✅ Brief §7 done (the case study copy is part of Step 6) |
| 8 — Gaps | ✅ Brief §8 done (README + case study copy are part of Step 6) |

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

## Site redesign (2026-10-06, after Hemant said the site looked weak; Kinaxis given as a general example only, nothing copied)
- New start page: dark hero with the question, a live status board computed in the browser, a "Play the USB delay" button, a 5-step chain card row computed from the USB scenario, feature cards, and the rules folded into a collapsible section.
- Launch view: new SVG timeline (assets/timeline.js) with each model's software-ready range vs the 7-day buffer and launch date, hover/tap tooltips, models that changed status highlighted. KPI count cards with icons.
- Restyled everything (assets/style.css): navy header with pill tabs, sticky scenario bar (swipeable row on phones), card layouts. Same portfolio colours and fonts. Checked at 1280 px and 390 px; no JS errors (the only 404 is runs/*.json, which don't exist yet).
- Agent tab now says plainly that no run has been recorded yet, instead of an empty line.
- README screenshots refreshed (docs/img/home.png added). The portfolio PR preview image still shows the old design.

## Blockers
- Agent runs need ANTHROPIC_API_KEY (environment variable in the project's cloud environment; only new sessions see it).

## Next
1. When the key is available: `npm install && node agent/run.mjs` (all three scenarios, Sonnet 5.5). Check each runs/*.json plan against the tool outputs, commit, and note the real token usage here.
2. Step 6 checkpoint: Hemant reviews the live, redesigned site and sends one round of feedback; apply small changes. Do NOT change any existing portfolio wording (Hemant objected); only add the LaunchReady entry and page.
3. Brief is ~3,450 words (about 7 pages vs the 4–5 asked); trim if Hemant wants.

## Credits used
- **Estimate (not measured):** about $23 so far (planning, Steps 1–5 code, 7–8 text, Step 6, redesign ~$5). Projected total: $30–40 of the $50 budget.
- **Facts:** no API calls spent on agent runs yet.
