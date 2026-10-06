# Code walkthrough (5-minute version)

LaunchReady is a static website: HTML, CSS and plain JavaScript, with no server and no build step. The logic lives in `src/`. The website (`assets/app.js`) and the tests (`tests/`) both call the **same** functions, so the numbers on screen are the numbers the tests check.

## The data (`data/*.json`)
Generated once by `tools/generate-data.mjs` from hand-written tables (tickets come from a fixed random seed, so every run gives the same output). Key files:
- `models.json`: 16 TVs (line, size, chipset, launch date, first build quantity)
- `chipsets.json`: 8 chipsets; new or reused, test-board count, code deadline, test start
- `submissions.json` / `tickets.json`: each team's code submission and open tickets per chipset
- `stock.json`, `deliveries.json`, `bom.json`, `substitutes.json`: the supply side
- `config.json`: every threshold (7-day buffer, fix-time ranges, test windows). Change a rule here, not in code.

## The logic (`src/`)
1. **`supply.js` → `allocate()`**: lists every demand line (test boards per chipset, production per model, one line per part), sorts by need date, and hands out supply in that order. Each source tracks `remaining`, so a unit can only be given once (no double allocation). Rejected and undated deliveries are never counted; undated ones are reported as "might help". A second pass looks for approved substitutes in the stock that's left over.
2. **`software.js` → `softwareEta()`**: test start = latest of (planned start, code complete + 3 days, test boards ready). Ready date range = test window + stabilisation tail, or ticket backlog ÷ team capacity, whichever is later. Optimistic and pessimistic ends give the range.
3. **`engine.js` → `computeAll()`**: joins the two. The test-board dates from supply feed into the software ETA, which is how a parts delay becomes a software delay. Each model's verdict is the worse of software and supply.
4. **`substitute.js`**: "if we use the approved substitute, does the driver change still fit?" It reruns `computeAll` with and without the substitute and compares.
5. **`scenarios.js`**: the three demo scenarios, plus `reassignDelivery` and `moveLaunch` edits. Each returns a new copy of the data, so Reset just goes back to the original.
6. **`lab.js`**: powers the what-if lab on the start page. `applyLab()` applies the user's edits (shift, reject or un-date one shipment; move one launch). `knockOn()` compares the result with today's and lists what changed in order: parts → testing → software → launch. `mainReason()` picks the one reason that decides a model's verdict.
7. **`recovery.js`**: `recoveryOptions()` finds what got worse versus the original plan (`affectedBy`), generates only eligible actions (re-peg a purchase order of the same part, approved substitute, later launch), tests each with `computeAll`, drops those that don't help or hurt another launch, ranks the rest, and writes an escalation note when nothing fully resolves it. `applyActions()` applies approved actions to a copy of the data.
8. **`demo.js`**: approve / reject / reset as pure functions. Approving adds the action; rejecting only logs it.

## The page (`index.html`, `assets/`)
- **`app.js`**: one function per view turns the computed result into HTML. The lab's controls are built once; moving a slider only recomputes and updates the outputs, so it stays smooth. Lab edits flow into every view, so the Launch, Software and Supply tabs show the same what-if.
- **`agent.js`**: the Recovery tab, a *simulated* agent workflow in six steps. Wording is scripted; every table and option comes from `recovery.js`. Approve calls back into `app.js`, which recomputes every view.
- **`tour.js`**: the skippable 60-second tour (a small non-modal card; Esc or Skip ends it).
- **`timeline.js`**: the launch chart as SVG. Dragging a launch diamond (or pressing ← / → on a row) previews the verdict for the new date using the engine, then applies it as the lab's "move a launch" edit on release.

## How to explain it in an interview
"Software readiness and supply are usually planned in separate tools. I modelled the link between them: test boards need parts, so a parts delay pushes testing, which pushes the software date. The verdicts are rule-based and fully explainable. Every status comes with the reason and the numbers behind it, and every rule has a test, including the three scenarios."

## Run it
```
npm test                    # 32 tests, Node 20+ (no installs)
python3 -m http.server      # then open http://localhost:8000
node tools/generate-data.mjs && node tools/data-overview.mjs   # rebuild data + docs/DATA.md
```
