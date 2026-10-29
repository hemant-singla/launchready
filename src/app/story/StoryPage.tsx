// The story page: the problem told through one launch, then the product.
// Every date and number on this page is computed by the same engine as the
// app (the USB delay scenario), so the story and the tool can't disagree.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ExternalLink, Mail, Moon, Sun, X } from 'lucide-react';
import { SCENARIOS } from '../../engine/scenarios';
import { computeAll } from '../../engine/compute';
import { recoveryOptions } from '../../engine/recovery';
import { explain } from '../../engine/lab';
import { initialDecisions } from '../../engine/decisions';
import { daysBetween } from '../../engine/dates';
import { BASE, BASELINE, encodeWorkspace } from '../state/workspace';
import { chainFor } from '../lib/chain';
import { date, num, partName, STATUS_LABEL } from '../lib/format';
import { optionName } from '../lib/options';
import { useTheme } from '../lib/theme';
import { StatusBadge } from '../components/ui';

const REPO = 'https://github.com/hemant-singla/launchready';
const usbLink = `#/app/launches?w=${encodeWorkspace({ scenarios: ['usbDelay'], lab: null, decisions: initialDecisions() })}`;

const SOURCES = [
  { label: 'Samsung SDS: Cello Square Conference 2026, "the era of agentic AI supply chains"', url: 'https://www.samsungsds.com/en/news/cello-260406.html' },
  { label: 'Seoul Economic Daily: Samsung SDS says AI agents will drive supply chain decisions (Apr 2026)', url: 'https://en.sedaily.com/technology/2026/04/02/samsung-sds-unveils-ai-powered-supply-chain-solutions-at' },
  { label: 'Samsung SDS: Digital SCM (scenario planning and fast re-planning)', url: 'https://www.samsungsds.com/en/scm/scm.html' },
  { label: 'Samsung SDS: Nexprime SCM Response (planning speed, scenario comparison)', url: 'https://www.samsungsds.com/en/scm-response/response.html' },
  { label: 'o9 Solutions and Samsung SDS partnership (2020)', url: 'https://o9solutions.com/news/o9-solutions-and-samsung-sds-enter-a-partnership-to-expand-scm-business' },
  { label: 'Samsung Electronics job posting: S&OP with central SCM and the Suwon GOC team', url: 'https://www.glassdoor.com/job-listing/jv?jl=1010298535064' },
  { label: 'Logistics Viewpoints: Kinaxis, from concurrent planning to continuous response (Oct 2026)', url: 'https://logisticsviewpoints.com/2026/10/01/kinaxis-concurrent-planning-continuous-response/' },
];

export default function StoryPage() {
  const [theme, toggleTheme] = useTheme();
  useEffect(() => {
    document.title = 'LaunchReady · when a supplier slips, which launches break?';
  }, []);

  const story = useMemo(() => {
    const usbData = SCENARIOS.usbDelay.apply(BASE);
    const usb = computeAll(usbData);
    const before = BASELINE.models.find((m) => m.id === 'HAL-77')!;
    const after = usb.models.find((m) => m.id === 'HAL-77')!;
    const delivery = usbData.deliveries.find((d) => d.id === 'DL-UC3-01')!;
    const original = BASE.deliveries.find((d) => d.id === 'DL-UC3-01')!;
    const rec = recoveryOptions(BASELINE, usbData);
    const steps = chainFor(after, usb, usbData, { m: before, r: BASELINE, data: BASE });
    const firstLaunch = [...BASE.models].sort((a, b) => a.launchDate.localeCompare(b.launchDate))[0];
    return { usbData, usb, before, after, delivery, original, rec, steps, firstLaunch };
  }, []);
  const { usbData, usb, before, after, delivery, original, rec, steps, firstLaunch } = story;
  const slip = daysBetween(delivery.eta!, original.eta!);
  const part = partName(BASE, delivery.part);
  const boards = usb.lines.find((l) => l.kind === 'test-boards' && l.chipset === after.chipset && l.part === delivery.part)!;

  return (
    <div className="story">
      <header className="story-nav">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
          <span className="brand-name">LaunchReady</span>
        </a>
        <span style={{ flex: 1 }} />
        <a className="btn ghost hide-sm" href={REPO} target="_blank" rel="noreferrer">Source <ExternalLink size={14} /></a>
        <button className="btn ghost icon" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <a className="btn primary" href="#/app/launches">Open the app</a>
      </header>

      <main>
        <section className="story-hero-wrap">
        <div className="story-hero">
          <p className="eyebrow">Launch risk for TV makers · a working prototype</p>
          <h1>A supplier slips by {slip} days. Which launches just broke?</h1>
          <p className="lede">
            A TV launch depends on two things tracked in different places: software that's ready, and parts to build the
            test boards and the TVs. LaunchReady joins them, so the knock-on effect of a late shipment shows up in
            minutes, with the ways to recover already tested.
          </p>
          <div className="cta-row">
            <a className="btn primary lg" href={usbLink}>See the delay in the app <ArrowRight size={16} /></a>
            <button className="btn lg" onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}>Read the story (3 min)</button>
          </div>
          <p className="fine">Fictional company (Northwind Vision) and data. Every number on this page is calculated by the app's tested engine.</p>
        </div>
        <HeroPreview />
        </section>

        <section className="story-section" id="story">
          <p className="eyebrow">Monday, 9:02</p>
          <h2>An email that looks routine</h2>
          <div className="story-grid two">
            <div className="prose">
              <p>
                Priya runs launches at Northwind Vision. Sixteen TV models ship over the next three months, on eight chip
                platforms. Her inbox has the usual supplier notice.
              </p>
              <p className="muted">
                It's {num(delivery.qty)} parts, and cheap ones. Procurement marks it normal priority and moves on. Nobody
                calls a meeting about {num(delivery.qty)} USB chips.
              </p>
            </div>
            <figure className="email card">
              <div className="email-head"><Mail size={16} /> <b>Northbay Components</b> <span className="faint">· 9:02</span></div>
              <div className="email-subject">PO {delivery.id}: revised ship date</div>
              <p>
                Due to a capacity constraint, {num(delivery.qty)} × {delivery.part} ({part}) will ship <b>{date(delivery.eta)}</b> instead
                of {date(original.eta)}.
              </p>
            </figure>
          </div>
        </section>

        <section className="story-section">
          <p className="eyebrow">Everyone sees part of it</p>
          <h2>Nobody is wrong. Nobody sees the chain.</h2>
          <div className="story-grid three">
            <Perspective who="Procurement" tool="ERP and supplier portal" sees={`One order late: ${num(delivery.qty)} × ${delivery.part}, low value. Normal priority.`} misses="That these chips are for test boards, and test boards gate the software." />
            <Perspective who={`${after.chipset} software lead`} tool="Issue tracker" sees={`Testing planned for ${date(before.eta.testStart)}. The bug backlog looks fine.`} misses={`That ${num(boards.lateQty)} of the ${num(boards.qty)} test boards won't exist until December.`} />
            <Perspective who="Launch manager" tool="Weekly status meeting" sees={`${after.name} launches ${date(after.launchDate)}. Status: on track.`} misses="That it stopped being on track at 9:02, and by how much." />
          </div>
        </section>

        <GuessSection answer={after.name} first={`${firstLaunch.name}`} firstHint={`launches first, ${date(firstLaunch.launchDate)}`} reason={explain(after, usb, usbData)} />

        <section className="story-section">
          <p className="eyebrow">The chain</p>
          <h2>How {num(delivery.qty)} chips move a January launch</h2>
          <p className="muted section-lede">
            {after.name} is on a new chip platform, so its software needs a long test cycle. Testing can't start without
            boards, and the boards need those chips. Follow the delay along:
          </p>
          <div className="chain story-chain">
            {steps.map((s, i) => (
              <div key={s.key} className={`chain-step ${s.status}${i === 0 ? ' first-break' : ''}`}>
                <div className="bar" />
                <div className="name">{s.name}</div>
                {s.was && <div className="was">{s.was}</div>}
                <div className="value">{s.value}</div>
                <div className="sub">{s.sub}</div>
              </div>
            ))}
          </div>
          <p className="callout">
            Result: {after.name} goes from <StatusBadge status={before.status} /> to <StatusBadge status={after.status} />. Its
            latest software date ({date(after.eta.late)}) now lands after the cutoff, one week before launch.
          </p>
        </section>

        <section className="story-section">
          <p className="eyebrow">Three ways out</p>
          <h2>Each option is tested against all 16 launches before it's shown</h2>
          <div className="story-grid three">
            {rec.options.map((o, i) => {
              const m = o.models.find((x) => x.id === after.id);
              return (
                <div className="card option" key={o.key}>
                  <div style={{ display: 'flex', gap: 6, minHeight: 22 }}>
                    {i === 0 && <span className="badge accent">Recommended</span>}
                    {o.restoredCount < o.models.length && <span className="badge at-risk">Partial fix</span>}
                  </div>
                  <h3>{optionName(o, usbData)}</h3>
                  <p className="muted">{o.tradeoffs[0]}</p>
                  <p className="result">
                    {after.name} becomes <b className={`status ${m?.after}`}>{STATUS_LABEL[m?.after ?? 'ready']}</b>
                  </p>
                  <p className="faint approver">Approved by: {o.approval.split(';')[0]}</p>
                </div>
              );
            })}
          </div>
          <p className="muted section-lede">
            Options that would quietly break another launch, like taking chips that another program needs sooner, are
            ruled out and listed with the reason. Nothing gets promised twice.
          </p>
        </section>

        <section className="story-section">
          <p className="eyebrow">Before and after</p>
          <h2>From "we'll know by Thursday" to an answer before the 10 o'clock meeting</h2>
          <div className="story-grid two">
            <div className="card compare">
              <h3>Today</h3>
              <ul>
                <li><X size={16} /> Procurement, software and launch status live in separate tools.</li>
                <li><X size={16} /> The link from late parts to late software is rebuilt by hand, in meetings.</li>
                <li><X size={16} /> Fixes are debated before anyone checks what they do to other launches.</li>
                <li><X size={16} /> Shared stock gets promised to two programs.</li>
              </ul>
            </div>
            <div className="card compare good">
              <h3>With LaunchReady</h3>
              <ul>
                <li><Check size={16} /> One status per launch, with the reason from whichever side is worse.</li>
                <li><Check size={16} /> The chain is computed, with the first broken link highlighted.</li>
                <li><Check size={16} /> Every recovery option is re-run against the whole plan before it's offered.</li>
                <li><Check size={16} /> Stock is allocated once, in need-date order; undated shipments never count.</li>
              </ul>
            </div>
          </div>
          <p className="fine">The "today" column describes a common pattern, not measured data from any company.</p>
        </section>

        <Landscape />

        <section className="story-section">
          <p className="eyebrow">Under the hood</p>
          <h2>Built like a product, not a mock-up</h2>
          <div className="story-grid three">
            <div className="card fact">
              <h3>Honest dates</h3>
              <p className="muted">Software readiness is a range, best case to worst case, from test windows, bug backlogs and team capacity. Missing inputs block the verdict instead of being guessed.</p>
            </div>
            <div className="card fact">
              <h3>No double counting</h3>
              <p className="muted">Parts are allocated once, in need-date order. Orders bought for a platform go to it first. Rejected or undated shipments never count as supply.</p>
            </div>
            <div className="card fact">
              <h3>Tested end to end</h3>
              <p className="muted">A typed TypeScript engine with unit tests for every rule, browser tests for the main flows, and CI on every change. The app state lives in the URL, so any view can be shared.</p>
            </div>
          </div>
          <p className="section-lede"><a href={REPO} target="_blank" rel="noreferrer">Read the code and architecture notes on GitHub <ExternalLink size={13} /></a></p>
        </section>

        <section className="story-section">
          <p className="eyebrow">What I'd validate next</p>
          <h2>The questions a real pilot has to answer</h2>
          <ol className="validate">
            <li><b>Time from "supplier slipped" to "impact known and owner assigned".</b> This is the key metric. Measure it today before claiming any improvement.</li>
            <li><b>How often a supply problem delays testing,</b> not just production. That decides how much the software link matters.</li>
            <li><b>Whether launch managers trust a computed status</b> over their own judgement, and where they need an override with a note.</li>
            <li><b>Who approves a cross-team plan:</b> moving stock between programs, a substitute part with driver work, or a date change.</li>
            <li><b>Integration:</b> read-only connectors to the planning system and the issue tracker first, with no new data entry.</li>
          </ol>
        </section>

        <section className="story-final">
          <h2>Try it on the working app</h2>
          <p className="muted">Open it with the USB delay already applied, approve a recovery, then press <span className="kbd">S</span> to try your own disruption.</p>
          <div className="cta-row" style={{ justifyContent: 'center' }}>
            <a className="btn primary lg" href={usbLink}>Open with the USB delay <ArrowRight size={16} /></a>
            <a className="btn lg" href="#/app/launches">Open the original plan</a>
          </div>
          <p className="fine">
            A portfolio project by <a href="https://hemant-singla.github.io" target="_blank" rel="noreferrer">Hemant Singla</a>.
            Fictional company and data. Not affiliated with any company named on this page.
          </p>
        </section>
      </main>
    </div>
  );
}

/** A live slice of the app: the launches table right after the USB delay. */
function HeroPreview() {
  const rows = useMemo(() => {
    const data = SCENARIOS.usbDelay.apply(BASE);
    const r = computeAll(data);
    const pick = ['HAL-77', 'LUM-65', 'ZEN-75', 'HAL-55'];
    return pick.map((id) => ({ now: r.models.find((m) => m.id === id)!, was: BASELINE.models.find((m) => m.id === id)! }));
  }, []);
  return (
    <a className="card hero-preview" href={usbLink} aria-label="Open this view in the app">
      <div className="hp-bar"><span /><span /><span /><b>Launches</b><span className="badge accent" style={{ marginLeft: 'auto' }}>What-if: USB delay</span></div>
      <table className="data">
        <thead><tr><th>Model</th><th>Launch</th><th>Status</th><th>Software ready</th></tr></thead>
        <tbody>
          {rows.map(({ now, was }) => (
            <tr key={now.id} className={now.status !== was.status ? 'changed' : undefined}>
              <td className="cell-title">{now.name}</td>
              <td className="num">{date(now.launchDate)}</td>
              <td><StatusBadge status={now.status} />{now.status !== was.status && <div className="cell-sub">was {STATUS_LABEL[was.status]}</div>}</td>
              <td className="num">{now.eta.known ? `${date(now.eta.early)} – ${date(now.eta.late)}` : 'unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </a>
  );
}

function Perspective({ who, tool, sees, misses }: { who: string; tool: string; sees: string; misses: string }) {
  return (
    <div className="card perspective">
      <div className="who">{who}</div>
      <div className="faint tool">{tool}</div>
      <p className="sees">"{sees}"</p>
      <p className="misses"><b>Can't see:</b> {misses}</p>
    </div>
  );
}

function GuessSection({ answer, first, firstHint, reason }: { answer: string; first: string; firstHint: string; reason: string }) {
  const choices = [
    { name: first, hint: firstHint },
    { name: 'Lumen 65"', hint: 'uses the same USB chip' },
    { name: answer, hint: 'launches last, in January' },
    { name: 'None of them', hint: "it's only 100 parts" },
  ];
  const [pick, setPick] = useState<string | null>(null);
  return (
    <section className="story-section">
      <p className="eyebrow">Your turn</p>
      <h2>Which launch is now at risk?</h2>
      <div className="guess" role="group" aria-label="Pick a launch">
        {choices.map((c) => (
          <button
            key={c.name}
            className={`card guess-choice${pick ? (c.name === answer ? ' right' : pick === c.name ? ' wrong' : '') : ''}`}
            onClick={() => setPick(c.name)}
            aria-pressed={pick === c.name}
            disabled={!!pick}
          >
            <b>{c.name}</b>
            <span className="faint">{c.hint}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {pick && (
          <p className="callout">
            {pick === answer ? 'Right. ' : `Not quite: it's ${answer}. `}
            {reason} Most people pick the launch that's soonest, or the one that shares the part. The risk is three steps away.
          </p>
        )}
      </div>
    </section>
  );
}

function Landscape() {
  const rows: [string, string, string, string][] = [
    ['Plans parts supply and allocation', 'Yes, at scale', 'No', 'For launch builds'],
    ['Tracks software bugs and code readiness', 'No', 'Yes', 'Reads it'],
    ['Links late parts → test boards → software date', 'Not described publicly', 'No', 'Yes, per launch'],
    ['Tests recovery options against every launch', 'Supply scenarios', 'No', 'Both sides together'],
    ['Explains the risk in one plain sentence', 'Dashboards and alerts', 'No', 'Yes'],
  ];
  return (
    <section className="story-section">
      <p className="eyebrow">How large TV makers handle this today</p>
      <h2>What already exists, and where the gap is</h2>
      <div className="story-grid two">
        <div className="prose">
          <h3 className="sub-h">Samsung, from public information</h3>
          <ul className="bullets">
            <li>Runs global supply chain management with weekly sales and operations planning (S&amp;OP), coordinated with a global operations center in Suwon, according to public job postings and case studies.</li>
            <li>Its IT affiliate Samsung SDS sells planning software (Digital SCM, Nexprime SCM Response) built around fast re-planning and comparing scenarios, and partners with o9 Solutions.</li>
            <li>In April 2026, Samsung SDS presented an AI "control tower" for logistics that joins production, transport and inventory data and is meant to make decisions with AI agents.</li>
          </ul>
          <p className="muted">
            Planning suites from Kinaxis, o9, SAP and Blue Yonder do similar what-if planning across supply and demand.
            Software teams track readiness separately, in issue trackers like Jira.
          </p>
        </div>
        <div className="prose">
          <h3 className="sub-h">The gap LaunchReady targets</h3>
          <p>
            The public material is about <b>supply, logistics and production</b>. I couldn't find a public description of a
            tool that ties a parts delay to <b>test boards, the software test cycle and the bug backlog</b> for each launch.
            That link is what turns a low-priority shipment into a missed launch.
          </p>
          <p className="muted">
            LaunchReady isn't a replacement for a planning suite. It's a thin layer on top: it reads supply from the planning
            system and readiness from the issue tracker, then computes the launch verdict, the chain and the tested options.
            Large companies may well have something like this internally; this comparison uses public information only.
          </p>
        </div>
      </div>
      <div className="card table-wrap" style={{ marginTop: 20 }}>
        <table className="data">
          <thead>
            <tr><th><span className="sr-only">Capability</span></th><th>Supply planning suite</th><th>Issue tracker</th><th>LaunchReady</th></tr>
          </thead>
          <tbody>
            {rows.map(([what, a, b, c]) => (
              <tr key={what}><td className="cell-title">{what}</td><td className="muted">{a}</td><td className="muted">{b}</td><td><b>{c}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="sources">
        <summary>Sources (public, checked October 2026)</summary>
        <ul>
          {SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
        </ul>
      </details>
    </section>
  );
}
