// The assistant end to end, with the Claude API replaced by scripted
// server-sent-event streams. Checks the full browser path: streaming text,
// tool calls run against the live plan, results sent back, and a proposal
// that changes the plan only when the user clicks it.
import { expect, test, type Page, type Route } from '@playwright/test';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: object };

/** One streamed assistant message in the SSE shape the API sends. */
function sse(blocks: Block[], stop: 'end_turn' | 'tool_use'): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev('message_start', {
    message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } },
  });
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      out += ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      for (const chunk of b.text.match(/.{1,24}/gs) ?? []) out += ev('content_block_delta', { index, delta: { type: 'text_delta', text: chunk } });
    } else {
      out += ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      out += ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    out += ev('content_block_stop', { index });
  });
  out += ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 42 } });
  out += ev('message_stop', {});
  return out;
}

/** Serve the scripted replies in order and keep each request body. */
async function mockClaude(page: Page, replies: string[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/v1/messages**', async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    const body = replies.shift() ?? sse([{ type: 'text', text: 'No more scripted replies.' }], 'end_turn');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
  });
  return bodies;
}

test.beforeEach(async ({ context }) => {
  // Own-key mode (no proxy configured in tests); the key never leaves the mock.
  await context.addInitScript(() => sessionStorage.setItem('lr-anthropic-key', 'sk-ant-test'));
});

test('answers a question by looking up the live plan', async ({ page }) => {
  const bodies = await mockClaude(page, [
    sse([{ type: 'text', text: 'Let me check Halo 77". ' }, { type: 'tool_use', id: 'toolu_1', name: 'get_launch_details', input: { launch_id: 'HAL-77' } }], 'tool_use'),
    sse([{ type: 'text', text: '**Halo 77" is at risk.** Its test boards wait on a late USB 3.2 controller shipment:\n\n- testing starts 26 days late\n- software lands after the 11 Jan cutoff' }], 'end_turn'),
  ]);
  await page.goto('/#/app/launches?w=eyJzIjpbInVzYkRlbGF5Il19');
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Ask LaunchReady' });
  await expect(panel.getByText('Why is Halo 77" at risk now?')).toBeVisible();
  await panel.getByText('Why is Halo 77" at risk now?').click();

  await expect(panel.getByText('Looked up a launch')).toBeVisible();
  await expect(panel.locator('strong', { hasText: 'Halo 77" is at risk.' })).toBeVisible();
  await expect(panel.locator('.md li')).toHaveCount(2);

  // First request: fixed model and tools, and the question carries the app state.
  expect(bodies[0].model).toBe('claude-sonnet-5-5');
  expect((bodies[0].tools as unknown[]).length).toBe(14);
  expect(JSON.stringify(bodies[0].messages)).toContain('[App state] Disruptions: The USB 3.2 controller shipment');
  // Second request: the tool ran in the browser against the disrupted plan.
  const toolResult = JSON.stringify((bodies[1].messages as { content: unknown }[]).at(-1));
  expect(toolResult).toContain('toolu_1');
  expect(toolResult).toContain('testing starts 26 days late');
});

test('a proposed recovery changes the plan only after the user approves it', async ({ page }) => {
  await mockClaude(page, [
    sse([{ type: 'tool_use', id: 'toolu_1', name: 'get_recovery_options', input: {} }], 'tool_use'),
    sse([{ type: 'tool_use', id: 'toolu_2', name: 'propose_recovery', input: { option_key: 't:DL-UC3-04:Volga-X' } }], 'tool_use'),
    sse([{ type: 'text', text: 'Borrowing 20 chips from the Rhine-L order brings Halo 77" back to Ready. Click Approve to apply it.' }], 'end_turn'),
  ]);
  await page.goto('/#/app/launches?w=eyJzIjpbInVzYkRlbGF5Il19');
  await page.getByRole('button', { name: 'Ask AI' }).click();
  const panel = page.getByRole('complementary', { name: 'Ask LaunchReady' });
  await panel.getByRole('textbox', { name: 'Ask a question' }).fill('Fix it with the best option');
  await panel.getByRole('button', { name: 'Send' }).click();

  const card = panel.locator('.proposal');
  await expect(card).toContainText('Approve this recovery?');
  await expect(card).toContainText('Borrow 20 USB 3.2 controllers from the Rhine-L order');
  // Nothing has changed yet.
  await expect(page.getByRole('region', { name: 'Impact of the current disruption' })).toContainText('1 launch hit');

  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Done');
  await expect(page.getByRole('region', { name: 'Impact of the current disruption' })).toContainText('No launch is worse than the original plan');
});

test('without a key or proxy, free mode answers from the plan and never calls the API', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/v1/messages**', (route) => { apiCalls++; return route.abort(); });
  await page.addInitScript(() => sessionStorage.removeItem('lr-anthropic-key'));
  await page.goto('/#/app/launches?w=eyJzIjpbInVzYkRlbGF5Il19');
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Ask LaunchReady' });
  await expect(panel.getByText('Free mode', { exact: true })).toBeVisible();

  await panel.getByText('What are my options to recover, and which do you recommend?').click();
  await expect(panel.getByText('Ran the recovery search')).toBeVisible();
  const card = panel.locator('.proposal');
  await expect(card).toContainText('Borrow 20 USB 3.2 controllers from the Rhine-L order');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('region', { name: 'Impact of the current disruption' })).toContainText('No launch is worse than the original plan');

  // Claude stays available behind a link.
  await panel.getByRole('button', { name: 'use Claude with your own API key' }).click();
  await expect(panel.getByRole('heading', { name: 'Use Claude' })).toBeVisible();
  await panel.getByRole('button', { name: 'Back to free mode' }).click();
  await expect(panel.getByText('Free mode', { exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});

test('API errors are shown with a retry, not a crash', async ({ page }) => {
  await page.route('**/v1/messages**', (route) =>
    route.fulfill({ status: 429, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }) }),
  );
  await page.goto('/#/app/launches');
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Ask LaunchReady' });
  await panel.getByRole('textbox', { name: 'Ask a question' }).fill('hello');
  await panel.getByRole('textbox', { name: 'Ask a question' }).press('Enter');
  await expect(panel.getByText('Too many questions in a short time')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
});
