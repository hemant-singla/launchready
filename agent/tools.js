// Tools the AI agent can call. Each tool is a thin wrapper over the same
// logic the app and tests use (src/). The agent never does arithmetic itself:
// every number it sees comes back from one of these functions.
import { computeAll } from '../src/engine.js';
import { openTickets } from '../src/software.js';
import { substituteCheck } from '../src/substitute.js';
import { reassignDelivery, moveLaunch } from '../src/scenarios.js';
import { addDays } from '../src/dates.js';

const brief = (m) => ({
  model: m.id, name: m.name, chipset: m.chipset, launch: m.launchDate, status: m.status,
  software: m.software.status, supply: m.supply.status,
  software_ready: m.eta.known ? [m.eta.early, m.eta.late] : 'unknown',
  reasons: [...m.software.reasons, ...m.supply.reasons],
});

/** Status of every model before vs after an edit, listing only the ones that changed. */
function diff(before, after) {
  return after.models.map((m) => {
    const b = before.models.find((x) => x.id === m.id);
    return { model: m.id, before: b.status, after: m.status, software_ready_after: m.eta.known ? [m.eta.early, m.eta.late] : 'unknown', reasons_after: [...m.software.reasons, ...m.supply.reasons] };
  }).filter((x) => x.before !== x.after || x.model === after._focus);
}

export const TOOL_DEFS = [
  {
    name: 'get_launch_overview',
    description: 'Readiness verdict for every TV model (Ready / At risk / Blocked) with reasons from software and supply. Start here.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_chipset_software',
    description: 'Software side for one chipset: code submissions vs deadline, test start (planned vs computed), test-board readiness, open tickets by team/severity, fix backlog in days, and the software-ready date range.',
    input_schema: { type: 'object', properties: { chipset: { type: 'string', description: 'e.g. Volga-X' } }, required: ['chipset'], additionalProperties: false },
  },
  {
    name: 'get_part_supply',
    description: 'Supply side for one part: free stock by warehouse, deliveries (planned vs current date, status, which chipset they were bought for), approved substitutes, and how the part is shared out across builds in need-date order.',
    input_schema: { type: 'object', properties: { part: { type: 'string', description: 'e.g. UC-300' } }, required: ['part'], additionalProperties: false },
  },
  {
    name: 'check_substitute',
    description: 'If the approved substitute part is used for a chipset\'s test boards, what happens to the test start and each model\'s verdict? Includes the driver-change time.',
    input_schema: { type: 'object', properties: { chipset: { type: 'string' } }, required: ['chipset'], additionalProperties: false },
  },
  {
    name: 'simulate_move_stock',
    description: 'What-if: move some units of an incoming delivery to another chipset\'s program. Recalculates every model and returns the ones whose verdict changes (never double-counts stock). Does not change anything for real.',
    input_schema: {
      type: 'object',
      properties: { delivery_id: { type: 'string' }, qty: { type: 'integer', minimum: 1 }, to_chipset: { type: 'string' } },
      required: ['delivery_id', 'qty', 'to_chipset'], additionalProperties: false,
    },
  },
  {
    name: 'simulate_move_launch',
    description: 'What-if: move one model\'s launch date. Recalculates and returns the verdict change. Does not change anything for real.',
    input_schema: {
      type: 'object',
      properties: { model: { type: 'string', description: 'model id, e.g. HAL-77' }, new_launch_date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['model', 'new_launch_date'], additionalProperties: false,
    },
  },
  {
    name: 'propose_plan',
    description: 'Finish by proposing a plan for a human to approve. Call exactly once, at the end. Use only numbers returned by the other tools.',
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'One sentence: what happened and which launches it affects.' },
        impact: { type: 'array', items: { type: 'string' }, description: 'The chain of impact, step by step, with dates and quantities from tools.' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, result: { type: 'string', description: 'Verdicts after this option, from a simulation tool.' },
              tradeoffs: { type: 'string' }, remaining_gap: { type: 'string', description: 'What is still not covered or uncertain; "none" only if a tool showed it.' },
            },
            required: ['name', 'result', 'tradeoffs', 'remaining_gap'], additionalProperties: false,
          },
        },
        recommendation: { type: 'string' },
        uncertainties: { type: 'array', items: { type: 'string' } },
        messages: {
          type: 'array', description: 'Draft messages to owners. They are only sent after human approval.',
          items: {
            type: 'object',
            properties: { to: { type: 'string', description: 'A role, e.g. "USB team lead" or "Procurement planner"' }, subject: { type: 'string' }, body: { type: 'string' } },
            required: ['to', 'subject', 'body'], additionalProperties: false,
          },
        },
      },
      required: ['headline', 'impact', 'options', 'recommendation', 'uncertainties', 'messages'], additionalProperties: false,
    },
  },
];

/** Run one tool against a dataset. Returns a plain object (serialised to JSON for the model). */
export function runTool(data, name, input) {
  const r = computeAll(data);
  switch (name) {
    case 'get_launch_overview':
      return { as_of: data.config.asOf, rules: { buffer_days: data.config.bufferDays, production_parts_needed_days_before_launch: data.config.productionLeadDays }, models: r.models.map(brief) };

    case 'get_chipset_software': {
      const c = r.chipsets[input.chipset];
      if (!c) return { error: `unknown chipset ${input.chipset}; known: ${Object.keys(r.chipsets).join(', ')}` };
      const tickets = openTickets(data, c.id);
      return {
        chipset: c.id, new_chipset: c.isNew, code_deadline: c.codeDeadline, planned_test_start: c.plannedTestStart,
        test_boards_needed: c.testBoards, test_boards_ready: c.testStartedOn ? 'testing already started' : (c.boardsReadyDate ?? 'not covered by supply'),
        computed_test_start: c.eta.testStart, software_ready: c.eta.known ? [c.eta.early, c.eta.late] : 'unknown',
        submissions: data.submissions.filter((s) => s.chipset === c.id).map(({ team, dueDate, submittedOn, expectedOn, newCodePct }) => ({ team, due: dueDate, submitted: submittedOn, expected: expectedOn, new_code_pct: newCodePct })),
        open_tickets_by_team: Object.fromEntries(data.teams.map((t) => {
          const mine = tickets.filter((x) => x.team === t.id);
          return [t.id, { critical: mine.filter((x) => x.severity === 'critical').length, major: mine.filter((x) => x.severity === 'major').length, minor: mine.filter((x) => x.severity === 'minor').length, backlog_days: c.eta.backlog[t.id].days, fix_capacity: t.fixCapacity }];
        })),
        models: r.models.filter((m) => m.chipset === c.id).map(brief),
      };
    }

    case 'get_part_supply': {
      const part = data.parts.find((p) => p.id === input.part);
      if (!part) return { error: `unknown part ${input.part}` };
      return {
        part: part.id, name: part.name,
        stock: data.stock.filter((s) => s.part === part.id).map((s) => ({ warehouse: s.warehouse, on_hand: s.onHand, already_allocated: s.allocated, free: s.onHand - s.allocated })),
        deliveries: data.deliveries.filter((d) => d.part === part.id).map((d) => ({ id: d.id, qty: d.qty, planned: d.originalEta, current: d.eta ?? 'NO DATE', status: d.status, bought_for: d.forChipset ?? 'any', note: d.note })),
        substitutes: data.substitutes.filter((s) => s.part === part.id || s.substitute === part.id),
        builds_in_need_order: r.lines.filter((l) => l.part === part.id).map((l) => ({
          build: l.kind === 'test-boards' ? `${l.chipset} test boards` : l.model, need_by: l.needDate, qty: l.qty,
          covered_from: l.allocations.map((a) => ({ source: a.source, qty: a.qty, arrives: a.date })), shortfall: l.shortfall, status: l.status,
        })),
      };
    }

    case 'check_substitute':
      return substituteCheck(data, input.chipset);

    case 'simulate_move_stock': {
      let edited;
      try { edited = reassignDelivery(data, input.delivery_id, input.qty, input.to_chipset); } catch (e) { return { error: e.message }; }
      return { edit: input, changed: diff(r, computeAll(edited)) };
    }

    case 'simulate_move_launch': {
      let edited;
      try { edited = moveLaunch(data, input.model, input.new_launch_date); } catch (e) { return { error: e.message }; }
      const after = computeAll(edited);
      after._focus = input.model;
      return { edit: input, software_must_be_ready_by: addDays(input.new_launch_date, -data.config.bufferDays), changed: diff(r, after) };
    }

    case 'propose_plan':
      return { ok: true, note: 'Plan recorded. Waiting for human approval; nothing has been sent.' };

    default:
      return { error: `unknown tool ${name}` };
  }
}
