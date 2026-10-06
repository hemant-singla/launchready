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
