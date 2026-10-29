// One assistant turn: stream a model call, run any tools it asks for against
// the live workspace, send the results back, repeat until it answers.
// Transport-agnostic (the caller supplies `stream`), so it is unit-tested with
// a fake model and runs unchanged against the proxy or the API directly.
import type Anthropic from '@anthropic-ai/sdk';
import { buildParams, MAX_TOOL_ROUNDS } from './assistant';
import type { ToolOutcome } from './runAssistantTool';

type Message = Anthropic.Beta.BetaMessage;
type MessageParam = Anthropic.Beta.BetaMessageParam;

export type StreamFn = (params: Anthropic.Beta.MessageCreateParamsStreaming, onText: (delta: string) => void) => Promise<Message>;

export interface TurnEvents {
  onText: (delta: string) => void;
  onToolStart: (call: { id: string; name: string; input: unknown }) => void;
  onToolEnd: (call: { id: string; name: string; outcome: ToolOutcome }) => void;
}

export type TurnEnd =
  | 'answered'
  /** The model declined (after any server-side fallback). Its partial output is dropped from history. */
  | 'refusal'
  /** Output cap reached; a truncated tool call is never run. */
  | 'max_tokens'
  /** Too many tool rounds for one question. */
  | 'round_limit';

export interface TurnResult {
  /** The conversation after this turn, to send with the next question. */
  messages: MessageParam[];
  end: TurnEnd;
  usage: { input: number; output: number; cacheRead: number; calls: number };
}

export async function runTurn(
  history: MessageParam[],
  stream: StreamFn,
  runTool: (name: string, input: unknown) => ToolOutcome,
  events: TurnEvents,
): Promise<TurnResult> {
  const messages = [...history];
  const usage = { input: 0, output: 0, cacheRead: 0, calls: 0 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await stream(buildParams(messages), events.onText);
    usage.calls++;
    usage.input += message.usage.input_tokens ?? 0;
    usage.output += message.usage.output_tokens ?? 0;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;

    // A refusal can cut a tool call off mid-input: never run it, and keep the
    // partial turn out of history so the next question starts clean.
    if (message.stop_reason === 'refusal') return { messages, end: 'refusal', usage };

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (message.stop_reason === 'max_tokens' && toolUses.length) return { messages, end: 'max_tokens', usage };

    // Append the full content (thinking blocks included) unchanged.
    messages.push({ role: 'assistant', content: message.content });
    if (message.stop_reason === 'pause_turn') continue;
    if (!toolUses.length) return { messages, end: message.stop_reason === 'max_tokens' ? 'max_tokens' : 'answered', usage };
    if (round === MAX_TOOL_ROUNDS) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((call) => {
      events.onToolStart({ id: call.id, name: call.name, input: call.input });
      let outcome: ToolOutcome;
      try {
        outcome = runTool(call.name, call.input);
      } catch (err) {
        outcome = { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
      }
      events.onToolEnd({ id: call.id, name: call.name, outcome });
      return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(outcome.result), ...(outcome.isError ? { is_error: true } : {}) };
    });
    // All results go back in one message, so parallel calls stay parallel.
    messages.push({ role: 'user', content: results });
  }
  return { messages, end: 'round_limit', usage };
}
