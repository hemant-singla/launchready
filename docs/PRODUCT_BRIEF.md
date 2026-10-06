# LaunchReady — Product Brief

> **Fictional company, fictional data.** LaunchReady is a portfolio product built around a made-up TV maker. It is not deployed, has no real users, and claims no real savings. The patterns it models come from general experience with TV software launches. It contains no confidential details.

---

## 1. The problem

### The gap in one sentence
A supplier slips or tickets start piling up, and **days pass before anyone can say which launches are hit, by how much, and who owns the fix.** That's because the software picture and the supply picture live in different tools, owned by different people.

### How a TV launch actually comes together
1. **Code deadline.** Each release has a code submission deadline. Every component team (USB, display, audio, connectivity and so on) must submit by then for every chipset variant it supports.
2. **New vs reused chipsets.** A new chipset variant means building support largely from scratch. An existing one mostly reuses proven code. New variants carry far more risk.
3. **Boards go to testing.** Once all teams' code is in, physical boards go to the testing teams. **Without enough boards there's no testing**, so a part shortage delays *software*, not only production.
4. **Tickets flow back.** Testing teams (and sometimes clients) raise tickets every day. Each one routes to the owning team, so a USB issue goes to the USB team. A single issue can take anywhere from **1 day to 2 weeks** to fix.
5. **Launch.** Launches are staggered over two to three months, and models on different chipsets share some parts (for example, the USB controller).

### Where it breaks: one realistic chain
A USB controller shipment for a **new** chipset is delayed. That leads to:
→ fewer test boards → testing starts late → tickets are found later → fixes land later → the software-ready date slides past launch.

Each link in that chain is visible to *someone*, but no one sees the whole chain:
- **Procurement** sees a late PO. They don't see that it gates testing for a new chipset.
- **The software lead** sees testing start late. They don't see the reason, or that another model holds spare controllers.
- **The launch manager** hears about both in separate meetings and has to piece the impact together by hand.

The options all exist: borrow stock from a later launch, use an approved substitute part (which needs a driver change, 1 day to 2 weeks), or move the date. But each one touches the other side. Borrowing stock can create a *new* shortage elsewhere. A substitute part adds software work to a team that's already busy.

### Who feels it and what it costs them
| Person | What they deal with today | What it costs them |
|---|---|---|
| **Software lead** (per component team) | Ticket backlog in Jira; test boards arriving late with no warning | Fix work gets squeezed into the end; no early signal to push back on dates or ask for boards |
| **Planner / procurement** | Supplier delays, rejected shipments, allocations in spreadsheets or ERP | Can't tell which delay actually threatens a launch, so everything gets expedited (expensive) or nothing does (risky) |
| **Launch manager** | Builds the go/no-go by chasing both sides | Hours per week rebuilding status by hand; decisions made late, on stale or conflicting numbers |

### Two more ways it goes wrong
- **Double counting.** Two launches both "plan on" the same warehouse stock. It looks fine on paper until the second team goes to use it.
- **Silent assumptions.** A delivery with no confirmed date gets treated as if it will arrive on time, so the risk is hidden until it's too late.

### Facts, assumptions, and what to validate
**Facts (from how my former team worked; no confidential details):**
- Code deadlines come before each release, and all component teams submit by then.
- Testing teams and clients raise tickets daily, and each ticket goes to its owning team.
- New chipset variants need much more new code than existing ones.
- Boards go to testing only after code is ready, so part shortages can delay testing.
- Individual fixes took between 1 day and 2 weeks.

**Assumptions (reasonable, but not proven):**
- Software and supply status are tracked in separate tools with no shared view.
- Launch managers spend meaningful time each week reconciling the two.
- Most launch slips trace back to a few cross-side chains like the USB example.
- Approved substitutes and stock borrowing are realistic levers for a launch manager.

**To validate with real users:**
- How often a supply problem actually delays *testing* (vs only production).
- How long it takes today from "supplier slipped" to "impact known and owner assigned". This is the key metric.
- Whether launch managers would trust a computed readiness status over their own judgement.
- Who should approve a cross-team plan (moving stock, a substitute, a date change).

---

## 2. The product (built)

LaunchReady is a static web app ([code walkthrough](CODE_WALKTHROUGH.md), [data overview](DATA.md)) with three views:
- **Launch:** Ready / At risk / Blocked for all 16 models, with the reasons from both sides. You can filter by line, chipset and status.
- **Software team:** per chipset, each team's code submission against the deadline, new vs reused code, open tickets by severity and age, and the software-ready date as a range.
- **Supply:** per part, stock by warehouse (including what's already allocated), deliveries (planned vs current date, delays, rejections), approved substitutes, and which build gets which units.

Three scenario buttons change the data and recalculate everything with the same code the tests run. *Reset demo* brings it back. Baseline: 12 Ready, 4 At risk, 0 Blocked (as of 5 Oct 2026).

---

## 3. How it helps

### What changes for each person
| Person | Today | With LaunchReady |
|---|---|---|
| **Software lead** | Learns test boards are late when they don't arrive. Ticket backlog lives in Jira, with no link to launch dates. | Sees that a parts delay moves *their* test start, and by how much, the day the supplier slips. Their backlog is shown as days of work against each launch. |
| **Planner / procurement** | Sees a late PO, but not which launch it threatens or whether it gates testing. Expedites by gut feel. | Each delivery is tied to the builds it covers, in need-date order. They can see which delay actually moves a launch, and which stock could be moved without hurting another build. |
| **Launch manager** | Rebuilds go/no-go by chasing both sides; reasons arrive in different meetings. | One verdict per model, with reasons and numbers from both sides. Options (move stock, substitute, move date) are checked against the same rules before anyone commits. |

### Compared with tools that already exist
- **Supply control towers (e.g., Kinaxis, o9).** These are strong at supply/demand matching, allocation and what-if planning across the network. They see a launch as a demand date. They don't see that a new chipset needs four weeks of testing, or that a part shortage delays *software*.
- **Release and issue hubs (e.g., Jira and release dashboards).** These are strong at tickets, owners and code status. They don't know about stock, deliveries or substitutes, so they can't explain why testing started late or what a supplier slip will do.
- **Spreadsheets in between.** This is what fills the gap today: copied numbers, manual joins, and a status that's stale by the next meeting.

### Why joining both sides matters
The costly problems sit **between** the two systems. A parts delay → fewer test boards → late testing → tickets found later → a late software date is one chain, but it crosses two tools and three owners. A substitute part saves the supply side but adds driver work to the software side. Moving stock fixes one launch and can break another. LaunchReady doesn't replace either system. It's the thin layer that joins them, so each trade-off is visible on both sides before someone commits to it. *(Assumption to validate: that the join, not the data in either system, is where most of the delay comes from.)*

---

## 4. Product manager specs

### MVP scope
**In:** one fictional TV maker; 16 models, 8 chipsets, 5 component teams, key parts per chipset; Launch, Software and Supply views with filters; a readiness verdict with reasons; three scenarios; a recovery workflow (simulated agent) that compares options and applies the approved one; human approval before anything is "done".

**Out of scope (for now):** live connections to Jira, ERP or supplier portals; login and roles; editing data in the app; full bills of materials (only key parts are modelled); cost and margin; multi-site production planning; transfer lead times between warehouses; capacity of test labs; the agent taking any action by itself.

### User stories and acceptance criteria
1. **As a launch manager, I want one verdict per model with reasons, so I can run go/no-go without chasing two teams.**
   - Every model shows Ready, At risk or Blocked, and every non-Ready verdict lists at least one reason with the numbers behind it.
   - The verdict is the worse of the software and supply verdicts.
2. **As a software lead, I want to see when my testing will really start, so I can warn early or ask for boards.**
   - Test start = latest of planned start, code complete + 3 days, and test boards available.
   - If boards are short, the view shows by how many days the start moved and why.
3. **As a planner, I want to know which builds a delivery covers, so I expedite the delay that actually matters.**
   - Supply is handed out in need-date order; no unit is given to two builds (tested).
   - Rejected deliveries and deliveries with no date are never counted; undated ones are flagged as "might help".
4. **As a launch manager, I want options checked before I commit, so a fix for one launch doesn't break another.**
   - Moving stock, using an approved substitute, or moving a date is recalculated with the same rules, and the effect on every model is shown.
   - The substitute option includes the driver-change time (1–14 days) and its owner team.
5. **As any user, I want the AI to do the legwork but not decide for me.**
   - The agent only uses the provided tools (no numbers from its own guesses), shows each step, and drafts messages; nothing is marked done until a person approves.

### Readiness rules (as built; thresholds in `data/config.json`)
| Side | Ready | At risk | Blocked |
|---|---|---|---|
| Software (per chipset, vs each model's launch) | Latest ready date ≥ 7 days before launch, no late code, no open critical tickets | Range crosses the 7-day buffer, or late code, or an open critical | Earliest ready date after launch, or date unknown (code with no date, boards not covered) |
| Supply (per model, incl. its chipset's test boards) | All parts covered on time by free stock or dated deliveries | Late test boards; production parts up to 7 days late; a delivery < 3 days before need; needs an approved substitute; relies on a delivery with no date | Parts missing, or production parts more than 7 days late |

Software ready range = the later of (test window + stabilisation tail) and (open ticket fix days ÷ team capacity). Fix days: critical 3–14, major 2–7, minor 1–3. Test window: 14 days, or 28 for a new chipset.

### Success measures (how they'd be measured in a real pilot)
| Measure | Target idea | How to measure |
|---|---|---|
| Time from "supplier slipped" to "impact known and owner assigned" | Days → same day | Timestamp of the delivery change vs the first approved plan in the activity log |
| Launch slips that were flagged At risk at least 3 weeks before | Most slips flagged early | Compare verdict history with actual launch dates |
| Hours per week rebuilding go/no-go status | Cut in half | Short survey of launch managers before and after |
| Verdicts users disagreed with | Low, and falling | "Disagree" button on a verdict, reviewed weekly |
| Double-allocated stock found at build time | Zero | Count of build-time shortages where stock was already promised elsewhere |

### Prioritised backlog
1. **Must:** live AI agent behind an approval step (Step 5 builds a recorded version); activity log export.
2. **Must:** Jira import of tickets and owners (read-only).
3. **Must:** ERP / supplier-portal import of stock, POs and delivery dates (read-only).
4. **Should:** a "what changed since yesterday" digest per owner.
5. **Should:** warehouse transfer lead times and test-lab capacity in the calculations.
6. **Should:** editable thresholds per product line.
7. **Could:** full BOM; cost of each option (expedite fees, substitute price).
8. **Could:** history of verdicts to measure early-warning accuracy.

### Roadmap
- **Now (this demo):** rules engine, three views, scenarios, what-if lab, recovery options with approval, simulated agent workflow.
- **Next:** live agent (Claude with the same tools) plus read-only imports from Jira and an ERP sandbox; a pilot with one product line.
- **Later:** two-way integrations (create Jira tickets, propose PO changes for approval), notifications to owners, verdict history and accuracy tracking, multi-site planning.

---

## 5. The AI agent

> **Status (Oct 2026):** the site shows a **simulated agent workflow**: scripted steps whose numbers, options and outcomes are calculated live by the tested code in `src/recovery.js`. The real agent code below exists but no runs have been recorded (no API key in the build environment).

### What it does
When something changes (a supplier slips, a shipment is rejected, a date disappears), the agent:
1. **Investigates both sides** with tools: the launch overview, a chipset's software status (submissions, tickets, test start), and a part's supply (stock, deliveries, who gets what).
2. **Weighs options** by simulating them: move stock from another program, use the approved substitute (with its driver-change time), or move the launch date. Each simulation reruns the full readiness logic, so it can see if a fix for one launch breaks another.
3. **Proposes a plan** with the impact chain, the options and their trade-offs, any remaining gap, the uncertainties, and draft messages to the owners.
4. **Waits for a human.** In the app, you approve the plan, assign owners and mark items done; every action goes in an activity log. Nothing is sent anywhere.

### How it's built
- `agent/tools.js`: 7 tools. Six are lookups and simulations that call the same `src/` logic as the app (tested in `tests/agent-tools.test.mjs`); the seventh, `propose_plan`, records the final plan in a fixed structure.
- `agent/run.mjs`: a plain agent loop. It sends the event and tools to Claude, runs each tool call in code, returns the result, and repeats until `propose_plan`. Each step is saved to `runs/<scenario>.json`.
- **Model:** Claude Sonnet 5.5 (Hemant's choice, for budget), with adaptive thinking (reasoning summaries are recorded) and medium effort.
- **If runs are recorded,** they must be labelled **"Real agent run, recorded during the build and replayed"** (a test enforces it). None are recorded yet; the app's Recovery tab is a simulated workflow instead.

### Why the agent can't make up numbers
The system prompt says every date, quantity and status must come from a tool result, and the tools do all the calculation. The agent's job is to decide *what to look at* and *how to explain the trade-offs*, not to do the maths. The plan schema asks for a remaining gap and uncertainties on every option, so they can't be left out.

### Limits
- **Not live.** The site has no server and no API key. Visitors see a simulated, scripted workflow over calculated results, never live AI output.
- **Only as good as its tools.** It can only consider options the tools can simulate (move stock, substitute, move date). It knows nothing about expediting cost, overtime or supplier negotiations.
- **The wording is the model's.** Numbers come from tools, but the summary and messages are written by the model. They're checked by a person before approval, not by code. A run can also miss an option, which is why a human approves.
- **One event at a time.** Each run handles one scenario; it doesn't keep memory across runs.
- **Fictional data.** It has never seen a real supplier, ticket or launch.

---

## 7. How the supply chain role relates to the problem

LaunchReady is a supply chain tool that happens to include software. Here's how each part maps to everyday supply chain work:

| Supply chain area | Where it shows up in LaunchReady |
|---|---|
| **Inventory management** | Stock by warehouse, with on-hand, already allocated and free shown separately. Only free stock can be promised, and each unit only once. |
| **Procurement** | Purchase orders (deliveries) with planned vs current dates, the supplier, and which program the PO was placed for. Rejected shipments drop out of supply. An approved second-source part (UC-310) is the classic dual-sourcing lever. |
| **Production planning** | Each model's first production build needs its parts 21 days before launch. Test boards are a small "pilot build" that comes first and gates everything after it. |
| **S&OP** | The launch view is a mini S&OP table: demand (launch plans and build quantities) against supply (stock and POs), with engineering readiness as a third constraint that most S&OP processes leave out. The scenarios are the "what if" part of an S&OP meeting. |
| **Exception management** | The tool shows only the exceptions that change a verdict, with the reason and the numbers. The agent turns an exception into options, owners and draft messages. That's the control-tower workflow: detect, diagnose, decide, act. |
| **Cost / service trade-offs** | Every option trades something off. Moving stock protects one launch and uses another program's safety margin. A substitute costs engineering time (1–14 days) and adds risk. Moving the date protects quality but costs revenue and the marketing plan. The tool makes the service side of each trade-off explicit. The cost side (expedite fees, substitute price, lost sales) is on the backlog. |

**Allocation policy.** Supply is handed out by need date, and a PO placed for a program is used for that program first. That's a deliberate policy choice (first-need-first-served with pegging). Real companies often allocate by margin or strategic priority instead. LaunchReady makes the policy visible and testable, so it can be argued about.

**My path.** At Samsung R&D I owned USB software readiness for 10+ TV launches across 10+ board variants. I saw how often "software isn't ready" really meant "we didn't have boards to test on". The M.S. in Supply Chain Analytics gave me the other half: inventory, procurement and S&OP. LaunchReady is what joining those two views looks like.

---

## 8. Gaps and open questions

Being honest about what this is and isn't:

- **Fictional data.** The company, models, chipsets, suppliers, tickets and quantities are made up. The patterns come from real experience, but no number here has been checked against a real launch. The baseline was deliberately set up so the three scenarios show clear effects.
- **No real integrations.** Nothing connects to Jira, an ERP or a supplier portal. In real life, getting clean, timely data out of those systems would be most of the work.
- **Data quality.** The tool trusts its inputs. Real delivery dates are often optimistic, tickets are mis-routed or duplicated, and "submitted" code isn't always complete. A real version would need data-freshness checks and a way to flag stale inputs.
- **Simplified model.** Key parts only, not a full BOM. Stock in any warehouse is assumed to be usable anywhere, with no transfer time. Team capacity is per chipset rather than shared across chipsets. Test labs have no capacity limit. Fix times are fixed ranges, not learned from history. Costs aren't modelled.
- **The rules are a choice.** The 7-day buffer, the fix-time ranges and the allocation order are reasonable defaults, not validated ones. Different teams would set them differently, and some verdicts would change.
- **Adoption.** A verdict only helps if people trust it and update their data. Teams that own Jira or the ERP may see this as another dashboard. Open question: who owns LaunchReady (launch management, supply chain or engineering)?
- **Agent reliability.** The agent's numbers come from tools, but its wording, choice of options and messages don't. A run can miss an option or frame a trade-off poorly. That's why every plan needs human approval, and why the site shows a clearly labelled simulation rather than claiming live reliability.
- **To validate with real users:** how often supply problems actually delay testing; how long it takes today from "supplier slipped" to "owner assigned"; whether launch managers would act on a computed verdict; which approval flow is acceptable for moving stock or dates; and whether the join between the two sides is really where the delay comes from.
