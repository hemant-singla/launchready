// Free mode: questions answered from the plan without a model.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadData } from '../src/engine/data';
import { computeAll } from '../src/engine/compute';
import type { ScenarioKey } from '../src/engine/scenarios';
import { answerOffline } from '../src/agent/offline';
import type { AgentContext } from '../src/agent/runAssistantTool';

const base = loadData();
const baseline = computeAll(base);
const ctx = (scenarios: ScenarioKey[] = []): AgentContext => ({ base, baseline, state: { scenarios, lab: null, actions: [] } });
const ask = (q: string, scenarios: ScenarioKey[] = []) => answerOffline(q, ctx(scenarios));
const tools = (q: string, scenarios: ScenarioKey[] = []) => ask(q, scenarios).steps.map((s) => s.name);

test('overview lists the launches that need attention with owners', () => {
  const a = ask('Which launches need attention right now, and why?');
  assert.deepEqual(a.steps.map((s) => s.name), ['get_plan_overview']);
  assert.match(a.text, /12 of 16 launches are on track/);
  assert.match(a.text, /Zenith 55".*critical bug/);
  assert.match(a.text, /Lumen 65".*Display code late/);
});

test('"why" about a launch explains it and walks the chain, including two named sizes', () => {
  const halo = ask('Why is Halo 77" at risk now?', ['usbDelay']);
  assert.match(halo.text, /testing starts 26 days late/);
  assert.match(halo.text, /chain breaks at \*\*test boards\*\*/);
  const zen = ask('Why are the Zenith 55" and 65" at risk?');
  assert.equal(zen.steps.filter((s) => s.name === 'get_launch_details').length, 2);
  assert.match(zen.text, /Zenith 65"/);
});

test('a what-if picks the right shipment, previews it and offers to apply it', () => {
  const a = ask('What happens if the USB 3.2 controller shipment for Volga-X is 5 weeks late?');
  assert.deepEqual(a.steps.map((s) => s.name), ['simulate_what_if', 'propose_what_if']);
  assert.deepEqual(a.steps[0].input, { shipment_id: 'DL-UC3-01', change: 'delay', days: 35, launch_id: '', launch_shift_days: 0 });
  assert.match(a.text, /Halo 77".*Ready → \*\*At risk\*\*/);
  assert.equal(a.steps[1].outcome.proposal?.kind, 'what-if');

  const reject = ask('what if the mini-led drivers fail inspection');
  assert.equal(reject.steps[0].input.change, 'reject');
  assert.match(reject.text, /Zenith 75".*Blocked/);

  const assumed = ask('what if wi-fi 6 is late');
  assert.equal(assumed.steps[0].input.days, 14);
  assert.match(assumed.text, /assumed 2 weeks/);
});

test('recovery ranks the tested options and offers the recommended one', () => {
  const a = ask('What are my options to recover, and which do you recommend?', ['usbDelay']);
  assert.deepEqual(a.steps.map((s) => s.name), ['get_recovery_options', 'propose_recovery']);
  assert.match(a.text, /1\. \*\*Borrow 20 USB 3.2 controllers from the Rhine-L order\*\* \(recommended\)/);
  assert.match(a.text, /\(partial fix\)/);
  assert.equal(a.steps[1].outcome.proposal?.kind, 'recovery');
  assert.match(ask('how do we recover?').text, /nothing to recover/i);
});

test('do nothing, owners, platforms, parts and rules', () => {
  assert.match(ask('What happens if we do nothing?', ['usbDelay']).text, /\*\*Halo 77"\*\* stays at risk.*the 11 Jan cutoff \(4 days late\)/);
  assert.match(ask('Which teams need to act, and by when?').text, /\*\*Display team\*\*: Lumen 65"/);
  assert.match(ask('tell me about volga-x').text, /\*\*Volga-X\*\* \(new platform\)/);
  assert.match(ask('wifi 6').text, /Wi-Fi 6 module/);
  assert.deepEqual(tools('How is the software-ready date calculated?'), ['explain_rules']);
  assert.match(ask('How is the software-ready date calculated?').text, /7 days before launch/);
});

test('unrelated questions get help, not a guess, and nothing ever changes the plan', () => {
  const a = ask('what is the weather');
  assert.equal(a.steps.length, 0);
  assert.match(a.text, /didn't catch/);
  const c = ctx(['usbDelay']);
  const before = JSON.stringify(c);
  for (const q of ['how do we recover', 'what if usb is 3 weeks late', 'why is halo 77 at risk']) answerOffline(q, c);
  assert.equal(JSON.stringify(c), before);
});
