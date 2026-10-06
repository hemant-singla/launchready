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
| 5 — AI agent | ✅ In the app: Recovery tab, a labelled **simulated agent workflow** (scripted steps, calculated results, approve/reject). Real agent code in agent/ (tools tested). **No real runs recorded** (needs ANTHROPIC_API_KEY; optional) |
| 6 — Website | ✅ Live at https://hemant-singla.github.io/launchready/ (redesign + workflow upgrade). Case study + homepage entry in portfolio PR #1, **waiting for Hemant to merge**. Hemant said "move to next step" (2026-10-06) |
| 7 — Supply-chain role | ✅ Brief §7 done (the case study copy is part of Step 6) |
| 8 — Gaps | ✅ Brief §8 done (README + case study copy are part of Step 6) |
| Finish | ✅ 2026-10-06: links, mobile, tests checked; deliverables listed below |
| Motion pass | ✅ 2026-10-06 (Hemant raised the budget to ~$62; skipped the demo video): animated TV scene in the hero with Play/Pause (assets/scene.js), signal-line background, workspace change messages + counting numbers + clickable cards, animated recovery preview in the Recovery tab |
| Clarity pass | ✅ 2026-10-06 (Hemant: "go with the plan", from a ChatGPT review): new headline, start page = intro → worked example → try-it workspace → assumptions; plain-language `explain()` per affected launch; three questions in the lab panel; options as action / result / trade-off / approval; terms explained on demand; evidence row. Open: ChatGPT's "calculation mismatch" (details asked from Hemant, not yet received) |

## Decisions (facts)
- Tech: plain HTML/CSS/JS, no build step, served by GitHub Pages. Core logic lives in shared JS modules used by both the app and the Node tests (`node --test`). Data is JSON.
- Agent: the app shows a simulated workflow over `src/recovery.js`. The real agent (Sonnet via the Anthropic API, tool calls into the same JS logic) can record runs to `runs/` if a key is added later.
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

## Workflow upgrade (2026-10-06, Hemant's detailed brief: scenario → impact → recovery → approval)
- **What-if lab** on the start page: any shipment ±(−14…+60) days via slider or validated date input, reject, remove date, or move a launch; tiles, counts and the parts → testing → software → launch chain update live. Launch diamonds draggable on the timeline (← / → by keyboard).
- **Recovery logic** (`src/recovery.js`): eligible actions only (re-peg a same-part PO from another program with a 2-day transfer; approved substitute with driver change 1–14 d + validation 2–4 d; later launch up to 42 d). Each is tested with the engine; options that don't help or hurt another launch are listed as "considered but not offered". Escalation note when nothing fully resolves it.
- **Recovery tab** = "Simulated agent workflow" (scripted steps; numbers calculated now). Approve applies the action to the demo data; reject only logs. Activity log; Reset clears everything.
- **Affected first** on Launch / Software / Supply with Affected only / Show all; why-it-matters lines; evidence links from a launch to its chipset and parts (filters carry over).
- **60-second tour** (skippable, non-modal) and an **About this prototype** section (users, decision, assumptions, built vs proposed, why fictional).
- Data/config: `transferDays: 2`, `maxLaunchMoveDays: 42`, substitute `validationDays: [2, 4]` (also in tools/generate-data.mjs).
- Tests: 32 pass (new: tests/lab.test.mjs, tests/recovery.test.mjs). Checked in Chromium at 1280 px and 390 px, keyboard path through approve, the tour, and date validation; no console errors; no horizontal page scroll.
- Decision: no agent runs recorded (no key), so the app shows a clearly labelled simulation. `agent/run.mjs` stays as the proposed real-agent path.

## Blockers
- Agent runs need ANTHROPIC_API_KEY (environment variable in the project's cloud environment; only new sessions see it).

## Finish checks (2026-10-06, facts)
- `npm test`: 32 pass, 0 fail.
- Relative links in README.md and docs/*.md, and every local file referenced by index.html: all exist. Unused docs/img/supply-uc300.png removed.
- App in Chromium at 1280 px and 390 px: no console errors, no horizontal page scroll; tour, keyboard path to Approve, date validation and Reset all work.
- Portfolio case study (PR branch) at 1280 px and 390 px: no errors, no 404s, no horizontal scroll; homepage links to it. Case study text updated to say the agent is a simulated workflow (it previously said "recorded runs", which was no longer true).
- Pages build for commit f0b6e9c: success. The live URL can't be fetched from the build environment (proxy), so it was checked locally.

## Deliverables
- Live demo: https://hemant-singla.github.io/launchready/
- Code: https://github.com/hemant-singla/launchready (data/, src/, tests/, assets/, agent/, tools/)
- Product brief: docs/PRODUCT_BRIEF.md (§1–5, 7, 8); data overview: docs/DATA.md; interview walkthrough: docs/CODE_WALKTHROUGH.md
- README with screenshots (docs/img/)
- Portfolio case study + homepage entry: PR https://github.com/hemant-singla/hemant-singla.github.io/pull/1 (merge to publish)

## Next (optional)
1. Hemant: merge portfolio PR #1 to publish the case study.
2. If wanted: add ANTHROPIC_API_KEY, then `npm install && node agent/run.mjs` (Sonnet 5.5, est. $1–3) to record real runs; they must keep the "Real agent run, recorded during the build and replayed" label.
3. Brief is ~3,450 words (about 7 pages vs the 4–5 asked); trim if Hemant wants.
4. Do NOT change any existing portfolio wording; only the LaunchReady entry and page are ours.

## Credits used
- **Estimate (not measured):** about $55–58 so far (planning, Steps 1–5 code, 7–8 text, Step 6, redesign ~$5, what-if lab + recovery workflow ~$12–15, clarity pass ~$5–6, TV hero ~$2, motion pass ~$8). Budget raised to ~$62 by Hemant on 2026-10-06; about $4–7 left.
- **Facts:** no API calls spent on agent runs yet.
