// Runs the LaunchReady agent on one or all demo scenarios and records each run
// to runs/<scenario>.json, which the web app replays step by step.
//
//   ANTHROPIC_API_KEY=... node agent/run.mjs            # all three scenarios
//   ANTHROPIC_API_KEY=... node agent/run.mjs usbDelay   # just one
//   AGENT_MODEL=claude-opus-5-5 node agent/run.mjs      # pick the model
//
// How it works (a plain "manual" agent loop):
//   1. Apply the scenario to the fictional data.
//   2. Send Claude the event and the tool list.
//   3. Whenever Claude asks for a tool, run it in code (agent/tools.js) and send
//      back the result. Repeat until Claude calls propose_plan.
//   4. Save every step (reasoning summary, tool call, tool result, plan).
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadData } from '../src/data.js';
import { SCENARIOS } from '../src/scenarios.js';
import { TOOL_DEFS, runTool } from './tools.js';

const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';
const MAX_TURNS = 16;

const SYSTEM = `You are the launch-readiness agent for Northwind Vision, a fictional TV maker (all data is fictional).
When something changes, investigate its effect on both sides of each launch, software readiness and supply, using the tools.

Rules:
- Every date, quantity and status you state must come from a tool result. Never estimate or do your own arithmetic; if you need a number, call a tool.
- Look at both sides: a parts problem can delay test boards, which delays testing and the software-ready date.
- Before recommending an option, check it with check_substitute, simulate_move_stock or simulate_move_launch, and check that it does not create a new problem for another model.
- Stock can never be promised twice. If an option leaves a gap or depends on something uncertain (for example a delivery with no date), say so plainly.
- You only propose. A human approves the plan and decides who to contact. Draft short, factual messages to the owners (roles, not names).
- Finish by calling propose_plan exactly once.`;

const tools = TOOL_DEFS.map((t) => ({ ...t, strict: true }));
const client = new Anthropic();

async function runScenario(key) {
  const scenario = SCENARIOS[key];
  const data = scenario.apply(await loadData());
  const steps = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, requests: 0 };
  const messages = [{ role: 'user', content: `Event (as of ${data.config.asOf}): ${scenario.summary}\nInvestigate the impact on our launches and propose a plan.` }];
  let plan = null;

  for (let turn = 0; turn < MAX_TURNS && !plan; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium' },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    usage.requests++;
    usage.input_tokens += response.usage.input_tokens ?? 0;
    usage.output_tokens += response.usage.output_tokens ?? 0;
    usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === 'refusal') throw new Error(`refused: ${JSON.stringify(response.stop_details)}`);
    if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');

    messages.push({ role: 'assistant', content: response.content }); // keep thinking blocks intact
    const results = [];
    for (const block of response.content) {
      if (block.type === 'thinking' && block.thinking) steps.push({ type: 'thinking', text: block.thinking });
      if (block.type === 'text' && block.text.trim()) steps.push({ type: 'text', text: block.text });
      if (block.type === 'tool_use') {
        const output = runTool(data, block.name, block.input);
        steps.push({ type: 'tool', name: block.name, input: block.input, output });
        if (block.name === 'propose_plan') plan = block.input;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
      }
    }
    if (results.length) messages.push({ role: 'user', content: results });
    else if (!plan) messages.push({ role: 'user', content: 'Please finish by calling propose_plan.' });
  }
  if (!plan) throw new Error(`no plan after ${MAX_TURNS} turns`);

  const record = {
    scenario: key, title: scenario.title, summary: scenario.summary,
    model: MODEL, recorded_at: new Date().toISOString(),
    label: 'Real agent run, recorded during the build and replayed',
    usage, steps, plan,
  };
  mkdirSync(new URL('../runs/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../runs/${key}.json`, import.meta.url), JSON.stringify(record, null, 2) + '\n');
  console.log(`${key}: ${steps.filter((s) => s.type === 'tool').length} tool calls, ${usage.requests} requests, ${usage.input_tokens} in / ${usage.output_tokens} out tokens`);
  return usage;
}

const keys = process.argv[2] ? [process.argv[2]] : Object.keys(SCENARIOS);
for (const k of keys) {
  if (!SCENARIOS[k]) throw new Error(`unknown scenario ${k}; choose from ${Object.keys(SCENARIOS).join(', ')}`);
  await runScenario(k);
}
