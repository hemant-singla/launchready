# LaunchReady

**A launch go/no-go tool for a fictional TV maker that joins software readiness and supply in one view.**

> Portfolio project by [Hemant Singla](https://hemant-singla.github.io). **Fictional company and data.** It isn't deployed, has no real users and claims no savings. Every date and quantity shown is calculated by the code in this repo.

**Live demo:** https://hemant-singla.github.io/launchready/ · **Product brief:** [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md)

![LaunchReady start page: the question, a live status board and one-click scenario](docs/img/home.png)

![Launch view with the USB controller delay scenario: timeline of software-ready ranges against launch dates](docs/img/launch-usb-delay.png)

## What it is
A TV launch needs two things at once: software that's ready, and parts to build both the test boards and the TVs. They're usually tracked in different tools (issue trackers on one side, ERP and spreadsheets on the other). LaunchReady joins them:
- **Launch view:** Ready / At risk / Blocked for 16 models, with the reasons from both sides; filters by line, chipset and status.
- **Software team view:** each component team's code submission against the deadline, new vs reused code, open tickets by severity and age, and an estimated software-ready **range** per chipset.
- **Supply view:** stock by warehouse (including what's already allocated), supplier deliveries and delays, rejected shipments, approved substitutes, and which build gets which units.
- **Scenarios:** a USB controller delay, two launches competing for one part, and a delivery with no date. Each recalculates everything with the real logic. *Reset demo* puts it back.
- **AI agent:** investigates a change with tools, weighs options, proposes a plan and drafts messages, then waits for approval. The app replays **real agent runs, recorded during the build**.

The key link: **test boards need parts**. A late USB controller means fewer test boards, which means testing starts late and the software date slips. That chain crosses both tools, which is why it's usually discovered late.

## How the verdict is calculated
- **Software (per chipset):** test start = latest of planned start, code complete + 3 days, and test boards available. Ready range = the later of (test window + stabilisation tail) and (open-ticket fix days ÷ team capacity). Ready if the latest date is ≥ 7 days before launch, with no late code and no open criticals. Blocked if even the earliest date is after launch.
- **Supply (per model):** parts are handed out in need-date order, and each unit only once. Rejected and undated deliveries are never counted. Late, tight, substitute-dependent or undated coverage → At risk. Missing parts, or production parts more than 7 days late → Blocked.
- **Launch:** the worse of the two, with reasons from both. All thresholds are in [`data/config.json`](data/config.json).

## How the agent works
`agent/run.mjs` is a plain tool-use loop with Claude (Sonnet 5.5). The agent gets the event and 7 tools (`agent/tools.js`): lookups and what-if simulations that call the same logic as the app, plus `propose_plan`. It can't make up numbers: every quantity and date comes from a tool result. Each run is saved to `runs/` and replayed step by step in the **Agent** tab, where you can approve the plan, assign owners and mark items done.

## Run it
```bash
npm test                                  # logic + agent-tool tests (Node 20+, no installs)
python3 -m http.server 8000               # open http://localhost:8000
npm install && ANTHROPIC_API_KEY=... node agent/run.mjs   # re-record agent runs (costs API credits)
node tools/generate-data.mjs && node tools/data-overview.mjs   # rebuild data + docs/DATA.md
```
Plain HTML/CSS/JavaScript with no framework and no build step. [docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md) explains the code in five minutes.

## Honest limitations
- Fictional data, and the baseline was designed so the scenarios show clear effects.
- No real integrations (Jira, ERP, supplier portals); data quality is assumed.
- Simplified model: key parts only, no warehouse transfer times, no test-lab capacity, no costs.
- The rules (buffers, fix-time ranges, allocation order) are reasonable defaults, not validated ones.
- The agent is replayed, not live. Its wording and choice of options can be wrong, so a human approves every plan.

More in the [product brief](docs/PRODUCT_BRIEF.md) §8.

<p align="center"><img src="docs/img/mobile-launch.png" width="260" alt="Launch view on a phone"></p>
