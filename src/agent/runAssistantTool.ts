// Runs the assistant's tools against a snapshot of the workspace. Pure: it
// rebuilds every result from the state it's given, so the answer always
// matches what the user sees, and nothing here changes the plan.
import { addDays, daysBetween } from '../engine/dates';
import { applyLab, explain, linesFor, type Lab, type LabMode } from '../engine/lab';
import { affectedBy, computeWith, recoveryOptions, type Action } from '../engine/recovery';
import { SCENARIOS, type ScenarioKey } from '../engine/scenarios';
import { openTickets } from '../engine/software';
import { stockSummary } from '../engine/supply';
import type { Dataset, ModelResult, Result } from '../engine/types';
import { chainFor } from '../app/lib/chain';
import { mainRisk, softwareSlack } from '../app/lib/format';
import { optionName } from '../app/lib/options';

/** The parts of the workspace the tools depend on. */
export interface AgentState {
  scenarios: ScenarioKey[];
  lab: Lab | null;
  actions: Action[];
}

export interface AgentContext {
  state: AgentState;
  base: Dataset;
  baseline: Result;
}

/** A change the assistant offers; the app turns it into a button. */
export type Proposal =
  | { kind: 'what-if'; lab: Lab; summary: string }
  | { kind: 'recovery'; optionKey: string; summary: string };

export interface ToolOutcome {
  /** JSON-serialisable result for the model. */
  result: unknown;
  isError?: boolean;
  proposal?: Proposal;
}

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const fail = (message: string): ToolOutcome => ({ result: { error: message }, isError: true });

const MODES: Record<string, LabMode> = { delay: 'delay', reject: 'reject', lose_date: 'nodate' };
const DELAY: [number, number] = [-14, 60];
const SHIFT: [number, number] = [-21, 42];

function disruptedData(ctx: AgentContext, lab = ctx.state.lab): Dataset {
  let d = ctx.base;
  for (const k of ctx.state.scenarios) d = SCENARIOS[k].apply(d);
  return lab ? applyLab(d, lab) : d;
}

function current(ctx: AgentContext) {
  const disrupted = disruptedData(ctx);
  const { data, result } = computeWith(disrupted, ctx.state.actions);
  return { disrupted, data, result };
}

const partName = (data: Dataset, id: string) => data.parts.find((p) => p.id === id)?.name ?? id;

function launchSummary(m: ModelResult, before: ModelResult, result: Result, data: Dataset) {
  const risk = mainRisk(m, result, data);
  return {
    launch_id: m.id,
    name: m.name,
    platform: m.chipset,
    new_platform: data.chipsets.find((c) => c.id === m.chipset)?.isNew ?? false,
    launch_date: m.launchDate,
    status: m.status,
    original_status: before.status,
    original_launch_date: before.launchDate !== m.launchDate ? before.launchDate : undefined,
    software_ready: m.eta.known ? { earliest: m.eta.early, latest: m.eta.late } : 'unknown',
    software_cutoff: addDays(m.launchDate, -data.config.bufferDays),
    buffer_days_before_cutoff: softwareSlack(data, m),
    main_risk: risk?.label ?? null,
    owner: risk?.owner ?? null,
  };
}

/** Parse what-if input shared by simulate_what_if and propose_what_if. */
function parseWhatIf(input: Input, data: Dataset): Lab | string {
  const delivery = data.deliveries.find((d) => d.id.toLowerCase() === str(input.shipment_id).toLowerCase());
  if (!delivery) return `unknown shipment "${str(input.shipment_id)}"; use find_shipments to look up ids`;
  const mode = MODES[str(input.change)];
  if (!mode) return 'change must be delay, reject or lose_date';
  const delay = mode === 'delay' ? int(input.days) : 0;
  if (delay < DELAY[0] || delay > DELAY[1]) return `days must be between ${DELAY[0]} and ${DELAY[1]}`;
  if (mode === 'delay' && !delivery.eta) return `${delivery.id} has no date to move; use lose_date or reject instead`;
  const launchId = str(input.launch_id);
  const model = launchId ? data.models.find((m) => m.id.toLowerCase() === launchId.toLowerCase()) : undefined;
  if (launchId && !model) return `unknown launch "${launchId}"; use get_plan_overview to look up ids`;
  const shift = model ? int(input.launch_shift_days) : 0;
  if (shift < SHIFT[0] || shift > SHIFT[1]) return `launch_shift_days must be between ${SHIFT[0]} and ${SHIFT[1]}`;
  return { delivery: delivery.id, mode, delay, model: model?.id ?? data.models[0].id, shift };
}

function describeWhatIf(lab: Lab, data: Dataset): string {
  const d = data.deliveries.find((x) => x.id === lab.delivery)!;
  const what = `${partName(data, d.part)} shipment ${d.id}`;
  const parts = [
    lab.mode === 'reject' ? `${what} fails inspection`
      : lab.mode === 'nodate' ? `${what} loses its date`
        : lab.delay ? `${what} ${lab.delay > 0 ? `${lab.delay} days late` : `${-lab.delay} days early`}` : `${what} on time`,
  ];
  if (lab.shift) parts.push(`${data.models.find((m) => m.id === lab.model)?.name} launch moved ${lab.shift > 0 ? '+' : ''}${lab.shift} days`);
  return parts.join('; ');
}

export function runAssistantTool(name: string, rawInput: unknown, ctx: AgentContext): ToolOutcome {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Input;
  const { base, baseline } = ctx;
  const { disrupted, data, result } = current(ctx);
  const before = (id: string) => baseline.models.find((m) => m.id === id)!;

  switch (name) {
    case 'get_plan_overview': {
      const disruptions = [
        ...ctx.state.scenarios.map((k) => SCENARIOS[k].summary),
        ...(ctx.state.lab ? [describeWhatIf(ctx.state.lab, base)] : []),
      ];
      const counts = (r: Result) => ({
        ready: r.models.filter((m) => m.status === 'ready').length,
        at_risk: r.models.filter((m) => m.status === 'at-risk').length,
        blocked: r.models.filter((m) => m.status === 'blocked').length,
      });
      return {
        result: {
          company: data.config.company,
          data_as_of: data.config.asOf,
          active_disruptions: disruptions,
          approved_actions: ctx.state.actions.length,
          counts_now: counts(result),
          counts_original_plan: counts(baseline),
          launches_worse_than_plan: affectedBy(baseline, result).models,
          launches: [...result.models]
            .sort((a, b) => a.launchDate.localeCompare(b.launchDate))
            .map((m) => launchSummary(m, before(m.id), result, data)),
        },
      };
    }

    case 'get_launch_details': {
      const id = str(input.launch_id).toLowerCase();
      const m = result.models.find((x) => x.id.toLowerCase() === id || x.name.toLowerCase().replace(/"/g, '') === id.replace(/"/g, ''));
      if (!m) return fail(`unknown launch "${str(input.launch_id)}"; use get_plan_overview to look up ids`);
      const b = before(m.id);
      return {
        result: {
          ...launchSummary(m, b, result, data),
          explanation: explain(m, result, data),
          chain: chainFor(m, result, data, { m: b, r: baseline, data: base }).map((s) => ({
            step: s.name, status: s.status, value: s.value, detail: s.sub, original_value: s.was,
          })),
          software_findings: m.software.reasons,
          supply_findings: m.supply.reasons,
          parts: linesFor(m, result).map((l) => ({
            build: l.kind === 'test-boards' ? `${l.chipset} test boards` : 'production',
            part_id: l.part, part: partName(data, l.part), qty: l.qty, needed_by: l.needDate,
            status: l.status, short: l.shortfall, arriving_late: l.lateQty, days_late: l.lateDays,
            substitute_available: l.substitute?.part ?? null,
          })),
        },
      };
    }

    case 'get_platform_software': {
      const c = Object.values(result.chipsets).find((x) => x.id.toLowerCase() === str(input.platform).toLowerCase());
      if (!c) return fail(`unknown platform "${str(input.platform)}"; known: ${Object.keys(result.chipsets).join(', ')}`);
      const tickets = openTickets(data, c.id);
      return {
        result: {
          platform: c.id, new_platform: c.isNew, test_boards: c.testBoards,
          code_deadline: c.codeDeadline, planned_test_start: c.plannedTestStart,
          testing_started: c.testStartedOn,
          computed_test_start: c.eta.testStart, test_start_latest: c.eta.testStartLatest ?? null,
          testing_days_late: c.eta.slipDays ?? null,
          software_ready: c.eta.known ? { earliest: c.eta.early, latest: c.eta.late } : 'unknown',
          unknown_because: c.eta.known ? undefined : c.eta.notes,
          using_substitute: c.usingSubstitute,
          launches: result.models.filter((m) => m.chipset === c.id).map((m) => ({ launch_id: m.id, name: m.name, launch_date: m.launchDate, status: m.status })),
          teams: data.teams.map((t) => {
            const s = data.submissions.find((x) => x.chipset === c.id && x.team === t.id);
            const mine = tickets.filter((x) => x.team === t.id);
            return {
              team: t.name,
              code: s ? (s.submittedOn ? { submitted: s.submittedOn } : { expected: s.expectedOn, due: s.dueDate }) : null,
              team_note: s?.note ? { text: s.note, on: s.updatedOn } : undefined,
              new_code_pct: s?.newCodePct ?? null,
              open_tickets: { critical: mine.filter((x) => x.severity === 'critical').length, major: mine.filter((x) => x.severity === 'major').length, minor: mine.filter((x) => x.severity === 'minor').length },
              fix_backlog_days: c.eta.backlog[t.id]?.days ?? null,
            };
          }),
          critical_tickets: tickets.filter((t) => t.severity === 'critical').map((t) => ({ id: t.id, team: t.team, title: t.title, age_days: t.ageDays, fix_date: t.eta ?? null })),
          committed_fix_dates: c.eta.known ? { count: c.eta.committedFixes, latest: c.eta.lastCommittedFix } : undefined,
        },
      };
    }

    case 'get_part_supply': {
      const q = str(input.part_id).toLowerCase();
      const part = data.parts.find((p) => p.id.toLowerCase() === q) ?? data.parts.find((p) => p.name.toLowerCase() === q);
      if (!part) return fail(`unknown part "${str(input.part_id)}"; use find_shipments to look up part ids`);
      return {
        result: {
          part_id: part.id, name: part.name,
          stock: stockSummary(data).filter((s) => s.part === part.id).map((s) => ({ warehouse: data.warehouses.find((w) => w.id === s.warehouse)?.name ?? s.warehouse, on_hand: s.onHand, allocated: s.allocated, free: s.free })),
          shipments: data.deliveries.filter((d) => d.part === part.id).map((d) => ({ shipment_id: d.id, qty: d.qty, planned: d.originalEta, current: d.eta, status: d.status, bought_for: d.forChipset ?? 'any', note: d.note || undefined })),
          substitutes: data.substitutes.filter((s) => s.part === part.id || s.substitute === part.id).map((s) => ({ part: s.part, substitute: s.substitute, approved_for: s.approvedFor, driver_team: s.driverTeam, driver_change_days: s.driverChangeDays, validation_days: s.validationDays ?? [0, 0] })),
          builds_in_need_order: result.lines.filter((l) => l.part === part.id).map((l) => ({
            build: l.kind === 'test-boards' ? `${l.chipset} test boards` : data.models.find((m) => m.id === l.model)?.name,
            needed_by: l.needDate, qty: l.qty, status: l.status, short: l.shortfall,
            covered_from: l.allocations.map((a) => ({ source: a.source, qty: a.qty, arrives: a.date })),
          })),
        },
      };
    }

    case 'search_issues': {
      const q = str(input.query).toLowerCase();
      const plat = str(input.platform).toLowerCase();
      const team = str(input.team).toLowerCase();
      const src = str(input.source) || 'any';
      const state = str(input.state) || 'open';
      const rank = { critical: 0, major: 1, minor: 2 };
      const rows = data.tickets
        .filter((t) => (state === 'all' || t.status === state) && (src === 'any' || t.source === src) && (!plat || t.chipset.toLowerCase() === plat) && (!team || t.team.toLowerCase() === team))
        .filter((t) => !q || q.split(/\s+/).every((w) => `${t.id} ${t.title} ${t.component ?? ''} ${t.triage?.signature ?? ''}`.toLowerCase().includes(w)))
        .sort((a, b) => rank[a.severity] - rank[b.severity] || a.openedOn.localeCompare(b.openedOn));
      return {
        result: {
          matches: rows.length,
          issues: rows.slice(0, 25).map((t) => ({
            issue_id: t.id, title: t.title, platform: t.chipset, team: t.team, severity: t.severity, source: t.source,
            tvs_reporting: t.report?.units, stage: t.workflow, opened: t.openedOn, age_days: t.status === 'open' ? daysBetween(data.config.asOf, t.openedOn) : undefined,
            latest_comment: t.comments?.at(-1), fix_date: t.status === 'fixed' ? { fixed_on: t.fixedOn } : t.eta ?? 'no date yet',
          })),
          note: rows.length > 25 ? `Showing 25 of ${rows.length}; narrow the search.` : undefined,
        },
      };
    }

    case 'get_issue': {
      const t = data.tickets.find((x) => x.id.toLowerCase() === str(input.issue_id).toLowerCase());
      if (!t) return fail(`unknown issue "${str(input.issue_id)}"; use search_issues to find ids`);
      const suite = t.testCase ? data.testSuites.find((x) => x.id === t.testCase!.suite) : undefined;
      const chip = result.chipsets[t.chipset];
      return {
        result: {
          issue_id: t.id, title: t.title, platform: t.chipset, team: t.team, component: t.component, severity: t.severity, stage: t.workflow, opened: t.openedOn, fixed: t.fixedOn,
          source: t.source,
          customer_report: t.report,
          found_by_test: suite && t.testCase ? { suite: suite.name, failed_step: suite.steps[t.testCase.step], steps_before_passed: suite.steps.slice(0, t.testCase.step), run: t.testCase.runId } : undefined,
          tv_log: t.log, log_line_matched: t.triage ? t.log?.[t.triage.line] : undefined,
          routing: t.triage,
          timeline: t.comments,
          fix_date: t.status === 'fixed' ? null : t.eta ?? 'no date yet (the plan uses the standard fix time for its severity)',
          verification_days: data.config.verifyDays,
          platform_software_ready: chip?.eta.known ? { earliest: chip.eta.early, latest: chip.eta.late } : 'unknown',
          launches_on_platform: result.models.filter((m) => m.chipset === t.chipset).map((m) => ({ name: m.name, launch_date: m.launchDate, status: m.status })),
        },
      };
    }

    case 'get_test_lab_summary': {
      const plat = str(input.platform).toLowerCase();
      const runs = data.testRuns.filter((r) => !plat || r.chipset.toLowerCase() === plat);
      if (!runs.length) return fail(`no test runs${plat ? ` for ${str(input.platform)} (testing may not have started)` : ''}`);
      const asOf = data.config.asOf;
      const week = runs.filter((r) => daysBetween(asOf, r.startedOn) < 7);
      const done = (rs: typeof runs) => rs.filter((r) => r.result !== 'running');
      const rate = (rs: typeof runs) => { const d = done(rs); return d.length ? Math.round((d.filter((r) => r.result === 'pass').length / d.length) * 100) : null; };
      return {
        result: {
          platforms_in_testing: [...new Set(runs.map((r) => r.chipset))],
          last_7_days: { hours_tested: week.reduce((n, r) => n + r.hours, 0), runs_finished: done(week).length, pass_rate_pct: rate(week), new_issues: week.filter((r) => r.newIssue).reduce((n, r) => n + r.ticketIds.length, 0) },
          running_now: runs.filter((r) => r.result === 'running').length,
          suites: data.testSuites.map((st) => {
            const rs = runs.filter((r) => r.suite === st.id);
            return { suite: st.name, hours: st.hours, runs: rs.length, pass_rate_pct: rate(rs), issues_found: data.tickets.filter((t) => t.testCase?.suite === st.id && (!plat || t.chipset.toLowerCase() === plat)).length };
          }),
          latest_failures: runs.filter((r) => r.result === 'fail').slice(-6).reverse().map((r) => {
            const st = data.testSuites.find((x) => x.id === r.suite)!;
            return { run: r.id, suite: st.name, platform: r.chipset, date: r.startedOn, failed_step: r.failedStep !== null ? st.steps[r.failedStep] : null, issue: r.ticketIds[0], new_issue: r.newIssue };
          }),
        },
      };
    }

    case 'get_shipment': {
      const d = data.deliveries.find((x) => x.id.toLowerCase() === str(input.shipment_id).toLowerCase());
      if (!d) return fail(`unknown shipment "${str(input.shipment_id)}"; use find_shipments to look up ids`);
      const sup = data.suppliers.find((s) => s.id === d.supplier);
      return {
        result: {
          shipment_id: d.id, part: partName(data, d.part), qty: d.qty, status: d.status, planned_arrival: d.originalEta, current_arrival: d.eta, bought_for: d.forChipset ?? 'any',
          latest_update: d.lastUpdate, purchase_order: d.po, transport: d.transport,
          tracking: d.events?.map((e) => ({ date: e.at, step: e.stage, text: e.text, planned: e.planned })),
          inspection: d.inspection,
          supplier: sup && { name: sup.name, region: sup.region, on_time_rate_pct: sup.onTimeRate !== undefined ? Math.round(sup.onTimeRate * 100) : undefined, avg_delay_days: sup.avgDelayDays, defect_ppm: sup.defectPpm, lead_time_days: sup.leadTimeDays, latest_note: sup.latestNote },
          feeds: result.lines.flatMap((l) => l.allocations.filter((a) => a.source === d.id).map((a) => ({ build: l.kind === 'test-boards' ? `${l.chipset} test boards` : data.models.find((m) => m.id === l.model)?.name, qty: a.qty, needed_by: l.needDate, arrives: a.date, status: l.status }))),
        },
      };
    }

    case 'find_shipments': {
      const q = str(input.query).toLowerCase();
      const feeds = (id: string) => [...new Set(result.lines.filter((l) => l.allocations.some((a) => a.source === id))
        .map((l) => (l.kind === 'test-boards' ? `${l.chipset} test boards` : data.models.find((m) => m.id === l.model)?.name ?? '')))];
      const rows = data.deliveries
        .map((d) => ({ d, text: `${d.id} ${d.part} ${partName(data, d.part)} ${data.suppliers.find((s) => s.id === d.supplier)?.name ?? ''} ${d.forChipset ?? ''}`.toLowerCase() }))
        .filter(({ text }) => !q || q.split(/\s+/).every((w) => text.includes(w)))
        .map(({ d }) => ({
          shipment_id: d.id, part_id: d.part, part: partName(data, d.part),
          supplier: data.suppliers.find((s) => s.id === d.supplier)?.name ?? d.supplier,
          qty: d.qty, planned: d.originalEta, current: d.eta, status: d.status,
          days_late: d.eta && d.originalEta ? daysBetween(d.eta, d.originalEta) : null,
          bought_for: d.forChipset ?? 'any', feeds: feeds(d.id),
        }));
      return { result: { matches: rows.length, shipments: rows } };
    }

    case 'simulate_what_if': {
      const lab = parseWhatIf(input, base);
      if (typeof lab === 'string') return fail(lab);
      const { data: afterData, result: after } = computeWith(disruptedData(ctx, lab), ctx.state.actions);
      const changed = after.models
        .map((m) => ({ m, now: result.models.find((x) => x.id === m.id)! }))
        .filter(({ m, now }) => m.status !== now.status || m.eta.late !== now.eta.late || m.launchDate !== now.launchDate)
        .map(({ m, now }) => ({
          launch_id: m.id, name: m.name,
          status_now: now.status, status_after: m.status,
          launch_date_after: m.launchDate,
          software_ready_now: now.eta.known ? { earliest: now.eta.early, latest: now.eta.late } : 'unknown',
          software_ready_after: m.eta.known ? { earliest: m.eta.early, latest: m.eta.late } : 'unknown',
          explanation_after: explain(m, after, afterData),
        }));
      return {
        result: {
          what_if: describeWhatIf(lab, base),
          replaces_current_custom_what_if: ctx.state.lab ? describeWhatIf(ctx.state.lab, base) : null,
          launches_changed: changed,
          note: changed.length ? undefined : 'No launch changes status or software date.',
          applied: false,
        },
      };
    }

    case 'get_recovery_options': {
      const rec = recoveryOptions(baseline, disrupted, ctx.state.actions);
      if (!rec.affected.models.length) return { result: { launches_needing_recovery: [], note: 'No launch is worse than the original plan, so there is nothing to recover.' } };
      const brief = (o: (typeof rec.options)[number]) => ({
        option_key: o.key, kind: o.type, action: optionName(o, data), action_ids: o.title, detail: o.detail, trade_offs: o.tradeoffs, approval: o.approval,
        launch_date_change_days: o.type === 'moveLaunch' ? o.days : 0,
        results: o.models.map((x) => ({ launch_id: x.id, name: x.name, status_now: x.disrupted, status_after: x.after, original_status: x.original, back_to_plan: x.restored, software_ready_after: x.eta })),
        testing_start: o.testStarts.map((t) => ({ platform: t.id, now: t.before, after: t.after, planned: t.planned })),
        still_open: o.remaining.map((r) => r.reason),
      });
      return {
        result: {
          launches_needing_recovery: rec.affected.models,
          options_ranked: rec.options.map(brief),
          recommended: rec.recommended?.key ?? null,
          ruled_out: rec.considered.map((o) => ({ action: optionName(o, data), why: o.why })),
          escalation: rec.escalation,
        },
      };
    }

    case 'explain_rules': {
      const c = data.config;
      return {
        result: {
          software: `Testing starts at the latest of: planned start, code complete + ${c.boardBringUpDays} days bring-up, test boards available. Software-ready is a range: the later of (test window + stabilisation) and (open-ticket fix days divided by team capacity), at the optimistic and pessimistic ends. Test window: ${c.testWindowDays.new} days for new platforms, ${c.testWindowDays.reused} for reused. Fix days per ticket: critical ${c.fixDays.critical.join('–')}, major ${c.fixDays.major.join('–')}, minor ${c.fixDays.minor.join('–')}.`,
          cutoff: `Software must be ready ${c.bufferDays} days before launch. Ready: latest date meets the cutoff, no late code, no open critical tickets. At risk: the range straddles the cutoff or there are late code / critical tickets. Blocked: even the earliest date is after launch, or the date can't be calculated.`,
          supply: `Parts are allocated once each, in need-date order (test boards first on a tie). Test boards are needed by the planned test start; production parts ${c.productionLeadDays} days before launch. Orders bought for a platform go to it first. Rejected and undated shipments never count. Late, tight (< ${c.tightDeliveryDays} days), substitute-dependent or undated coverage is At risk; uncovered parts, or production parts more than ${c.productionSlackDays} days late, are Blocked.`,
          launch: 'A launch takes the worse of its software and supply status.',
          recovery: `Options: re-allocate units of the same part from an order bought for another program (${c.transferDays}-day transfer), an approved substitute (driver change before testing plus validation), or the earliest later launch date within ${c.maxLaunchMoveDays} days. Each is recalculated against every launch; options that don't help or that hurt another launch are ruled out.`,
        },
      };
    }

    case 'propose_what_if': {
      const lab = parseWhatIf(input, base);
      if (typeof lab === 'string') return fail(lab);
      const summary = describeWhatIf(lab, base);
      return { result: { shown_to_user: true, applied: false, summary }, proposal: { kind: 'what-if', lab, summary } };
    }

    case 'propose_recovery': {
      const key = str(input.option_key);
      const rec = recoveryOptions(baseline, disrupted, ctx.state.actions);
      const opt = rec.options.find((o) => o.key === key);
      if (!opt) return fail(`no current recovery option with key "${key}"; call get_recovery_options for the current keys`);
      const summary = optionName(opt, data);
      return { result: { shown_to_user: true, applied: false, action: summary }, proposal: { kind: 'recovery', optionKey: key, summary } };
    }

    default:
      return fail(`unknown tool ${name}`);
  }
}
