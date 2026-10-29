# Code walkthrough (5-minute version)

LaunchReady is a React + TypeScript app over a pure engine. The engine (`src/engine`) computes every verdict; the app (`src/app`), the unit tests (`tests/`) and the AI agent tools (`src/agent`) all call the **same** functions, so the numbers on screen are the numbers the tests check. Architecture and trade-offs: [ARCHITECTURE.md](ARCHITECTURE.md).

## The data (`data/*.json`)
Generated once by `npm run data:generate` (`scripts/generate-data.mjs`) from hand-written tables; tickets come from a fixed random seed, so every run gives the same output.
- `models.json`: 16 TVs (line, size, chip platform, launch date, first build quantity)
- `chipsets.json`: 8 platforms; new or reused, test-board count, code deadline, test start
- `submissions.json` / `tickets.json`: each team's code submission and tickets per platform
- `stock.json`, `deliveries.json`, `bom.json`, `substitutes.json`: the supply side
- `config.json`: every threshold (7-day buffer, fix-time ranges, test windows). Change a rule here, not in code.

## The engine (`src/engine`)
1. **`supply.ts` → `allocate()`**: lists every demand line, sorts by need date, and hands out supply in that order. Each source tracks `remaining`, so a unit is given once. Rejected and undated deliveries never count. A second pass looks for approved substitutes in what's left.
2. **`software.ts` → `softwareEta()`**: test start = latest of (planned start, code complete + 3 days, test boards ready). Ready range = the later of the test cycle and the ticket backlog ÷ team capacity, at both ends.
3. **`compute.ts` → `computeAll()`**: joins the two. Test-board dates from supply feed the software ETA: that's how a parts delay becomes a software delay. Each launch's status is the worse side.
4. **`recovery.ts` → `recoveryOptions()`**: what got worse vs the original plan, the eligible actions, each tested with `computeAll` on a copy, filtered and ranked, plus an escalation note when nothing fully fixes it.
5. **`lab.ts`**: what-if edits, the knock-on trail, and `explain()`, which writes one plain sentence per launch from computed values.
6. **`scenarios.ts`, `decisions.ts`, `substitute.ts`**: preset disruptions, approve/reject/undo as pure functions, and the substitute check.

## The app (`src/app`)
- **`state/`**: the workspace (disruptions + approved actions + log) as a reducer. The shareable part is encoded in the URL, so links reopen the same view. Results are derived with `useMemo`; the recovery search is lazy and cached.
- **`pages/`**: Launches (table + drawer with the dependency chain), Timeline (SVG Gantt), Recovery (option cards), Supply, Software, Activity.
- **`components/`**: sidebar, ⌘K command palette, Simulate dialog with a live preview, drawer and dialog with focus handling, toasts with Undo.
- **`lib/`**: hash router, plain-language labels (`mainRisk`, `optionName`), the five-step chain (`chain.ts`), theme.
- **`story/`**: the start page; every number on it comes from the engine.

## How to explain it in an interview
"Software readiness and supply are planned in separate tools. I modelled the link between them: test boards need parts, so a parts delay pushes testing, which pushes the software date. The engine is pure TypeScript and fully tested; the UI, the tests and an AI agent's tools all call it, so nothing on screen is made up. Recovery options are tested against every launch before they're shown, and a person approves them."

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + 32 unit tests
npm run test:e2e   # browser tests
```
