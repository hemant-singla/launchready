// The in-app assistant: its instructions, tool definitions and request shape.
//
// Shared by the browser (which runs the tools against the live workspace) and
// the proxy (which rebuilds every request from these constants, so a caller
// can't swap in another prompt, model or tool set). Keep everything here
// deterministic: the system prompt and tools form the cached prefix.
import type Anthropic from '@anthropic-ai/sdk';

export const ASSISTANT_MODEL = 'claude-sonnet-5-5';
/** Output cap per model call; answers are short, tool inputs tiny. */
export const ASSISTANT_MAX_TOKENS = 8000;
/** Tool rounds allowed for one question before the loop stops. */
export const MAX_TOOL_ROUNDS = 8;
/** Server-side refusal fallback (routes a declined request to Anthropic's recommended model). */
export const ASSISTANT_BETAS = ['server-side-fallback-2026-07-01'];

export const SYSTEM_PROMPT = `You are the assistant inside LaunchReady, a launch-readiness tool for a TV maker. The company (Northwind Vision) and all data are fictional.

LaunchReady joins two things: software readiness (code submissions, test cycles, bug backlogs per chip platform) and parts supply (stock, supplier shipments, allocation). The key link: test boards need parts, so a late shipment can delay testing, which delays the software-ready date, which can make a launch miss its cutoff (software must be ready a set number of days before launch).

How to answer:
- Every date, quantity, status and day count you state must come from a tool result in this conversation. Never estimate or do date arithmetic yourself; if you need a number, call a tool. If no tool can answer, say so.
- The user can change the plan between messages (apply disruptions, approve recovery actions). Each user message starts with a note describing the current state; call tools again rather than reusing older results when the state may have changed.
- Find ids with tools before using them: launches (e.g. HAL-77) from get_plan_overview, shipments from find_shipments, recovery options from get_recovery_options.
- Use plain language: say "USB 3.2 controller" rather than only "UC-300", and "platform" for chipset. Format dates like "18 Jan". Keep answers short: lead with the answer, then the reason as a short chain (parts → testing → software → launch) when it helps.
- For "what if" questions, use simulate_what_if; it changes nothing.
- You never change the plan. When the user wants to apply a what-if or approve a recovery option, call propose_what_if or propose_recovery: the app shows the user a button and nothing happens until they click it. Say that in one short sentence.
- Recovery options are produced by a tested search, not by you. Explain them, compare them and recommend one with its trade-off; don't invent other actions as if the tool had checked them. You may mention escalation (asking the supplier to expedite) as a non-modelled step.
- Stay on LaunchReady and launch planning. For unrelated requests, say briefly that you can only help with this plan.`;

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});

const WHAT_IF_PROPS = {
  shipment_id: { type: 'string', description: 'Shipment (delivery) id from find_shipments, e.g. DL-UC3-01.' },
  change: {
    type: 'string',
    enum: ['delay', 'reject', 'lose_date'],
    description: 'delay = arrives N days late (negative = early); reject = fails inspection; lose_date = supplier withdraws the date.',
  },
  days: { type: 'integer', description: 'Days late for change=delay (-14 to 60). Use 0 for the other changes.' },
  launch_id: { type: 'string', description: 'Optionally also move one launch: its id (e.g. HAL-77), or "" for none.' },
  launch_shift_days: { type: 'integer', description: 'Days to move that launch (-21 to 42; positive = later). 0 for none.' },
};

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_plan_overview',
    description:
      'Current status of every launch (Ready / At risk / Blocked) with launch date, software-ready range, buffer days before the cutoff, main risk, owner, and how each compares with the original plan. Also lists the active disruptions and approved actions. Start here.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'get_launch_details',
    description:
      'Everything about one launch: a plain-language explanation, the dependency chain (test boards → testing → software → production parts → launch) with each step\'s status, all findings from both sides, and the parts it needs.',
    strict: true,
    input_schema: obj({ launch_id: { type: 'string', description: 'Launch (model) id, e.g. HAL-77.' } }),
  },
  {
    name: 'get_platform_software',
    description:
      'Software side for one chip platform: code submissions vs deadline per team, testing start (planned vs computed), software-ready range, open tickets by team and severity, fix backlog in days, and which launches use it.',
    strict: true,
    input_schema: obj({ platform: { type: 'string', description: 'Platform (chipset) id, e.g. Volga-X.' } }),
  },
  {
    name: 'get_part_supply',
    description:
      'Supply side for one part: free stock, every shipment of it (planned vs current date, status, which platform it was bought for), approved substitutes, and how the part is allocated to builds in need-date order.',
    strict: true,
    input_schema: obj({ part_id: { type: 'string', description: 'Part id, e.g. UC-300. Use find_shipments to find ids from a name.' } }),
  },
  {
    name: 'find_shipments',
    description:
      'Search supplier shipments by part name, part id, supplier, platform or shipment id (case-insensitive; empty query lists all). Returns ids, part, quantity, dates, status and what each feeds.',
    strict: true,
    input_schema: obj({ query: { type: 'string', description: 'e.g. "usb", "wi-fi 6", "Volga-X", "DL-MLD-03", or "".' } }),
  },
  {
    name: 'simulate_what_if',
    description:
      'Preview a disruption on top of the current plan without changing anything: a shipment arriving late or early, failing inspection, or losing its date, optionally with one launch moved. Returns the launches whose status or dates would change. Replaces any custom what-if currently applied (preset disruptions and approvals stay).',
    strict: true,
    input_schema: obj(WHAT_IF_PROPS),
  },
  {
    name: 'get_recovery_options',
    description:
      'For launches that are worse than the original plan: the recovery options found by the tested search (re-allocate an order, approved substitute, move the launch), each with its result per launch, trade-off, approver and anything left open; the options ruled out and why; and an escalation note if nothing fully resolves it.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'explain_rules',
    description: 'How the verdicts are calculated (software range, cutoff buffer, allocation order, Ready / At risk / Blocked rules) with the current thresholds.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'propose_what_if',
    description:
      'Offer to apply a what-if to the plan. The app shows the user a button; nothing changes unless they click it. Use only when the user asks to apply or try it in the app.',
    strict: true,
    input_schema: obj(WHAT_IF_PROPS),
  },
  {
    name: 'propose_recovery',
    description:
      'Offer to approve one recovery option. The app shows the user an Approve button; nothing changes unless they click it. Use only when the user asks to approve or apply an option.',
    strict: true,
    input_schema: obj({ option_key: { type: 'string', description: 'The option key from get_recovery_options, e.g. "t:DL-UC3-04:Volga-X".' } }),
  },
];

/**
 * The request for one model call. The browser sends this; the proxy ignores
 * everything but `messages` and rebuilds it with this same function.
 */
export function buildParams(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.MessageCreateParamsStreaming {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: ASSISTANT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    betas: ASSISTANT_BETAS,
    fallbacks: 'default',
    stream: true,
  };
}
