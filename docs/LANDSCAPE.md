# How large TV makers handle this today

*Public information only, checked October 2026. LaunchReady uses a fictional company and is not affiliated with any company named here. Large companies may well have internal tools that are not publicly described.*

## The question

When a component shipment slips, how does a large consumer-electronics maker find out which product launches are affected, and decide what to do? LaunchReady's claim is narrow: the link between **parts for test boards** and **software readiness** is the one that's easy to miss, because the two sides are planned in different systems.

## Samsung, as an example

**Supply chain planning is mature and centralised.**
- Samsung has run an integrated global supply chain management (SCM) system since the late 1990s or early 2000s; secondary sources disagree on the date. Case studies describe planning cycles shortened from monthly to weekly and daily. ([Scribd case study](https://www.scribd.com/document/246678944/Group1-Samsung-Electronics-SCM); secondary, unverified figures)
- A current Samsung Electronics job posting describes working with the central SCM team and the **Suwon GOC (global operations center)** to confirm S&OP plans and approve production exceptions, plus weekly supply allocation and prioritisation discussions. ([Glassdoor listing](https://www.glassdoor.com/job-listing/jv?jl=1010298535064))

**Its IT affiliate sells planning and control-tower software.**
- Samsung SDS's **Digital SCM** offers real-time scenario creation and fast re-planning on an in-memory engine; its **Nexprime SCM Response** is pitched on planning speed and comparing scenarios. ([Digital SCM](https://www.samsungsds.com/en/scm/scm.html), [Nexprime SCM Response](https://www.samsungsds.com/en/scm-response/response.html))
- Samsung SDS partnered with **o9 Solutions** in 2020 for S&OP and planning. ([o9 press release](https://o9solutions.com/news/o9-solutions-and-samsung-sds-enter-a-partnership-to-expand-scm-business))
- In April 2026 Samsung SDS held its Cello Square conference on "agentic AI supply chains": an automated **control tower** that integrates production, transport and inventory data in real time and uses AI agents to reach decisions, plus digital twins and total-cost decision making. ([Samsung SDS news](https://www.samsungsds.com/en/news/cello-260406.html), [Seoul Economic Daily](https://en.sedaily.com/technology/2026/04/02/samsung-sds-unveils-ai-powered-supply-chain-solutions-at)) No public detail was found on human approval steps.

**Software readiness is a separate world.** Public material on Samsung's TV software process covers app certification and compatibility testing for new models and Tizen versions ([Samsung developer docs](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html)), not how firmware readiness is tied to supply planning.

## The wider market

Supply chain planning suites (Kinaxis Maestro, o9, SAP IBP, Blue Yonder) offer what-if scenarios across supply and demand, and the direction in 2026 is "continuous response" and AI agents on top of a live plan. ([Logistics Viewpoints on Kinaxis](https://logisticsviewpoints.com/2026/10/01/kinaxis-concurrent-planning-continuous-response/), [Gartner category](https://www.gartner.com/reviews/market/supply-chain-planning-solutions)) PLM vendors note that BOM and PLM–ERP hand-offs are a common source of launch delays ([Arena](https://www.arenasolutions.com/white-papers/erp-and-plm/)). Software readiness is tracked in issue trackers such as Jira.

## Where LaunchReady fits

| | Supply planning suite / control tower | Issue tracker | LaunchReady |
|---|---|---|---|
| Plans parts supply and allocation | Yes, at scale | No | For launch builds |
| Tracks software bugs and code readiness | No | Yes | Reads it |
| Links late parts → test boards → software date | Not described publicly | No | Yes, per launch |
| Tests recovery options against every launch | Supply scenarios | No | Both sides together |
| Explains the risk in one plain sentence | Dashboards and alerts | No | Yes |

**Our view:**
1. **Not a replacement.** A company of this size already has strong supply planning. LaunchReady is a thin layer: read supply from the planning system and readiness from the issue tracker, then compute the launch verdict, the chain and the tested options.
2. **The gap is the join.** Public material describes supply, logistics and production control towers. We found no public description of a tool that ties a parts delay to the software test cycle and bug backlog for each launch. That join is what turns a "low priority" shipment into a missed launch.
3. **AI on top, not instead.** The industry is moving to AI agents that make supply decisions. LaunchReady's position is that the agent should investigate and explain, with every number coming from a deterministic, tested engine, and a person approving cross-team changes ([ADR 0002](adr/0002-deterministic-engine-ai-on-top.md)).

## Caveats

- Several sources are secondary (case studies, job postings, press coverage); figures from them are not verified.
- Vendor pages describe capabilities, not how any customer uses them.
- Some Samsung SDS pages could not be fetched directly during research; their content was taken from search results.
