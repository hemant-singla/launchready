// Free mode: answers common questions without an AI model.
//
// It recognises what the question is about (a launch, platform, part or
// shipment) and what is being asked (why, what if, how to recover, who acts,
// how it works), runs the same tools the AI assistant uses, and writes the
// answer from their results. Deterministic, instant, no API key, no cost.
// Questions it can't place get a short help message instead of a guess.
import type { Dataset, Model, Status } from '../engine/types';
import { fmtDate } from '../engine/dates';
import { runAssistantTool, type AgentContext, type ToolOutcome } from './runAssistantTool';

export interface OfflineStep { id: string; name: string; input: Record<string, unknown>; outcome: ToolOutcome }
export interface OfflineAnswer { steps: OfflineStep[]; text: string }

// Shapes of the tool results this module reads (see runAssistantTool.ts).
type Range = { earliest: string; latest: string } | 'unknown';
interface LaunchRow {
  launch_id: string; name: string; platform: string; launch_date: string; status: Status; original_status: Status;
  software_ready: Range; software_cutoff: string; buffer_days_before_cutoff: number | null; main_risk: string | null; owner: string | null;
}
interface Overview { active_disruptions: string[]; counts_now: { ready: number; at_risk: number; blocked: number }; launches_worse_than_plan: string[]; launches: LaunchRow[] }
interface ChainStep { step: string; status: Status; value: string; detail: string; original_value?: string }
interface LaunchDetails extends LaunchRow { explanation: string; chain: ChainStep[]; software_findings: string[]; supply_findings: string[] }
interface OptionResult { launch_id: string; name: string; status_now: Status; status_after: Status; back_to_plan: boolean }
interface RecoveryOption { option_key: string; kind: string; action: string; trade_offs: string[]; approval: string; launch_date_change_days: number; results: OptionResult[]; still_open: string[] }
interface Recovery { launches_needing_recovery: string[]; options_ranked?: RecoveryOption[]; recommended?: string | null; ruled_out?: { action: string; why: string }[]; escalation?: string | null; note?: string }
interface WhatIf { what_if: string; launches_changed: { launch_id: string; name: string; status_now: Status; status_after: Status; software_ready_after: Range; explanation_after: string }[] }
interface Platform { platform: string; new_platform: boolean; testing_started: string | null; computed_test_start: string | null; planned_test_start: string; testing_days_late: number | null; software_ready: Range; launches: { name: string; launch_date: string; status: Status }[]; teams: { team: string; code: { submitted?: string; expected?: string | null; due?: string } | null; team_note?: { text: string; on: string }; open_tickets: { critical: number; major: number; minor: number } }[]; critical_tickets: { id: string; team: string; title: string; age_days: number }[] }
interface PartSupply { part_id: string; name: string; stock: { free: number }[]; shipments: { shipment_id: string; qty: number; planned: string | null; current: string | null; status: string; bought_for: string }[]; builds_in_need_order: { build: string; needed_by: string; qty: number; status: Status; short: number }[] }
interface Rules { software: string; cutoff: string; supply: string; launch: string; recovery: string }
type FixDate = { fixBy: string; confidence: 'committed' | 'estimate' } | 'no date yet' | { fixed_on: string };
interface IssueRow { issue_id: string; title: string; platform: string; team: string; severity: string; source: string; tvs_reporting?: number; stage: string; age_days?: number; latest_comment?: { at: string; by: string; text: string }; fix_date: FixDate }
interface IssueSearch { matches: number; issues: IssueRow[] }
interface Issue {
  issue_id: string; title: string; platform: string; team: string; component: string; severity: string; stage: string; opened: string; source: string;
  customer_report?: { units: number; devices: string; firmware: string; quote: string };
  found_by_test?: { suite: string; failed_step: string; run?: string };
  log_line_matched?: string; routing?: { signature: string; rule: string };
  timeline?: { at: string; by: string; text: string }[];
  fix_date: { fixBy: string; confidence: string } | string | null; verification_days: [number, number];
  platform_software_ready: Range; launches_on_platform: { name: string; launch_date: string; status: Status }[];
}
interface Lab { last_7_days: { hours_tested: number; runs_finished: number; pass_rate_pct: number | null; new_issues: number }; running_now: number; platforms_in_testing: string[]; suites: { suite: string; pass_rate_pct: number | null; issues_found: number }[]; latest_failures: { suite: string; platform: string; date: string; failed_step: string | null; issue?: string }[] }
interface Shipment { shipment_id: string; part: string; qty: number; status: string; planned_arrival: string | null; current_arrival: string | null; latest_update?: { at: string; text: string } | null; tracking?: { date: string; text: string; planned: boolean }[]; inspection?: { result: string; failed: number; sampled: number; reason?: string }; supplier?: { name: string; on_time_rate_pct?: number; avg_delay_days?: number; latest_note?: string }; feeds: { build: string; qty: number; needed_by: string; status: Status }[] }

const LABEL: Record<Status, string> = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const d = (iso: string | null | undefined) => fmtDate(iso, true);
const range = (r: Range) => (r === 'unknown' ? 'unknown' : `${d(r.earliest)}–${d(r.latest)}`);
const pretty = (t: string) => t.replace(/\d{4}-\d{2}-\d{2}/g, (x) => d(x));

// ---------- understanding the question ----------

const PART_WORDS: [RegExp, string][] = [
  [/usb\s*3\.?0|uc-?200/, 'UC-200'],
  [/usb\s*3\.?2.*(alt|substitute)|uc-?310/, 'UC-310'],
  [/usb|uc-?300/, 'UC-300'],
  [/wi-?fi\s*5|wm-?5/, 'WM-5'],
  [/wi-?fi|wm-?6/, 'WM-6'],
  [/mini-?\s?led|mld/, 'MLD-2'],
  [/oled timing|tcon-?oled/, 'TCON-OLED'],
  [/4k timing|tcon-?4k/, 'TCON-4K'],
  [/amplifier|audio amp|amp-?20/, 'AMP-20'],
];

function launchesIn(q: string, data: Dataset): Model[] {
  const byId = data.models.filter((m) => q.includes(m.id.toLowerCase()));
  if (byId.length) return byId;
  const sizes = [...q.matchAll(/\b(43|50|55|65|75|77|85)\b/g)].map((m) => Number(m[1]));
  const out: Model[] = [];
  for (const line of new Set(data.models.map((m) => m.line))) {
    if (!q.includes(line.toLowerCase())) continue;
    const mine = data.models.filter((m) => m.line === line);
    const sized = mine.filter((m) => sizes.includes(m.size));
    out.push(...(sized.length ? sized : mine));
  }
  return out;
}

function platformIn(q: string, data: Dataset): string | undefined {
  return data.chipsets.find((c) => q.includes(c.id.toLowerCase()))?.id;
}

function partIn(q: string, data: Dataset): string | undefined {
  const named = data.parts.find((p) => q.includes(p.name.toLowerCase()) || q.includes(p.id.toLowerCase()));
  if (named && !named.id.startsWith('SOC-')) return named.id;
  for (const [re, id] of PART_WORDS) if (re.test(q)) return id;
  const plat = platformIn(q, data);
  if (plat && /\b(soc|chip)\b/.test(q)) return `SOC-${plat.replace('-', '')}`;
  return named?.id;
}

/** Days from "5 weeks", "10 days", "a month", "2 weeks early". */
function daysIn(q: string): number | undefined {
  const m = q.match(/(\d+)\s*(week|wk|day|month)s?/);
  const n = m ? Number(m[1]) * (m[2].startsWith('w') ? 7 : m[2] === 'month' ? 30 : 1) : /\ba (week|month)\b/.test(q) ? (q.includes('month') ? 30 : 7) : undefined;
  return n === undefined ? undefined : /\bearl(y|ier)\b/.test(q) ? -n : n;
}

// ---------- answering ----------

export function answerOffline(question: string, ctx: AgentContext): OfflineAnswer {
  const q = question.toLowerCase().replace(/[“”″]/g, '"');
  const steps: OfflineStep[] = [];
  const call = <T>(name: string, input: Record<string, unknown> = {}): T => {
    const outcome = runAssistantTool(name, input, ctx);
    steps.push({ id: `offline-${steps.length + 1}`, name, input, outcome });
    return outcome.result as T;
  };
  const data = ctx.base;
  const launches = launchesIn(q, data);
  const platform = platformIn(q, data);
  const part = partIn(q, data);
  const shipmentId = q.match(/dl-[a-z0-9-]+/)?.[0]?.toUpperCase();
  const issueId = q.match(/nwv-\d+/)?.[0]?.toUpperCase();

  const has = (re: RegExp) => re.test(q);
  const text = (() => {
    if (has(/^(hi|hello|hey)\b|what can you|help\b|how do i use/)) return help();
    if (issueId) return issueAnswer(issueId);
    if (shipmentId && !has(/what if|suppose|simulate|reject|fail|lose|lost|\d+\s*(week|day)/)) return shipmentAnswer(shipmentId);
    if (has(/test lab|testing|pass rate|test runs?|suites?|24\/7/) && !has(/when .*test(ing)? start/)) return testLab();
    if (has(/\bcode\b|submission|code push|merge/) && has(/late|why|behind|not (in|submitted)|missing/)) return lateCode();
    if (has(/\b(bugs?|issues?|tickets?|defects?)\b|when .*fix|fix date|\beta\b|latest on|latest comment|update on/)) return issues();
    if (has(/\b(how|why)\b.*\b(calculat|work|decid|determin)|\brules?\b|cutoff|\bbuffer\b|threshold|formula/)) return rules(call<Rules>('explain_rules'), q);
    if ((part || shipmentId) && has(/what if|what happens if|simulate|suppose|\blate\b|delay|slip|reject|fail|inspection|lose|lost|no date|withdraw|early/)) return whatIf();
    if (has(/what if|what happens if|simulate|suppose/) && !has(/do nothing|nothing is done|we wait|ignore/)) return whatIfHelp();
    if (has(/recover|\bfix|option|recommend|best way|solution|solve|mitigat|approve|what can (we|i) do/)) return recovery();
    if (has(/do nothing|nothing is done|if we wait|ignore it|no action/)) return doNothing();
    if (has(/\bwho\b|\bteams?\b|owner|responsib|\bact\b|by when/)) return owners();
    if (launches.length) return launchDetails();
    if (platform) return platformSummary(platform);
    if (part) return partSummary(part);
    if (has(/attention|at risk|status|overview|which launch|summary|blocked|ready|plan|launches/)) return overview();
    return help(true);
  })();
  return { steps, text };

  // --- answers ---

  function fixText(f: FixDate | Issue['fix_date']): string {
    if (!f || typeof f === 'string') return 'no date yet';
    if ('fixed_on' in f) return `fixed ${d(f.fixed_on as string)}`;
    return `${f.confidence === 'committed' ? 'fix committed for' : 'fix estimated'} ${d(f.fixBy)}`;
  }

  function issueAnswer(id: string): string {
    const i = call<Issue | { error: string }>('get_issue', { issue_id: id });
    if ('error' in i) return `I couldn't find ${id}. Try "open issues on Rhine-M" to list them.`;
    const last = i.timeline?.at(-1);
    return [
      `**${i.issue_id}: ${i.title}** (${i.severity}, ${i.stage}). With the ${i.team} team, ${i.platform} platform, opened ${d(i.opened)}.`,
      i.customer_report ? `**From customers:** ${i.customer_report.units.toLocaleString('en-US')} TVs reported it (${i.customer_report.devices}, ${i.customer_report.firmware}): "${i.customer_report.quote}"` : i.found_by_test ? `**Found by the test lab:** ${i.found_by_test.suite} failed at "${i.found_by_test.failed_step}".` : '',
      i.routing ? `**Routed** by the log signature \`${i.routing.signature}\` (${i.routing.rule}).` : '',
      last ? `**Latest (${last.by}, ${d(last.at)}):** ${pretty(last.text)}` : '',
      `**Fix date:** ${fixText(i.fix_date)}${typeof i.fix_date === 'object' && i.fix_date ? `, then ${i.verification_days.join('–')} days of test lab verification` : ''}. ${i.platform} software is ready ${range(i.platform_software_ready)}; launches on it: ${i.launches_on_platform.map((l) => `${l.name} (${d(l.launch_date)}, ${LABEL[l.status]})`).join(', ')}.`,
    ].filter(Boolean).join('\n\n');
  }

  function issues(): string {
    const words = q.replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['when', 'will', 'the', 'fix', 'fixed', 'date', 'latest', 'issue', 'issues', 'bug', 'bugs', 'ticket', 'tickets', 'open', 'what', 'are', 'there', 'any', 'for', 'with', 'about', 'update', 'comment', 'comments', 'status', 'from', 'customers', 'customer', 'test', 'lab', 'which', 'all', 'show', 'list', 'eta', 'and', 'how', 'many', 'be', 'on', 'is', 'critical', 'major', 'minor'].includes(w) && !data.chipsets.some((c) => c.id.toLowerCase() === w) && !data.models.some((m) => m.line.toLowerCase() === w));
    const input = {
      query: words.join(' '),
      platform: platform ?? (launches[0]?.chipset ?? ''),
      team: data.teams.find((t) => q.includes(t.id.toLowerCase()))?.id ?? '',
      source: has(/customer|users?|homes?|field/) ? 'customer' : has(/test lab/) ? 'test-lab' : 'any',
      // "when will it be fixed" asks about open issues; "fixed/closed issues" about done ones.
      state: has(/\b(closed|resolved|already fixed|were fixed|was fixed|fixed (issues|bugs|tickets))\b/) ? 'fixed' : 'open',
    };
    let r = call<IssueSearch>('search_issues', input);
    if (!r.matches && input.query) r = call<IssueSearch>('search_issues', { ...input, query: '' });
    if (!r.matches) return 'No issues match that. Try "open issues on Rhine-M" or "customer issues".';
    const crit = has(/critical/) ? r.issues.filter((x) => x.severity === 'critical') : r.issues;
    const list = (crit.length ? crit : r.issues).slice(0, 6);
    const scope = [input.platform, input.team && `${input.team} team`, input.source !== 'any' && (input.source === 'customer' ? 'from customers' : 'from the test lab')].filter(Boolean).join(', ');
    return [
      `**${r.matches} ${input.state} issue${r.matches === 1 ? '' : 's'}${scope ? ` (${scope})` : ''}${input.query ? ` matching "${input.query}"` : ''}.** ${list.length < r.matches ? `Most severe ${list.length}:` : ''}`,
      list.map((x) => `- **${x.issue_id}** ${x.title} (${x.severity}, ${x.team}, ${x.platform}${x.tvs_reporting ? `, ${x.tvs_reporting.toLocaleString('en-US')} TVs reporting` : ''}): ${fixText(x.fix_date)}.${x.latest_comment ? ` Latest from ${x.latest_comment.by}: "${pretty(x.latest_comment.text)}"` : ''}`).join('\n'),
      'Committed fix dates (plus 1–3 days of verification) feed the software-ready date; issues without one count at their standard fix time. Ask about an id (e.g. "NWV-4211") for the full story.',
    ].join('\n\n');
  }

  function testLab(): string {
    const l = call<Lab>('get_test_lab_summary', { platform: platform ?? '' });
    if ('error' in (l as object)) return `${platform} isn't in testing yet, so there are no test runs. Testing runs on ${data.chipsets.filter((c) => c.testStartedOn).map((c) => c.id).join(', ')}.`;
    const worst = [...l.suites].filter((x) => x.pass_rate_pct !== null).sort((a, b) => (a.pass_rate_pct ?? 0) - (b.pass_rate_pct ?? 0))[0];
    return [
      `**Test lab${platform ? ` (${platform})` : ''}, last 7 days:** ${l.last_7_days.hours_tested.toLocaleString('en-US')} hours tested, ${l.last_7_days.runs_finished} runs finished, ${l.last_7_days.pass_rate_pct}% passed, ${l.last_7_days.new_issues} new issues. ${l.running_now} runs going now on ${l.platforms_in_testing.join(', ')}.`,
      worst ? `Hardest suite: **${worst.suite}** (${worst.pass_rate_pct}% pass, ${worst.issues_found} issues found).` : '',
      `Latest failures:\n\n${l.latest_failures.slice(0, 4).map((f) => `- ${f.suite} on ${f.platform}, ${d(f.date)}: failed at "${f.failed_step}"${f.issue ? ` → ${f.issue}` : ''}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');
  }

  function shipmentAnswer(id: string): string {
    const s = call<Shipment | { error: string }>('get_shipment', { shipment_id: id });
    if ('error' in s) return `I couldn't find shipment ${id}. Try "find usb shipments".`;
    const next = s.tracking?.find((e) => e.planned);
    return [
      `**${s.shipment_id}: ${s.qty.toLocaleString('en-US')} × ${s.part}** is ${s.status}: ${s.current_arrival ? `arriving ${d(s.current_arrival)}` : 'no confirmed date'}${s.planned_arrival && s.current_arrival && s.planned_arrival !== s.current_arrival ? ` (planned ${d(s.planned_arrival)})` : ''}.`,
      s.latest_update ? `**Latest (${d(s.latest_update.at)}):** ${s.latest_update.text}` : '',
      next ? `Next step: ${next.text} on ${d(next.date)}.` : '',
      s.inspection ? `Inspection: ${s.inspection.result}${s.inspection.failed ? ` (${s.inspection.failed} of ${s.inspection.sampled} failed${s.inspection.reason ? `, ${s.inspection.reason}` : ''})` : ''}.` : '',
      s.feeds.length ? `Feeds: ${s.feeds.map((f) => `${f.build} (${f.qty.toLocaleString('en-US')} by ${d(f.needed_by)}, ${LABEL[f.status]})`).join('; ')}.` : 'It isn\'t counted as supply for any build.',
      s.supplier ? `Supplier ${s.supplier.name.replace(' (fictional)', '')}: ${s.supplier.on_time_rate_pct}% on time over 12 months, late ones average ${s.supplier.avg_delay_days} days. ${s.supplier.latest_note ?? ''}` : '',
    ].filter(Boolean).join('\n\n');
  }

  function lateCode(): string {
    const late = data.submissions.filter((sub) => !sub.submittedOn && (sub.expectedOn ?? '') > sub.dueDate);
    const plats = [...new Set(late.map((x) => x.chipset))].filter((c) => !platform || c === platform);
    if (!plats.length) return platform ? `No team is late with ${platform} code.` : 'No team is late with its code right now.';
    const lines: string[] = [];
    for (const c of plats) {
      const p = call<Platform>('get_platform_software', { platform: c });
      for (const t of p.teams.filter((x) => x.code?.expected && x.code.due && x.code.expected > x.code.due)) {
        lines.push(`- **${t.team} code for ${c}**: due ${d(t.code?.due)}, now expected ${d(t.code?.expected)}.${t.team_note ? ` The team says (${d(t.team_note.on)}): "${t.team_note.text}"` : ''} Affects ${p.launches.map((l) => l.name).join(', ')}.`);
      }
    }
    return ['Code pushes that are late:', lines.join('\n'), 'Testing on a platform can only start once every team\'s code is in, so a late push moves the test start and the software-ready date.'].join('\n\n');
  }

  function overview(): string {
    const o = call<Overview>('get_plan_overview');
    const attention = o.launches.filter((l) => l.status !== 'ready');
    const head = `**${o.counts_now.ready} of ${o.launches.length} launches are on track**; ${attention.length ? `${attention.length} need attention` : 'none need attention'}.`;
    const ctxLine = o.active_disruptions.length ? `\n\nWith the current what-if: ${o.active_disruptions.join('; ')}` : '';
    const rows = attention.map((l) => `- **${l.name}** (${d(l.launch_date)}): ${LABEL[l.status]}${l.original_status !== l.status ? `, was ${LABEL[l.original_status]}` : ''}. ${l.main_risk ?? ''}${l.owner ? `; owner: ${l.owner}` : ''}.`);
    const worse = o.launches_worse_than_plan.length ? `\n\nWorse than the original plan: ${o.launches_worse_than_plan.map((id) => o.launches.find((l) => l.launch_id === id)?.name).join(', ')}. Ask "how do we recover?" for options.` : '';
    return `${head}${ctxLine}\n\n${rows.join('\n')}${worse}`;
  }

  function launchDetails(): string {
    return launches.slice(0, 3).map((m) => {
      const l = call<LaunchDetails>('get_launch_details', { launch_id: m.id });
      const breakAt = l.chain.find((s) => s.status !== 'ready');
      const chain = l.chain.map((s) => `${s.status === 'ready' ? '✓' : '!'} ${s.step}: ${s.value}${s.original_value ? ` (was ${s.original_value})` : ''}`).join('\n- ');
      const findings = [...l.software_findings, ...l.supply_findings].slice(0, 4).map((f) => `- ${pretty(f)}`).join('\n');
      return [
        `**${l.name}: ${LABEL[l.status]}.** ${l.explanation}`,
        breakAt ? `The chain breaks at **${breakAt.step.toLowerCase()}**:\n\n- ${chain}` : `Every step is on track:\n\n- ${chain}`,
        findings ? `Findings:\n\n${findings}` : '',
      ].filter(Boolean).join('\n\n');
    }).join('\n\n---\n\n');
  }

  function recovery(): string {
    const r = call<Recovery>('get_recovery_options');
    if (!r.options_ranked) {
      return `${r.note ?? 'Nothing to recover.'} Recovery options appear once a disruption makes a launch worse than the plan. Try "what if the USB 3.2 controller shipment is 5 weeks late?", or press S to simulate one.`;
    }
    const names = r.launches_needing_recovery.map((id) => data.models.find((m) => m.id === id)?.name).join(', ');
    if (!r.options_ranked.length) return `No tested action fixes ${names}. ${r.escalation ?? ''}`;
    const lines = r.options_ranked.map((o, i) => {
      const result = o.results.map((x) => `${x.name} → ${LABEL[x.status_after]}`).join(', ');
      const partial = o.results.some((x) => !x.back_to_plan);
      return `${i + 1}. **${o.action}**${o.option_key === r.recommended ? ' (recommended)' : partial ? ' (partial fix)' : ''}: ${result}. Trade-off: ${o.trade_offs[0]}. Approval: ${o.approval.split(';')[0]}.`;
    });
    const best = r.options_ranked.find((o) => o.option_key === r.recommended);
    if (best) call('propose_recovery', { option_key: best.option_key });
    return [
      `**${names}** ${r.launches_needing_recovery.length === 1 ? 'needs' : 'need'} recovery. Each option below was applied to the plan and recalculated against every launch:`,
      lines.join('\n'),
      r.ruled_out?.length ? `Ruled out: ${r.ruled_out.map((x) => `${x.action} (${x.why.replace(/^Not offered: /, '').replace(/\.$/, '')})`).join('; ')}.` : '',
      r.escalation ?? '',
      best ? 'I recommend the first option. Approve it below to apply it; nothing changes until you click.' : '',
    ].filter(Boolean).join('\n\n');
  }

  function doNothing(): string {
    const o = call<Overview>('get_plan_overview');
    const hit = o.launches.filter((l) => o.launches_worse_than_plan.includes(l.launch_id));
    const list = hit.length ? hit : o.launches.filter((l) => l.status !== 'ready');
    if (!list.length) return 'Every launch is on track, so doing nothing keeps the plan as it is.';
    return [
      hit.length ? 'If nothing changes, these launches stay worse than the plan:' : 'Nothing is disrupted, but these launches already need attention:',
      list.map((l) => `- **${l.name}** stays ${LABEL[l.status].toLowerCase()} for ${d(l.launch_date)}: software ready ${range(l.software_ready)} against the ${d(l.software_cutoff)} cutoff${l.buffer_days_before_cutoff !== null && l.buffer_days_before_cutoff < 0 ? ` (${-l.buffer_days_before_cutoff} days late)` : ''}. ${l.main_risk ?? ''}.`).join('\n'),
      'The risk is the latest software date: if every fix takes its longest, the launch slips or ships without the full test cycle. Ask "how do we recover?" to see tested options.',
    ].join('\n\n');
  }

  function owners(): string {
    const o = call<Overview>('get_plan_overview');
    const list = o.launches.filter((l) => l.status !== 'ready');
    if (!list.length) return 'No launch needs action right now.';
    const byOwner = new Map<string, LaunchRow[]>();
    for (const l of list) byOwner.set(l.owner ?? 'Launch manager', [...(byOwner.get(l.owner ?? 'Launch manager') ?? []), l]);
    return [
      'Who needs to act, with the date that matters:',
      [...byOwner].map(([owner, ls]) => `- **${owner}**: ${ls.map((l) => `${l.name} (${l.main_risk}; software must be ready by ${d(l.software_cutoff)})`).join('; ')}`).join('\n'),
    ].join('\n\n');
  }

  function platformSummary(id: string): string {
    const p = call<Platform>('get_platform_software', { platform: id });
    const late = p.teams.filter((t) => t.code && !t.code.submitted && t.code.expected && t.code.due && t.code.expected > t.code.due);
    const crit = p.critical_tickets;
    return [
      `**${p.platform}**${p.new_platform ? ' (new platform)' : ''} is used by ${p.launches.map((l) => `${l.name} (${d(l.launch_date)}, ${LABEL[l.status]})`).join(', ')}.`,
      `- Testing: ${p.testing_started ? `started ${d(p.testing_started)}` : `starts ${d(p.computed_test_start)}${p.testing_days_late ? `, ${p.testing_days_late} days after the plan (${d(p.planned_test_start)})` : ' as planned'}`}`,
      `- Software ready: ${range(p.software_ready)}`,
      `- Code: ${late.length ? `late from ${late.map((t) => `${t.team} (expected ${d(t.code?.expected)}, due ${d(t.code?.due)})`).join(', ')}` : 'no late submissions'}`,
      `- Critical bugs open: ${crit.length ? crit.map((t) => `${t.title} (${t.team}, ${t.age_days} days old)`).join('; ') : 'none'}`,
    ].join('\n');
  }

  function partSummary(id: string): string {
    const p = call<PartSupply>('get_part_supply', { part_id: id });
    const free = p.stock.reduce((n, s) => n + s.free, 0);
    const problems = p.builds_in_need_order.filter((b) => b.status !== 'ready');
    return [
      `**${p.name}** (${p.part_id}): ${free.toLocaleString('en-US')} free in stock, ${p.shipments.length} shipment${p.shipments.length === 1 ? '' : 's'}.`,
      p.shipments.map((s) => `- ${s.shipment_id}: ${s.qty.toLocaleString('en-US')} for ${s.bought_for}, ${s.current ? `due ${d(s.current)}` : 'no date'}${s.planned && s.current && s.planned !== s.current ? ` (planned ${d(s.planned)})` : ''}, ${s.status}`).join('\n'),
      problems.length ? `Builds at risk: ${problems.map((b) => `${b.build} (needs ${b.qty.toLocaleString('en-US')} by ${d(b.needed_by)}${b.short ? `, ${b.short.toLocaleString('en-US')} short` : ''})`).join('; ')}.` : 'Every build that uses it is covered.',
    ].join('\n\n');
  }

  function whatIf(): string {
    const mode = has(/reject|fail|inspection|defect/) ? 'reject' : has(/no date|lose|lost|withdraw|unconfirmed|without a date/) ? 'lose_date' : 'delay';
    let days = mode === 'delay' ? daysIn(q) : 0;
    const assumed = mode === 'delay' && days === undefined;
    if (assumed) days = 14;
    let id = shipmentId;
    if (!id && part) {
      const ships = data.deliveries.filter((x) => x.part === part && x.status !== 'rejected' && (mode !== 'delay' || x.eta));
      const pick = ships.find((x) => platform && x.forChipset === platform) ?? ships.find((x) => !platform && x.forChipset && data.chipsets.find((c) => c.id === x.forChipset)?.isNew) ?? ships[0];
      id = pick?.id;
    }
    if (!id) return `I couldn't find a shipment of that part to test. Try naming the part and platform, e.g. "what if the USB 3.2 controller shipment for Volga-X is 5 weeks late?"`;
    const input = { shipment_id: id, change: mode, days: Math.max(-14, Math.min(60, days ?? 0)), launch_id: '', launch_shift_days: 0 };
    const w = call<WhatIf>('simulate_what_if', input);
    if ('error' in (w as object)) return `I couldn't simulate that: ${(w as unknown as { error: string }).error}.`;
    call('propose_what_if', input);
    const parts = [
      `**What if: ${w.what_if}**${assumed ? ' (I assumed 2 weeks; name a number of days or weeks to change it)' : ''}.`,
      w.launches_changed.length
        ? w.launches_changed.map((c) => `- **${c.name}**: ${LABEL[c.status_now]} → **${LABEL[c.status_after]}**, software ready ${range(c.software_ready_after)}. ${c.explanation_after}`).join('\n')
        : 'No launch changes status or software date: the plan absorbs it.',
      'This was a preview; nothing has changed. Apply it below to see it across every view.',
    ];
    return parts.join('\n\n');
  }

  function whatIfHelp(): string {
    const named = data.parts.filter((p) => !p.id.startsWith('SOC-')).map((p) => p.name.toLowerCase());
    return `Which shipment should I test? Name a part (${named.slice(0, 5).join(', ')}, …) and how it changes, e.g. "what if the Wi-Fi 6 shipment is 3 weeks late?" or "what if the mini-LED drivers fail inspection?"`;
  }

  function rules(r: Rules, query: string): string {
    const pick = /software|ready date|test/.test(query) ? [r.software, r.cutoff] : /suppl|part|stock|allocat/.test(query) ? [r.supply] : /recover|option/.test(query) ? [r.recovery] : [r.software, r.cutoff, r.supply, r.launch];
    return pick.map((p) => `- ${p}`).join('\n');
  }

  function help(unsure = false): string {
    return [
      unsure ? "I didn't catch what that's about. In free mode I answer questions like these:" : 'In free mode I answer questions like these, straight from the plan:',
      [
        '- "Which launches need attention?"',
        '- "Why is Halo 77 at risk?" or "Tell me about Volga-X"',
        '- "What if the Wi-Fi 6 shipment is 3 weeks late?"',
        '- "How do we recover?" and "Who needs to act?"',
        '- "How is the software-ready date calculated?"',
        '- "When will the eARC issue be fixed?" or "Tell me about NWV-4211"',
        '- "How is the test lab doing?" or "Why is the Display code late?"',
        '- "Where is shipment DL-UC3-01?"',
      ].join('\n'),
      'You can also press S to simulate a disruption, then ask again.',
    ].join('\n\n');
  }
}
