// The assistant's tool loop, driven by a scripted fake model.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { runTurn, type StreamFn } from '../src/agent/loop';
import { MAX_TOOL_ROUNDS } from '../src/agent/assistant';
import type { ToolOutcome } from '../src/agent/runAssistantTool';

type Block = Anthropic.Beta.BetaContentBlock;
const msg = (content: Block[], stop_reason: Anthropic.Beta.BetaMessage['stop_reason']): Anthropic.Beta.BetaMessage =>
  ({ id: 'msg', type: 'message', role: 'assistant', model: 'm', content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 } }) as unknown as Anthropic.Beta.BetaMessage;
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: object) => ({ type: 'tool_use', id, name, input }) as unknown as Block;

/** A fake model that replays a script and records each request. */
function scripted(replies: Anthropic.Beta.BetaMessage[]) {
  const requests: Anthropic.Beta.MessageCreateParamsStreaming[] = [];
  const stream: StreamFn = async (params, onText) => {
    requests.push(structuredClone(params));
    const reply = replies.shift();
    if (!reply) throw new Error('script exhausted');
    for (const b of reply.content) if (b.type === 'text') onText(b.text);
    return reply;
  };
  return { stream, requests };
}
const noopEvents = { onText: () => {}, onToolStart: () => {}, onToolEnd: () => {} };
const ok = (result: unknown): ToolOutcome => ({ result });

test('runs the tools the model asks for, returns all results in one message, then answers', async () => {
  const { stream, requests } = scripted([
    msg([text('Checking. '), toolUse('a', 'get_plan_overview', {}), toolUse('b', 'get_launch_details', { launch_id: 'HAL-77' })], 'tool_use'),
    msg([text('Halo 77" is at risk.')], 'end_turn'),
  ]);
  const ran: string[] = [];
  let streamed = '';
  const r = await runTurn([{ role: 'user', content: 'Why?' }], stream, (name) => { ran.push(name); return ok({ name }); }, { ...noopEvents, onText: (d) => { streamed += d; } });
  assert.equal(r.end, 'answered');
  assert.deepEqual(ran, ['get_plan_overview', 'get_launch_details']);
  assert.equal(streamed, 'Checking. Halo 77" is at risk.');
  assert.equal(requests.length, 2);
  const results = requests[1].messages.at(-1)!;
  assert.equal(results.role, 'user');
  assert.deepEqual((results.content as Anthropic.Beta.BetaToolResultBlockParam[]).map((b) => b.tool_use_id), ['a', 'b']);
  assert.equal(r.messages.length, 4); // question, tool calls, results, answer
  assert.deepEqual(r.usage, { input: 20, output: 10, cacheRead: 6, calls: 2 });
});

test('tool errors go back as is_error results instead of breaking the turn', async () => {
  const { stream, requests } = scripted([msg([toolUse('a', 'boom', {})], 'tool_use'), msg([text('Sorry.')], 'end_turn')]);
  const r = await runTurn([{ role: 'user', content: 'x' }], stream, () => { throw new Error('kaput'); }, noopEvents);
  assert.equal(r.end, 'answered');
  const result = (requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
  assert.equal(result.is_error, true);
  assert.match(String(result.content), /kaput/);
});

test('a refusal ends the turn, runs no tools and keeps the partial turn out of history', async () => {
  const { stream } = scripted([msg([toolUse('a', 'get_plan_overview', {})], 'refusal')]);
  let ran = 0;
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: 'x' }];
  const r = await runTurn(history, stream, () => { ran++; return ok(1); }, noopEvents);
  assert.equal(r.end, 'refusal');
  assert.equal(ran, 0);
  assert.deepEqual(r.messages, history);
});

test('a tool call cut off at max_tokens is never run', async () => {
  const { stream } = scripted([msg([toolUse('a', 'simulate_what_if', { shipment_id: 'DL' })], 'max_tokens')]);
  let ran = 0;
  const r = await runTurn([{ role: 'user', content: 'x' }], stream, () => { ran++; return ok(1); }, noopEvents);
  assert.equal(r.end, 'max_tokens');
  assert.equal(ran, 0);
});

test('stops after the round limit even if the model keeps calling tools', async () => {
  const replies = Array.from({ length: MAX_TOOL_ROUNDS + 2 }, (_, i) => msg([toolUse(`t${i}`, 'get_plan_overview', {})], 'tool_use'));
  const { stream, requests } = scripted(replies);
  const r = await runTurn([{ role: 'user', content: 'x' }], stream, () => ok(1), noopEvents);
  assert.equal(r.end, 'round_limit');
  assert.equal(requests.length, MAX_TOOL_ROUNDS + 1);
});

test('the history passed in is not mutated', async () => {
  const { stream } = scripted([msg([text('hi')], 'end_turn')]);
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: 'x' }];
  await runTurn(history, stream, () => ok(1), noopEvents);
  assert.equal(history.length, 1);
});
